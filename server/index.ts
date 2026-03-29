import 'dotenv/config'
import express from 'express'
import { Eta } from 'eta'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import authRoutes from './routes/auth.ts'
import inventoryRoutes from './routes/inventories.ts'
import inviteRoutes from './routes/invite.ts'
import eventsRoutes from './routes/events.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const app = express()

const eta = new Eta({
  views: join(root, 'views'),
  cache: process.env.NODE_ENV === 'production',
})
app.locals.eta = eta

app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(express.static(join(root, 'public')))
app.use('/uploads', express.static(process.env.UPLOAD_DIR ?? join(root, 'uploads')))

app.use('/api/auth', authRoutes)
app.use('/api/inventories', inventoryRoutes)
app.use('/api/invite', inviteRoutes)
app.use('/events', eventsRoutes)

// SPA fallback — serves app shell for all non-API routes
app.get(/^(?!\/api|\/events)/, (_req, res) => {
  res.sendFile(join(root, 'public/index.html'))
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🐼 Stash Panda running at http://localhost:${PORT}`)
})
