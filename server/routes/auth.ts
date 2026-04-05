import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { unlink } from 'fs/promises'
import { join, extname } from 'path'
import multer from 'multer'
import { db } from '../db/client.ts'
import { requireAuth } from '../middleware/auth.ts'
import { sendVerificationEmail, sendPasswordResetEmail } from '../email.ts'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `avatar-${randomUUID()}${extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
})

const router = Router()

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  try {
    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email.toLowerCase()],
    })
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    const id = randomUUID()
    const passwordHash = await bcrypt.hash(password, 12)
    const verifyToken = randomUUID()

    await db.execute({
      sql: `INSERT INTO users (id, name, email, password_hash, email_verify_token)
            VALUES (?, ?, ?, ?, ?)`,
      args: [id, name.trim(), email.toLowerCase(), passwordHash, verifyToken],
    })

    sendVerificationEmail(email.toLowerCase(), name.trim(), verifyToken)

    const token = jwt.sign(
      { id, email: email.toLowerCase(), name: name.trim() },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    )
    res.status(201).json({ token, user: { id, name: name.trim(), email: email.toLowerCase() } })
  } catch (err) {
    console.error('signup:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  try {
    const result = await db.execute({
      sql: 'SELECT id, name, email, password_hash, avatar_url FROM users WHERE email = ?',
      args: [email.toLowerCase()],
    })
    const user = result.rows[0]

    // Use constant-time comparison even on missing user to avoid timing attacks
    const hash = user?.password_hash ?? '$2b$12$invalidhashpadding000000000000000000000000000000000000'
    const valid = await bcrypt.compare(password, hash as string)
    if (!user || !valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    )
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url ?? null } })
  } catch (err) {
    console.error('login:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT id, name, email, email_verified, created_at FROM users WHERE id = ?',
      args: [req.user!.id],
    })
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' })
    res.json({ user: result.rows[0] })
  } catch (err) {
    console.error('me:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' })

  // Always return success to prevent email enumeration
  try {
    const result = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email.toLowerCase()],
    })
    if (result.rows[0]) {
      const resetToken = randomUUID()
      const expires = Math.floor(Date.now() / 1000) + 3600 // 1 hour
      await db.execute({
        sql: 'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE email = ?',
        args: [resetToken, expires, email.toLowerCase()],
      })
      sendPasswordResetEmail(email.toLowerCase(), resetToken)
    }
  } catch (err) {
    console.error('forgot-password:', err)
  }

  res.json({ message: 'If that email is registered, you will receive a reset link shortly.' })
})

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  try {
    const result = await db.execute({
      sql: 'SELECT id FROM users WHERE password_reset_token = ? AND password_reset_expires > ?',
      args: [token, Math.floor(Date.now() / 1000)],
    })
    if (!result.rows[0]) {
      return res.status(400).json({ error: 'Invalid or expired reset token' })
    }
    const hash = await bcrypt.hash(password, 12)
    await db.execute({
      sql: `UPDATE users
            SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL,
                updated_at = unixepoch()
            WHERE id = ?`,
      args: [hash, result.rows[0].id],
    })
    res.json({ message: 'Password updated. Please log in.' })
  } catch (err) {
    console.error('reset-password:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/auth/profile
router.patch('/profile', requireAuth, async (req, res) => {
  const { name, currentPassword, newPassword } = req.body

  if (name !== undefined && !name?.trim()) {
    return res.status(400).json({ error: 'Name cannot be empty' })
  }
  if (newPassword !== undefined) {
    if (!currentPassword) return res.status(400).json({ error: 'Current password is required' })
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' })
  }

  try {
    const result = await db.execute({
      sql: 'SELECT id, name, email, password_hash, avatar_url FROM users WHERE id = ?',
      args: [req.user!.id],
    })
    const user = result.rows[0]
    if (!user) return res.status(404).json({ error: 'User not found' })

    if (newPassword) {
      const valid = await bcrypt.compare(currentPassword, user.password_hash as string)
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' })
    }

    const updates: string[] = ['updated_at = unixepoch()']
    const args: unknown[] = []

    if (name?.trim()) { updates.push('name = ?'); args.push(name.trim()) }
    if (newPassword)  { updates.push('password_hash = ?'); args.push(await bcrypt.hash(newPassword, 12)) }

    args.push(req.user!.id)
    await db.execute({ sql: `UPDATE users SET ${updates.join(', ')} WHERE id = ?`, args })

    const newName = name?.trim() ?? (user.name as string)
    const token = jwt.sign(
      { id: req.user!.id, email: req.user!.email, name: newName },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    )
    res.json({ token, user: { id: req.user!.id, name: newName, email: req.user!.email, avatar_url: user.avatar_url ?? null } })
  } catch (err) {
    console.error('profile patch:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/auth/avatar
router.post('/avatar', requireAuth, avatarUpload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' })

  try {
    // Delete old avatar file if it was a local upload
    const existing = await db.execute({
      sql: 'SELECT avatar_url FROM users WHERE id = ?',
      args: [req.user!.id],
    })
    const oldUrl = existing.rows[0]?.avatar_url as string | null
    if (oldUrl?.startsWith('/uploads/')) {
      const oldPath = join(UPLOAD_DIR, oldUrl.replace('/uploads/', ''))
      unlink(oldPath).catch(() => {})
    }

    const url = `/uploads/${req.file.filename}`
    await db.execute({
      sql: 'UPDATE users SET avatar_url = ?, updated_at = unixepoch() WHERE id = ?',
      args: [url, req.user!.id],
    })

    const userResult = await db.execute({
      sql: 'SELECT id, name, email, avatar_url FROM users WHERE id = ?',
      args: [req.user!.id],
    })
    const user = userResult.rows[0]
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    )
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar_url: url } })
  } catch (err) {
    console.error('avatar upload:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/auth/avatar
router.delete('/avatar', requireAuth, async (req, res) => {
  try {
    const existing = await db.execute({
      sql: 'SELECT avatar_url FROM users WHERE id = ?',
      args: [req.user!.id],
    })
    const oldUrl = existing.rows[0]?.avatar_url as string | null
    if (oldUrl?.startsWith('/uploads/')) {
      const oldPath = join(UPLOAD_DIR, oldUrl.replace('/uploads/', ''))
      unlink(oldPath).catch(() => {})
    }

    await db.execute({
      sql: 'UPDATE users SET avatar_url = NULL, updated_at = unixepoch() WHERE id = ?',
      args: [req.user!.id],
    })

    const token = jwt.sign(
      { id: req.user!.id, email: req.user!.email, name: req.user!.name },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    )
    res.json({ token, user: { id: req.user!.id, name: req.user!.name, email: req.user!.email, avatar_url: null } })
  } catch (err) {
    console.error('avatar delete:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/auth/verify-email?token=:token
router.get('/verify-email', async (req, res) => {
  const token = req.query.token as string
  if (!token) return res.status(400).json({ error: 'Token is required' })

  try {
    const result = await db.execute({
      sql: 'SELECT id FROM users WHERE email_verify_token = ?',
      args: [token],
    })
    if (!result.rows[0]) {
      return res.status(400).json({ error: 'Invalid or already used verification token' })
    }
    await db.execute({
      sql: 'UPDATE users SET email_verified = 1, email_verify_token = NULL WHERE id = ?',
      args: [result.rows[0].id],
    })
    res.json({ message: 'Email verified.' })
  } catch (err) {
    console.error('verify-email:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
