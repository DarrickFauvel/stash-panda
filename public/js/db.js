/**
 * IndexedDB — offline cache + mutation queue
 *
 * Stores:
 *   items         — cached item records for offline reads
 *   inventories   — cached inventory list
 *   queue         — pending mutations to replay when back online
 */

const DB_NAME = 'stash-panda'
const DB_VERSION = 1

let _db = null

function openDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = e => {
      const db = e.target.result

      if (!db.objectStoreNames.contains('inventories')) {
        db.createObjectStore('inventories', { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains('items')) {
        const items = db.createObjectStore('items', { keyPath: 'id' })
        items.createIndex('by_inventory', 'inventory_id')
      }

      if (!db.objectStoreNames.contains('queue')) {
        const queue = db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true })
        queue.createIndex('by_created', 'created_at')
      }
    }

    req.onsuccess = e => { _db = e.target.result; resolve(_db) }
    req.onerror = () => reject(req.error)
  })
}

function tx(storeName, mode, fn) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode)
      const store = transaction.objectStore(storeName)
      const req = fn(store)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  })
}

// ─── Inventories ─────────────────────────────────────────────────────────────

export const inventoriesStore = {
  getAll() {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db.transaction('inventories', 'readonly')
        .objectStore('inventories').getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }))
  },
  put(inventory) {
    return tx('inventories', 'readwrite', s => s.put(inventory))
  },
  putMany(inventories) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction('inventories', 'readwrite')
      const s = t.objectStore('inventories')
      inventories.forEach(inv => s.put(inv))
      t.oncomplete = resolve
      t.onerror = () => reject(t.error)
    }))
  },
  delete(id) {
    return tx('inventories', 'readwrite', s => s.delete(id))
  },
}

// ─── Items ────────────────────────────────────────────────────────────────────

export const itemsStore = {
  getByInventory(inventoryId) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db.transaction('items', 'readonly')
        .objectStore('items')
        .index('by_inventory')
        .getAll(inventoryId)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }))
  },
  get(id) {
    return tx('items', 'readonly', s => s.get(id))
  },
  put(item) {
    return tx('items', 'readwrite', s => s.put(item))
  },
  putMany(items) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction('items', 'readwrite')
      const s = t.objectStore('items')
      items.forEach(item => s.put(item))
      t.oncomplete = resolve
      t.onerror = () => reject(t.error)
    }))
  },
  delete(id) {
    return tx('items', 'readwrite', s => s.delete(id))
  },
}

// ─── Mutation queue ───────────────────────────────────────────────────────────

export const queue = {
  push(method, path, body) {
    return tx('queue', 'readwrite', s => s.add({
      method,
      path,
      body,
      created_at: Date.now(),
    }))
  },

  getAll() {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db.transaction('queue', 'readonly')
        .objectStore('queue').getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }))
  },

  delete(id) {
    return tx('queue', 'readwrite', s => s.delete(id))
  },

  async replay(apiCall) {
    const pending = await this.getAll()
    if (!pending.length) return

    for (const op of pending) {
      try {
        await apiCall(op.method, op.path, op.body)
        await this.delete(op.id)
      } catch (err) {
        console.warn('Queue replay failed for', op, err)
        break // stop on first failure; retry on next sync
      }
    }
  },
}

// ─── Sync trigger from service worker ────────────────────────────────────────

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', async event => {
    if (event.data?.type === 'SYNC_READY') {
      const { api } = await import('./router.js')
      await queue.replay(api)
    }
  })
}
