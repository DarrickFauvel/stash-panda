import { Router } from 'express'
import { db } from '../db/client.ts'
import { requireAuth } from '../middleware/auth.ts'

const router = Router()

// GET /api/invite/:token — get invite details (no auth required)
router.get('/:token', async (req, res) => {
  const tokenParam = req.params.token as string
  try {
    const result = await db.execute({
      sql: `SELECT it.token, it.role, it.email,
                   i.id AS inventory_id, i.name AS inventory_name,
                   u.name AS invited_by_name
            FROM invite_tokens it
            JOIN inventories i ON i.id = it.inventory_id
            JOIN users u ON u.id = it.invited_by
            WHERE it.token = ? AND it.expires_at > unixepoch() AND it.used_at IS NULL`,
      args: [tokenParam],
    })
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Invite not found or expired' })
    }
    const { token, role, email, inventory_id, inventory_name, invited_by_name } = result.rows[0]
    res.json({
      token,
      role,
      email,
      galaxy: { id: inventory_id, name: inventory_name },
      invited_by_name,
    })
  } catch (err) {
    console.error('get invite:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/invite/:token/accept — accept the invite (auth required)
router.post('/:token/accept', requireAuth, async (req, res) => {
  const { token } = req.params as Record<string, string>
  try {
    const result = await db.execute({
      sql: `SELECT * FROM invite_tokens
            WHERE token = ? AND expires_at > unixepoch() AND used_at IS NULL`,
      args: [token],
    })
    const invite = result.rows[0]
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found or expired' })
    }

    // Already a member — mark used and redirect gracefully
    const existing = await db.execute({
      sql: 'SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ?',
      args: [invite.inventory_id, req.user!.id],
    })
    if (existing.rows[0]) {
      await db.execute({
        sql: 'UPDATE invite_tokens SET used_at = unixepoch() WHERE token = ?',
        args: [token],
      })
      return res.json({ galaxy_id: invite.inventory_id, already_member: true })
    }

    await db.batch([
      {
        sql: 'INSERT INTO inventory_members (inventory_id, user_id, role) VALUES (?, ?, ?)',
        args: [invite.inventory_id, req.user!.id, invite.role],
      },
      {
        sql: 'UPDATE invite_tokens SET used_at = unixepoch() WHERE token = ?',
        args: [token],
      },
    ])

    res.json({ galaxy_id: invite.inventory_id, role: invite.role })
  } catch (err) {
    console.error('accept invite:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
