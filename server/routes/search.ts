import { Router } from 'express'
import { db } from '../db/client.ts'
import { requireAuth } from '../middleware/auth.ts'

const router = Router()

// GET /api/search?q=
router.get('/', requireAuth, async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim()
  if (!q) return res.json({ items: [] })

  try {
    const result = await db.execute({
      sql: `SELECT i.id, i.name, i.quantity, i.unit, i.item_type,
                   inv.id AS galaxy_id, inv.name AS galaxy_name,
                   c.name AS category_name,
                   CASE
                     WHEN l3.name IS NOT NULL THEN l3.name || ' > ' || l2.name || ' > ' || l.name
                     WHEN l2.name IS NOT NULL THEN l2.name || ' > ' || l.name
                     ELSE l.name
                   END AS location_path,
                   (SELECT url FROM item_photos WHERE item_id = i.id ORDER BY created_at ASC LIMIT 1) AS photo_url
            FROM items i
            JOIN inventories inv ON inv.id = i.inventory_id
            JOIN inventory_members im ON im.inventory_id = inv.id AND im.user_id = ?
            LEFT JOIN categories c ON c.id = i.category_id
            LEFT JOIN locations l  ON l.id  = i.location_id
            LEFT JOIN locations l2 ON l2.id = l.parent_id
            LEFT JOIN locations l3 ON l3.id = l2.parent_id
            WHERE (i.name LIKE ? OR i.description LIKE ? OR i.tags LIKE ?)
            ORDER BY i.name ASC
            LIMIT 50`,
      args: [req.user!.id, `%${q}%`, `%${q}%`, `%${q}%`],
    })
    res.json({ items: result.rows })
  } catch (err) {
    console.error('global search:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
