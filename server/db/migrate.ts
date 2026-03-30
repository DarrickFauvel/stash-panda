import 'dotenv/config'
import { db } from './client.ts'

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_verify_token TEXT,
  password_reset_token TEXT,
  password_reset_expires INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS inventories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS inventory_members (
  inventory_id TEXT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
  position INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (inventory_id, user_id)
);

CREATE TABLE IF NOT EXISTS invite_tokens (
  token TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('editor', 'viewer')),
  invited_by TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT,
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  value REAL,
  purchase_date TEXT,
  expiry_date TEXT,
  barcode TEXT,
  description TEXT,
  item_type TEXT NOT NULL DEFAULT 'physical'
    CHECK(item_type IN ('physical', 'digital', 'subscription', 'document', 'boardgame')),
  custom_fields TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS item_photos (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK(direction IN ('used', 'restocked')),
  amount REAL NOT NULL,
  quantity_after REAL NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_items_inventory   ON items(inventory_id);
CREATE INDEX IF NOT EXISTS idx_items_category    ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_location    ON items(location_id);
CREATE INDEX IF NOT EXISTS idx_items_name        ON items(inventory_id, name);
CREATE INDEX IF NOT EXISTS idx_usage_item        ON usage_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_members_user      ON inventory_members(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_inv     ON locations(inventory_id);
CREATE INDEX IF NOT EXISTS idx_categories_inv    ON categories(inventory_id);
CREATE INDEX IF NOT EXISTS idx_photos_item       ON item_photos(item_id);
`

const statements = schema
  .split(';')
  .map(s => s.trim())
  .filter(Boolean)

for (const sql of statements) {
  await db.execute(sql)
}

// Additive column migrations (safe to re-run)
try {
  await db.execute('ALTER TABLE inventory_members ADD COLUMN position INTEGER NOT NULL DEFAULT 0')
} catch { /* column already exists */ }

// Add 'boardgame' to items.item_type CHECK constraint (requires table rebuild in SQLite)
{
  const r = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='items'")
  const sql = r.rows[0]?.sql as string ?? ''
  if (!sql.includes('boardgame')) {
    await db.execute('PRAGMA foreign_keys=OFF')
    await db.execute(`
      CREATE TABLE items_new (
        id TEXT PRIMARY KEY,
        inventory_id TEXT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        unit TEXT,
        location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
        category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        value REAL,
        purchase_date TEXT,
        expiry_date TEXT,
        barcode TEXT,
        description TEXT,
        item_type TEXT NOT NULL DEFAULT 'physical'
          CHECK(item_type IN ('physical', 'digital', 'subscription', 'document', 'boardgame')),
        custom_fields TEXT NOT NULL DEFAULT '{}',
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `)
    await db.execute('INSERT INTO items_new SELECT * FROM items')
    await db.execute('DROP TABLE items')
    await db.execute('ALTER TABLE items_new RENAME TO items')
    await db.execute('CREATE INDEX IF NOT EXISTS idx_items_inventory ON items(inventory_id)')
    await db.execute('CREATE INDEX IF NOT EXISTS idx_items_category   ON items(category_id)')
    await db.execute('CREATE INDEX IF NOT EXISTS idx_items_location   ON items(location_id)')
    await db.execute('CREATE INDEX IF NOT EXISTS idx_items_name       ON items(inventory_id, name)')
    await db.execute('PRAGMA foreign_keys=ON')
    console.log('  → items table rebuilt with boardgame item type')
  }
}

console.log('✅ Migration complete')
