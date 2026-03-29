import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { db } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'

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

    // TODO: send email verification link with verifyToken

    const token = jwt.sign(
      { id, email: email.toLowerCase(), name: name.trim() },
      process.env.JWT_SECRET,
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
      sql: 'SELECT id, name, email, password_hash FROM users WHERE email = ?',
      args: [email.toLowerCase()],
    })
    const user = result.rows[0]

    // Use constant-time comparison even on missing user to avoid timing attacks
    const hash = user?.password_hash ?? '$2b$12$invalidhashpadding000000000000000000000000000000000000'
    const valid = await bcrypt.compare(password, hash)
    if (!user || !valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } })
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
      args: [req.user.id],
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
      // TODO: send password reset email with resetToken
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

export default router
