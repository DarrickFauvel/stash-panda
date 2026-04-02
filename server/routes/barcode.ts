import { Router } from 'express'
import { requireAuth } from '../middleware/auth.ts'

const router = Router()

// GET /api/barcode/:upc
// Proxies to UPC Item DB trial API (no key, 100 req/day free)
router.get('/:upc', requireAuth, async (req, res) => {
  const { upc } = req.params
  if (!/^\d{6,14}$/.test(upc)) return res.status(400).json({ error: 'Invalid barcode' })

  try {
    const resp = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(upc)}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'StashPanda/1.0' },
    })
    if (resp.status === 429) return res.status(429).json({ error: 'Lookup rate limit reached, try again shortly' })
    if (!resp.ok) return res.status(502).json({ error: 'Lookup service unavailable' })

    const data = await resp.json() as any
    const item = data.items?.[0]
    if (!item) return res.status(404).json({ error: 'Product not found' })

    const description = [item.brand, item.description].filter(Boolean).join(' — ') || null
    const category: string = item.category ?? ''
    const isBoardGame = /board.?game|card.?game|tabletop|puzzle/i.test(category) ||
                        /board.?game|card.?game|tabletop/i.test(item.title ?? '')
    res.json({
      name:        item.title ?? null,
      description: description,
      brand:       item.brand ?? null,
      imageUrl:    item.images?.[0] ?? null,
      itemType:    isBoardGame ? 'boardgame' : 'physical',
    })
  } catch {
    res.status(502).json({ error: 'Lookup failed' })
  }
})

export default router
