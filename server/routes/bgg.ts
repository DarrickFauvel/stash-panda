import { Router } from 'express'
import { requireAuth } from '../middleware/auth.ts'

const router = Router()

const BGG = 'https://boardgamegeek.com/xmlapi2'

// Helper: extract a single attribute value from an XML tag string
function attr(s: string, name: string): string | null {
  const m = s.match(new RegExp(`${name}="([^"]*)"`, 'i'))
  return m ? decode(m[1]) : null
}

// Helper: extract text content between tags
function between(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return m ? decode(m[1]) : null
}

// Decode common XML/HTML entities
function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, '\n')
    .replace(/&#9;/g, '\t')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

// GET /api/bgg/search?q=catan
router.get('/search', requireAuth, async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim()
  if (!q) return res.status(400).json({ error: 'Query required' })

  try {
    const url = `${BGG}/search?query=${encodeURIComponent(q)}&type=boardgame`
    const r = await fetch(url)
    if (!r.ok) return res.status(502).json({ error: 'BGG unavailable' })
    const xml = await r.text()

    // Split on <item> tags
    const results: { id: string; name: string; year: string | null }[] = []
    const itemRe = /<item\s[^>]*type="boardgame"[^>]*>([\s\S]*?)<\/item>/g
    let m: RegExpExecArray | null
    while ((m = itemRe.exec(xml)) !== null) {
      const tag = m[0]
      const body = m[1]
      const id = attr(tag, 'id')
      // Primary name preferred
      const primaryM = body.match(/<name\s[^>]*type="primary"[^>]*value="([^"]*)"/i)
      const name = primaryM ? decode(primaryM[1]) : null
      const yearM = body.match(/<yearpublished\s[^>]*value="([^"]*)"/i)
      const year = yearM ? yearM[1] : null
      if (id && name) results.push({ id, name, year })
    }

    // Sort: exact/prefix matches first
    const ql = q.toLowerCase()
    results.sort((a, b) => {
      const al = a.name.toLowerCase(), bl = b.name.toLowerCase()
      const aExact = al === ql, bExact = bl === ql
      const aPrefix = al.startsWith(ql), bPrefix = bl.startsWith(ql)
      if (aExact !== bExact) return aExact ? -1 : 1
      if (aPrefix !== bPrefix) return aPrefix ? -1 : 1
      return (a.year ?? '0') > (b.year ?? '0') ? -1 : 1
    })

    res.json({ results: results.slice(0, 20) })
  } catch (err) {
    console.error('bgg search:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/bgg/thing/:id
router.get('/thing/:id', requireAuth, async (req, res) => {
  const { id } = req.params as Record<string, string>
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' })

  try {
    const url = `${BGG}/thing?id=${id}&stats=1`
    const r = await fetch(url)
    if (!r.ok) return res.status(502).json({ error: 'BGG unavailable' })
    const xml = await r.text()

    const primaryM = xml.match(/<name\s[^>]*type="primary"[^>]*value="([^"]*)"/i)
    const name = primaryM ? decode(primaryM[1]) : null
    const description = between(xml, 'description')
    const thumbnail = between(xml, 'thumbnail')

    function numAttr(tag: string): number | null {
      const m = xml.match(new RegExp(`<${tag}\\s[^>]*value="([^"]*)"`, 'i'))
      const v = m ? Number(m[1]) : NaN
      return isNaN(v) || v === 0 ? null : v
    }

    const year = numAttr('yearpublished')
    const minPlayers = numAttr('minplayers')
    const maxPlayers = numAttr('maxplayers')
    const playingTime = numAttr('playingtime')
    const minAge = numAttr('minage')

    const categories: string[] = []
    const mechanics: string[] = []
    const linkRe = /<link\s[^>]*type="([^"]*)"[^>]*value="([^"]*)"/g
    let lm: RegExpExecArray | null
    while ((lm = linkRe.exec(xml)) !== null) {
      const type = lm[1], value = decode(lm[2])
      if (type === 'boardgamecategory') categories.push(value)
      else if (type === 'boardgamemechanic') mechanics.push(value)
    }

    res.json({
      thing: {
        id,
        name,
        description,
        thumbnail: thumbnail?.trim() ?? null,
        year,
        minPlayers,
        maxPlayers,
        playingTime,
        minAge,
        categories,
        mechanics,
      },
    })
  } catch (err) {
    console.error('bgg thing:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
