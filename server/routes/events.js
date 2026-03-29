import { Router } from 'express'
import jwt from 'jsonwebtoken'

const router = Router()

// inventoryId -> Set of SSE response objects
const clients = new Map()

/**
 * Broadcast a Datastar-compatible SSE event to all members of an inventory.
 * @param {string} inventoryId
 * @param {'datastar-merge-fragments'|'datastar-merge-signals'|string} eventName
 * @param {string} data  — raw event data string
 */
export function broadcast(inventoryId, eventName, data) {
  const subs = clients.get(inventoryId)
  if (!subs?.size) return
  const payload = `event: ${eventName}\ndata: ${data}\n\n`
  for (const res of subs) {
    res.write(payload)
  }
}

// GET /events?inventory=:id&token=:jwt
// EventSource doesn't support custom headers so auth comes via query param
router.get('/', (req, res) => {
  const { token, inventory: inventoryId } = req.query
  if (!token || !inventoryId) return res.status(400).end()

  let user
  try {
    user = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return res.status(401).end()
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering
  })
  res.flushHeaders()

  // Confirm connection
  res.write(`event: connected\ndata: ${JSON.stringify({ userId: user.id })}\n\n`)

  if (!clients.has(inventoryId)) clients.set(inventoryId, new Set())
  const inventoryClients = clients.get(inventoryId)
  inventoryClients.add(res)

  // Keep-alive ping every 30s
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 30_000)

  req.on('close', () => {
    clearInterval(keepAlive)
    inventoryClients.delete(res)
    if (inventoryClients.size === 0) clients.delete(inventoryId)
  })
})

export default router
