import { Router } from 'express'
import { randomUUID } from 'crypto'
import { db } from '../db/client.ts'
import { requireAuth } from '../middleware/auth.ts'
import { sendInviteEmail } from '../email.ts'
import itemsRouter from './items.ts'

const router = Router()

// Temporary debug logging
router.use((req, _res, next) => {
  if (req.method === 'PATCH') console.log(`[PATCH] ${req.path}`, req.body)
  next()
})

// Items are nested: /api/galaxies/:inventoryId/items
router.use('/:inventoryId/items', itemsRouter)

// GET /api/galaxies
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT i.id, i.name, i.subtitle, i.owner_id, im.role, im.position, i.created_at,
                   (SELECT COUNT(*) FROM items WHERE inventory_id = i.id) AS item_count
            FROM inventories i
            JOIN inventory_members im ON im.inventory_id = i.id AND im.user_id = ?
            ORDER BY im.position ASC, i.name ASC`,
      args: [req.user!.id],
    })
    res.json({ galaxies: result.rows })
  } catch (err) {
    console.error('list galaxies:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/galaxies/reorder
router.patch('/reorder', requireAuth, async (req, res) => {
  const { order } = req.body
  if (!Array.isArray(order) || order.some(id => typeof id !== 'string')) {
    return res.status(400).json({ error: 'order must be an array of inventory IDs' })
  }
  try {
    await db.batch(
      order.map((id, position) => ({
        sql: 'UPDATE inventory_members SET position = ? WHERE inventory_id = ? AND user_id = ?',
        args: [position, id, req.user!.id],
      }))
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('reorder galaxies:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/galaxies
router.post('/', requireAuth, async (req, res) => {
  const { name, subtitle } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  const sub = subtitle?.trim() || null

  try {
    const id = randomUUID()
    await db.batch([
      {
        sql: 'INSERT INTO inventories (id, name, subtitle, owner_id) VALUES (?, ?, ?, ?)',
        args: [id, name.trim(), sub, req.user!.id],
      },
      {
        sql: 'INSERT INTO inventory_members (inventory_id, user_id, role) VALUES (?, ?, ?)',
        args: [id, req.user!.id, 'owner'],
      },
    ])
    res.status(201).json({
      galaxy: { id, name: name.trim(), subtitle: sub, owner_id: req.user!.id, role: 'owner', item_count: 0 },
    })
  } catch (err) {
    console.error('create galaxy:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/galaxies/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  try {
    const result = await db.execute({
      sql: `SELECT i.id, i.name, i.subtitle, i.owner_id, im.role, i.created_at,
                   (SELECT COUNT(*) FROM items WHERE inventory_id = i.id) AS item_count
            FROM inventories i
            JOIN inventory_members im ON im.inventory_id = i.id AND im.user_id = ?
            WHERE i.id = ?`,
      args: [req.user!.id, id],
    })
    if (!result.rows[0]) return res.status(404).json({ error: 'Galaxy not found' })
    res.json({ galaxy: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/galaxies/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  const { name, subtitle } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  const sub = subtitle?.trim() || null

  try {
    const member = await db.execute({
      sql: "SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ? AND role = 'owner'",
      args: [id, req.user!.id],
    })
    if (!member.rows[0]) return res.status(403).json({ error: 'Only the owner can rename this galaxy' })

    await db.execute({
      sql: 'UPDATE inventories SET name = ?, subtitle = ?, updated_at = unixepoch() WHERE id = ?',
      args: [name.trim(), sub, id],
    })
    res.json({ galaxy: { id, name: name.trim(), subtitle: sub } })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/galaxies/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  try {
    const member = await db.execute({
      sql: "SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ? AND role = 'owner'",
      args: [id, req.user!.id],
    })
    if (!member.rows[0]) return res.status(403).json({ error: 'Only the owner can delete this galaxy' })

    await db.execute({ sql: 'DELETE FROM inventories WHERE id = ?', args: [id] })
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/galaxies/:id/members
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

// PATCH /api/galaxies/:id/members/:userId — change role
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

// DELETE /api/galaxies/:id/members/:userId — remove member
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

// POST /api/galaxies/:id/invite
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

// GET /api/galaxies/:id/categories
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

// POST /api/galaxies/:id/categories
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

// GET /api/galaxies/:id/locations
router.get('/:id/locations', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  try {
    const access = await db.execute({
      sql: 'SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ?',
      args: [id, req.user!.id],
    })
    if (!access.rows[0]) return res.status(403).json({ error: 'Access denied' })

    const result = await db.execute({
      sql: `SELECT l.*, COUNT(i.id) AS item_count
            FROM locations l
            LEFT JOIN items i ON i.location_id = l.id
            WHERE l.inventory_id = ?
            GROUP BY l.id
            ORDER BY l.name ASC`,
      args: [id],
    })
    res.json({ locations: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

const VALID_LOCATION_TYPES = ['room','shelf','drawer','cabinet','closet','box','banker_box','shoebox','bin','basket','tote','bag','other']

// POST /api/galaxies/:id/locations
router.post('/:id/locations', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  const { name, parent_id, location_type } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  const locType = VALID_LOCATION_TYPES.includes(location_type) ? location_type : 'room'

  try {
    const access = await db.execute({
      sql: "SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ? AND role != 'viewer'",
      args: [id, req.user!.id],
    })
    if (!access.rows[0]) return res.status(403).json({ error: 'Permission denied' })

    const locId = randomUUID()
    await db.execute({
      sql: 'INSERT INTO locations (id, inventory_id, name, parent_id, location_type) VALUES (?, ?, ?, ?, ?)',
      args: [locId, id, name.trim(), parent_id || null, locType],
    })
    res.status(201).json({ location: { id: locId, inventory_id: id, name: name.trim(), parent_id: parent_id || null, location_type: locType } })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/galaxies/:id/categories/:categoryId
router.patch('/:id/categories/:categoryId', requireAuth, async (req, res) => {
  const { id, categoryId } = req.params as Record<string, string>
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  try {
    const access = await db.execute({
      sql: "SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ? AND role != 'viewer'",
      args: [id, req.user!.id],
    })
    if (!access.rows[0]) return res.status(403).json({ error: 'Permission denied' })
    await db.execute({
      sql: 'UPDATE categories SET name = ? WHERE id = ? AND inventory_id = ?',
      args: [name.trim(), categoryId, id],
    })
    res.json({ category: { id: categoryId, name: name.trim() } })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/galaxies/:id/categories/:categoryId
router.delete('/:id/categories/:categoryId', requireAuth, async (req, res) => {
  const { id, categoryId } = req.params as Record<string, string>
  try {
    const access = await db.execute({
      sql: "SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ? AND role != 'viewer'",
      args: [id, req.user!.id],
    })
    if (!access.rows[0]) return res.status(403).json({ error: 'Permission denied' })
    await db.execute({ sql: 'DELETE FROM categories WHERE id = ? AND inventory_id = ?', args: [categoryId, id] })
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/galaxies/:id/locations/:locationId
router.patch('/:id/locations/:locationId', requireAuth, async (req, res) => {
  const { id, locationId } = req.params as Record<string, string>
  const { name, location_type } = req.body
  if (!name?.trim() && !location_type) return res.status(400).json({ error: 'Nothing to update' })
  try {
    const access = await db.execute({
      sql: "SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ? AND role != 'viewer'",
      args: [id, req.user!.id],
    })
    if (!access.rows[0]) return res.status(403).json({ error: 'Permission denied' })

    const updates: string[] = []
    const args: (string | null)[] = []
    if (name?.trim()) { updates.push('name = ?'); args.push(name.trim()) }
    if (location_type && VALID_LOCATION_TYPES.includes(location_type)) { updates.push('location_type = ?'); args.push(location_type) }
    args.push(locationId, id)

    await db.execute({ sql: `UPDATE locations SET ${updates.join(', ')} WHERE id = ? AND inventory_id = ?`, args })
    res.json({ location: { id: locationId, ...(name?.trim() ? { name: name.trim() } : {}), ...(location_type ? { location_type } : {}) } })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/galaxies/:id/locations/:locationId
router.delete('/:id/locations/:locationId', requireAuth, async (req, res) => {
  const { id, locationId } = req.params as Record<string, string>
  try {
    const access = await db.execute({
      sql: "SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ? AND role != 'viewer'",
      args: [id, req.user!.id],
    })
    if (!access.rows[0]) return res.status(403).json({ error: 'Permission denied' })
    await db.execute({ sql: 'DELETE FROM locations WHERE id = ? AND inventory_id = ?', args: [locationId, id] })
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
