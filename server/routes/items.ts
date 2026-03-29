import { Router } from 'express'
import { randomUUID } from 'crypto'
import { unlink } from 'fs/promises'
import { join } from 'path'
import multer from 'multer'
import { extname } from 'path'
import type { InValue } from '@libsql/client'
import { db } from '../db/client.ts'
import { requireAuth } from '../middleware/auth.ts'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
})

// mergeParams: true so :inventoryId is accessible from the parent router
const router = Router({ mergeParams: true })

async function getMemberRole(inventoryId: string, userId: string): Promise<string | null> {
  const result = await db.execute({
    sql: 'SELECT role FROM inventory_members WHERE inventory_id = ? AND user_id = ?',
    args: [inventoryId, userId],
  })
  return result.rows[0]?.role as string ?? null
}

// GET /api/inventories/:inventoryId/items
router.get('/', requireAuth, async (req, res) => {
  const { inventoryId } = req.params as Record<string, string>
  const role = await getMemberRole(inventoryId, req.user!.id)
  if (!role) return res.status(403).json({ error: 'Access denied' })

  const q = req.query.q as string | undefined
  const category = req.query.category as string | undefined
  const location = req.query.location as string | undefined
  const type = req.query.type as string | undefined
  const sort = (req.query.sort as string | undefined) ?? 'name'
  const sortMap: Record<string, string> = {
    name: 'i.name ASC',
    quantity: 'i.quantity DESC',
    added: 'i.created_at DESC',
    value: 'i.value DESC',
    expiry: 'i.expiry_date ASC',
  }
  const orderBy = sortMap[sort] ?? 'i.name ASC'

  try {
    const conditions = ['i.inventory_id = ?']
    const args: InValue[] = [inventoryId]

    if (q) {
      conditions.push('(i.name LIKE ? OR i.description LIKE ? OR i.tags LIKE ?)')
      args.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }
    if (category) { conditions.push('i.category_id = ?'); args.push(category) }
    if (location) { conditions.push('i.location_id = ?'); args.push(location) }
    if (type) { conditions.push('i.item_type = ?'); args.push(type) }

    const result = await db.execute({
      sql: `SELECT i.id, i.name, i.quantity, i.unit, i.item_type,
                   i.value, i.expiry_date, i.tags, i.updated_at,
                   c.name AS category_name, l.name AS location_name,
                   (SELECT url FROM item_photos WHERE item_id = i.id ORDER BY created_at ASC LIMIT 1) AS photo_url
            FROM items i
            LEFT JOIN categories c ON c.id = i.category_id
            LEFT JOIN locations l ON l.id = i.location_id
            WHERE ${conditions.join(' AND ')}
            ORDER BY ${orderBy}`,
      args,
    })
    res.json({ items: result.rows })
  } catch (err) {
    console.error('list items:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/inventories/:inventoryId/items
router.post('/', requireAuth, async (req, res) => {
  const { inventoryId } = req.params as Record<string, string>
  const role = await getMemberRole(inventoryId, req.user!.id)
  if (!role || role === 'viewer') return res.status(403).json({ error: 'Permission denied' })

  const {
    name, quantity = 0, unit, location_id, category_id,
    tags = [], value, purchase_date, expiry_date, barcode,
    description, item_type = 'physical', custom_fields = {},
  } = req.body

  if (!name?.trim()) return res.status(400).json({ error: 'Item name is required' })

  try {
    const id = randomUUID()
    await db.execute({
      sql: `INSERT INTO items (id, inventory_id, name, quantity, unit, location_id, category_id,
              tags, value, purchase_date, expiry_date, barcode, description,
              item_type, custom_fields, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id, inventoryId, name.trim(), quantity, unit || null,
        location_id || null, category_id || null,
        JSON.stringify(tags), value || null,
        purchase_date || null, expiry_date || null, barcode || null,
        description || null, item_type, JSON.stringify(custom_fields),
        req.user!.id,
      ],
    })
    const result = await db.execute({ sql: 'SELECT * FROM items WHERE id = ?', args: [id] })
    res.status(201).json({ item: result.rows[0] })
  } catch (err) {
    console.error('create item:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/inventories/:inventoryId/items/:itemId
router.get('/:itemId', requireAuth, async (req, res) => {
  const { inventoryId, itemId } = req.params as Record<string, string>
  const role = await getMemberRole(inventoryId, req.user!.id)
  if (!role) return res.status(403).json({ error: 'Access denied' })

  try {
    const result = await db.execute({
      sql: `SELECT i.*, c.name AS category_name, l.name AS location_name
            FROM items i
            LEFT JOIN categories c ON c.id = i.category_id
            LEFT JOIN locations l ON l.id = i.location_id
            WHERE i.id = ? AND i.inventory_id = ?`,
      args: [itemId, inventoryId],
    })
    if (!result.rows[0]) return res.status(404).json({ error: 'Item not found' })

    const [photos, logs] = await Promise.all([
      db.execute({
        sql: 'SELECT * FROM item_photos WHERE item_id = ? ORDER BY created_at ASC',
        args: [itemId],
      }),
      db.execute({
        sql: `SELECT ul.*, u.name AS user_name
              FROM usage_logs ul
              LEFT JOIN users u ON u.id = ul.user_id
              WHERE ul.item_id = ?
              ORDER BY ul.created_at DESC
              LIMIT 100`,
        args: [itemId],
      }),
    ])

    res.json({ item: result.rows[0], photos: photos.rows, logs: logs.rows })
  } catch (err) {
    console.error('get item:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/inventories/:inventoryId/items/:itemId
router.patch('/:itemId', requireAuth, async (req, res) => {
  const { inventoryId, itemId } = req.params as Record<string, string>
  const role = await getMemberRole(inventoryId, req.user!.id)
  if (!role || role === 'viewer') return res.status(403).json({ error: 'Permission denied' })

  const allowed = [
    'name', 'quantity', 'unit', 'location_id', 'category_id', 'tags',
    'value', 'purchase_date', 'expiry_date', 'barcode', 'description',
    'item_type', 'custom_fields',
  ]
  const jsonFields = new Set(['tags', 'custom_fields'])
  const setClauses: string[] = []
  const args: InValue[] = []

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      setClauses.push(`${field} = ?`)
      args.push(jsonFields.has(field) ? JSON.stringify(req.body[field]) : req.body[field])
    }
  }
  if (!setClauses.length) return res.status(400).json({ error: 'No fields to update' })

  setClauses.push('updated_at = unixepoch()')
  args.push(itemId, inventoryId)

  try {
    await db.execute({
      sql: `UPDATE items SET ${setClauses.join(', ')} WHERE id = ? AND inventory_id = ?`,
      args,
    })
    const result = await db.execute({ sql: 'SELECT * FROM items WHERE id = ?', args: [itemId] })
    res.json({ item: result.rows[0] })
  } catch (err) {
    console.error('update item:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/inventories/:inventoryId/items/:itemId
router.delete('/:itemId', requireAuth, async (req, res) => {
  const { inventoryId, itemId } = req.params as Record<string, string>
  const role = await getMemberRole(inventoryId, req.user!.id)
  if (!role || role === 'viewer') return res.status(403).json({ error: 'Permission denied' })

  try {
    await db.execute({
      sql: 'DELETE FROM items WHERE id = ? AND inventory_id = ?',
      args: [itemId, inventoryId],
    })
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/inventories/:inventoryId/items/:itemId/use — log a use or restock
router.post('/:itemId/use', requireAuth, async (req, res) => {
  const { inventoryId, itemId } = req.params as Record<string, string>
  const role = await getMemberRole(inventoryId, req.user!.id)
  if (!role || role === 'viewer') return res.status(403).json({ error: 'Permission denied' })

  const { amount, direction, note } = req.body
  if (!amount || !['used', 'restocked'].includes(direction)) {
    return res.status(400).json({ error: 'amount and direction (used|restocked) are required' })
  }

  try {
    const itemResult = await db.execute({
      sql: 'SELECT quantity FROM items WHERE id = ? AND inventory_id = ?',
      args: [itemId, inventoryId],
    })
    if (!itemResult.rows[0]) return res.status(404).json({ error: 'Item not found' })

    const current = Number(itemResult.rows[0].quantity)
    const delta = direction === 'used' ? -Math.abs(Number(amount)) : Math.abs(Number(amount))
    const newQty = Math.max(0, current + delta)
    const logId = randomUUID()

    await db.batch([
      {
        sql: 'UPDATE items SET quantity = ?, updated_at = unixepoch() WHERE id = ?',
        args: [newQty, itemId],
      },
      {
        sql: `INSERT INTO usage_logs (id, item_id, user_id, direction, amount, quantity_after, note)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [logId, itemId, req.user!.id, direction, Math.abs(Number(amount)), newQty, note || null],
      },
    ])

    res.json({
      quantity: newQty,
      log: { id: logId, direction, amount: Math.abs(Number(amount)), quantity_after: newQty },
    })
  } catch (err) {
    console.error('log use:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/inventories/:inventoryId/items/:itemId/photos
router.post('/:itemId/photos', requireAuth, upload.single('photo'), async (req, res) => {
  const { inventoryId, itemId } = req.params as Record<string, string>
  const role = await getMemberRole(inventoryId, req.user!.id)
  if (!role || role === 'viewer') return res.status(403).json({ error: 'Permission denied' })
  if (!req.file) return res.status(400).json({ error: 'No image provided' })

  const id = randomUUID()
  const url = `/uploads/${req.file.filename}`
  try {
    await db.execute({
      sql: 'INSERT INTO item_photos (id, item_id, url, uploaded_by) VALUES (?, ?, ?, ?)',
      args: [id, itemId, url, req.user!.id],
    })
    res.status(201).json({ photo: { id, item_id: itemId, url } })
  } catch (err) {
    await unlink(join(UPLOAD_DIR, req.file.filename)).catch(() => {})
    console.error('upload photo:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/inventories/:inventoryId/items/:itemId/photos/:photoId
router.delete('/:itemId/photos/:photoId', requireAuth, async (req, res) => {
  const { inventoryId, itemId, photoId } = req.params as Record<string, string>
  const role = await getMemberRole(inventoryId, req.user!.id)
  if (!role || role === 'viewer') return res.status(403).json({ error: 'Permission denied' })

  try {
    const result = await db.execute({
      sql: 'SELECT url FROM item_photos WHERE id = ? AND item_id = ?',
      args: [photoId, itemId],
    })
    if (!result.rows[0]) return res.status(404).json({ error: 'Photo not found' })

    const filename = (result.rows[0].url as string).replace('/uploads/', '')
    await db.execute({ sql: 'DELETE FROM item_photos WHERE id = ?', args: [photoId] })
    await unlink(join(UPLOAD_DIR, filename)).catch(() => {})
    res.status(204).end()
  } catch (err) {
    console.error('delete photo:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
