import { Router } from 'express'
import { randomUUID } from 'crypto'
import { db } from '../db/client.ts'
import { requireAuth } from '../middleware/auth.ts'
import { sendInviteEmail } from '../email.ts'
import itemsRouter from './items.ts'

const router = Router()

// Items are nested: /api/inventories/:inventoryId/items
router.use('/:inventoryId/items', itemsRouter)

// GET /api/inventories
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT i.id, i.name, i.owner_id, im.role, i.created_at,
                   (SELECT COUNT(*) FROM items WHERE inventory_id = i.id) AS item_count
            FROM inventories i
            JOIN inventory_members im ON im.inventory_id = i.id AND im.user_id = ?
            ORDER BY i.name ASC`,
      args: [req.user!.id],
    })
    res.json({ inventories: result.rows })
  } catch (err) {
    console.error('list inventories:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/inventories
router.post('/', requireAuth, async (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })

  try {
    const id = randomUUID()
    await db.batch([
      {
        sql: 'INSERT INTO inventories (id, name, owner_id) VALUES (?, ?, ?)',
        args: [id, name.trim(), req.user!.id],
      },
      {
        sql: 'INSERT INTO inventory_members (inventory_id, user_id, role) VALUES (?, ?, ?)',
        args: [id, req.user!.id, 'owner'],
      },
    ])
    res.status(201).json({
      inventory: { id, name: name.trim(), owner_id: req.user!.id, role: 'owner', item_count: 0 },
    })
  } catch (err) {
    console.error('create inventory:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/inventories/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  try {
    const result = await db.execute({
      sql: `SELECT i.id, i.name, i.owner_id, im.role, i.created_at,
                   (SELECT COUNT(*) FROM items WHERE inventory_id = i.id) AS item_count
            FROM inventories i
            JOIN inventory_members im ON im.inventory_id = i.id AND im.user_id = ?
            WHERE i.id = ?`,
      args: [req.user!.id, id],
    })
    if (!result.rows[0]) return res.status(404).json({ error: 'Inventory not found' })
    res.json({ inventory: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/inventories/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })

  try {
    const member = await db.execute({
      sql: "SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ? AND role = 'owner'",
      args: [id, req.user!.id],
    })
    if (!member.rows[0]) return res.status(403).json({ error: 'Only the owner can rename this inventory' })

    await db.execute({
      sql: 'UPDATE inventories SET name = ?, updated_at = unixepoch() WHERE id = ?',
      args: [name.trim(), id],
    })
    res.json({ inventory: { id, name: name.trim() } })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/inventories/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  try {
    const member = await db.execute({
      sql: "SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ? AND role = 'owner'",
      args: [id, req.user!.id],
    })
    if (!member.rows[0]) return res.status(403).json({ error: 'Only the owner can delete this inventory' })

    await db.execute({ sql: 'DELETE FROM inventories WHERE id = ?', args: [id] })
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/inventories/:id/members
router.get('/:id/members', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  try {
    const access = await db.execute({
      sql: 'SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ?',
      args: [id, req.user!.id],
    })
    if (!access.rows[0]) return res.status(403).json({ error: 'Access denied' })

    const result = await db.execute({
      sql: `SELECT u.id, u.name, u.email, im.role, im.joined_at
            FROM inventory_members im
            JOIN users u ON u.id = im.user_id
            WHERE im.inventory_id = ?
            ORDER BY im.joined_at ASC`,
      args: [id],
    })
    res.json({ members: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/inventories/:id/members/:userId — change role
router.patch('/:id/members/:userId', requireAuth, async (req, res) => {
  const { id, userId } = req.params as Record<string, string>
  const { role } = req.body
  if (!['editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Role must be editor or viewer' })
  }
  try {
    const owner = await db.execute({
      sql: "SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ? AND role = 'owner'",
      args: [id, req.user!.id],
    })
    if (!owner.rows[0]) return res.status(403).json({ error: 'Only the owner can change roles' })
    if (userId === req.user!.id) {
      return res.status(400).json({ error: 'Cannot change your own role' })
    }

    await db.execute({
      sql: 'UPDATE inventory_members SET role = ? WHERE inventory_id = ? AND user_id = ?',
      args: [role, id, userId],
    })
    res.json({ role })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/inventories/:id/members/:userId — remove member
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  const { id, userId } = req.params as Record<string, string>
  try {
    const owner = await db.execute({
      sql: "SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ? AND role = 'owner'",
      args: [id, req.user!.id],
    })
    const isSelf = userId === req.user!.id

    // Owner can remove others; members can remove themselves
    if (!owner.rows[0] && !isSelf) {
      return res.status(403).json({ error: 'Access denied' })
    }
    if (owner.rows[0] && isSelf) {
      return res.status(400).json({ error: 'Transfer ownership before leaving' })
    }

    await db.execute({
      sql: 'DELETE FROM inventory_members WHERE inventory_id = ? AND user_id = ?',
      args: [id, userId],
    })
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/inventories/:id/invite
router.post('/:id/invite', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  const { email, role = 'viewer' } = req.body
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' })
  if (!['editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' })

  try {
    const [ownerCheck, invResult] = await Promise.all([
      db.execute({
        sql: "SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ? AND role = 'owner'",
        args: [id, req.user!.id],
      }),
      db.execute({
        sql: 'SELECT name FROM inventories WHERE id = ?',
        args: [id],
      }),
    ])
    if (!ownerCheck.rows[0]) return res.status(403).json({ error: 'Only the owner can invite members' })

    const token = randomUUID()
    const expires = Math.floor(Date.now() / 1000) + 7 * 24 * 3600 // 7 days

    await db.execute({
      sql: `INSERT INTO invite_tokens (token, inventory_id, email, role, invited_by, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [token, id, email.toLowerCase(), role, req.user!.id, expires],
    })

    sendInviteEmail(
      email.toLowerCase(),
      req.user!.name,
      invResult.rows[0]?.name as string,
      role,
      token,
    )

    res.json({ message: 'Invite sent' })
  } catch (err) {
    console.error('invite:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/inventories/:id/categories
router.get('/:id/categories', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  try {
    const access = await db.execute({
      sql: 'SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ?',
      args: [id, req.user!.id],
    })
    if (!access.rows[0]) return res.status(403).json({ error: 'Access denied' })

    const result = await db.execute({
      sql: 'SELECT * FROM categories WHERE inventory_id = ? ORDER BY name ASC',
      args: [id],
    })
    res.json({ categories: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/inventories/:id/categories
router.post('/:id/categories', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })

  try {
    const access = await db.execute({
      sql: "SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ? AND role != 'viewer'",
      args: [id, req.user!.id],
    })
    if (!access.rows[0]) return res.status(403).json({ error: 'Permission denied' })

    const catId = randomUUID()
    await db.execute({
      sql: 'INSERT INTO categories (id, inventory_id, name) VALUES (?, ?, ?)',
      args: [catId, id, name.trim()],
    })
    res.status(201).json({ category: { id: catId, inventory_id: id, name: name.trim() } })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/inventories/:id/locations
router.get('/:id/locations', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  try {
    const access = await db.execute({
      sql: 'SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ?',
      args: [id, req.user!.id],
    })
    if (!access.rows[0]) return res.status(403).json({ error: 'Access denied' })

    const result = await db.execute({
      sql: 'SELECT * FROM locations WHERE inventory_id = ? ORDER BY name ASC',
      args: [id],
    })
    res.json({ locations: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/inventories/:id/locations
router.post('/:id/locations', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  const { name, parent_id } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })

  try {
    const access = await db.execute({
      sql: "SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ? AND role != 'viewer'",
      args: [id, req.user!.id],
    })
    if (!access.rows[0]) return res.status(403).json({ error: 'Permission denied' })

    const locId = randomUUID()
    await db.execute({
      sql: 'INSERT INTO locations (id, inventory_id, name, parent_id) VALUES (?, ?, ?, ?)',
      args: [locId, id, name.trim(), parent_id || null],
    })
    res.status(201).json({ location: { id: locId, inventory_id: id, name: name.trim(), parent_id: parent_id || null } })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
