/**
 * Client-side router — History API + server-rendered HTML fragments
 *
 * Pattern:
 *   1. Intercepts <a data-link> clicks
 *   2. Matches path against route table
 *   3. Calls route handler; handler renders HTML into #app
 *   4. Manages auth state from localStorage
 */

export const auth = {
  get token() { return localStorage.getItem('sp_token') },
  get user()  {
    const raw = localStorage.getItem('sp_user')
    try { return raw ? JSON.parse(raw) : null } catch { return null }
  },
  save(token, user) {
    localStorage.setItem('sp_token', token)
    localStorage.setItem('sp_user', JSON.stringify(user))
  },
  clear() {
    localStorage.removeItem('sp_token')
    localStorage.removeItem('sp_user')
  },
  get isLoggedIn() { return Boolean(this.token) },
}

// ─── API helper ─────────────────────────────────────────────────────────────

export async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    auth.clear()
    navigate('/login')
    return null
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
  return data
}

// ─── Render helpers ──────────────────────────────────────────────────────────

function setHTML(html) {
  document.getElementById('app').innerHTML = html
}

function setNav(isLoggedIn) {
  document.getElementById('bottom-nav').hidden = !isLoggedIn

  const actions = document.getElementById('header-actions')
  if (isLoggedIn) {
    actions.innerHTML = `
      <span class="text-sm text-muted">${auth.user?.name ?? ''}</span>
      <button class="btn btn-ghost btn-sm" id="btn-logout">Sign out</button>
    `
    document.getElementById('btn-logout').addEventListener('click', () => {
      auth.clear()
      navigate('/login')
    })
  } else {
    actions.innerHTML = ''
  }

  // Highlight active bottom nav item
  const path = location.pathname
  document.querySelectorAll('.bottom-nav__item').forEach(a => {
    const route = a.dataset.nav
    const active = path.startsWith(`/${route}`)
    a.setAttribute('aria-current', active ? 'page' : 'false')
  })
}

// ─── Route handlers ──────────────────────────────────────────────────────────

const routes = [
  { pattern: /^\/$/, handler: routeHome },
  { pattern: /^\/login$/, handler: routeLogin },
  { pattern: /^\/signup$/, handler: routeSignup },
  { pattern: /^\/inventories$/, handler: routeInventories },
  { pattern: /^\/inventories\/new$/, handler: routeInventoryNew },
  { pattern: /^\/inventories\/([^/]+)$/, handler: routeInventory },
  { pattern: /^\/inventories\/([^/]+)\/items$/, handler: routeItems },
  { pattern: /^\/inventories\/([^/]+)\/items\/new$/, handler: routeItemNew },
  { pattern: /^\/inventories\/([^/]+)\/items\/([^/]+)$/, handler: routeItem },
  { pattern: /^\/profile$/, handler: routeProfile },
  { pattern: /^\/invite\/([^/]+)$/, handler: routeInvite },
]

function routeHome() {
  if (!auth.isLoggedIn) return navigate('/login')
  navigate('/inventories')
}

function routeLogin() {
  if (auth.isLoggedIn) return navigate('/inventories')
  const redirect = new URLSearchParams(location.search).get('redirect') || '/inventories'
  setHTML(`
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo__mark">🐼</div>
          <div class="auth-logo__name">Stash Panda</div>
        </div>
        <h1 class="auth-title">Welcome back</h1>
        <div id="auth-error" role="alert"></div>
        <form id="login-form">
          <div class="field">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" autocomplete="email" required>
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" autocomplete="current-password" required>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-full btn-lg">Sign in</button>
          </div>
        </form>
        <div class="auth-footer">
          No account? <a href="/signup${redirect !== '/inventories' ? '?redirect=' + encodeURIComponent(redirect) : ''}" data-link>Create one</a>
        </div>
      </div>
    </div>
  `)

  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault()
    const btn = e.target.querySelector('[type=submit]')
    const errEl = document.getElementById('auth-error')
    errEl.innerHTML = ''
    btn.disabled = true
    btn.textContent = 'Signing in…'
    try {
      const data = await api('POST', '/auth/login', {
        email: e.target.email.value,
        password: e.target.password.value,
      })
      if (data) {
        auth.save(data.token, data.user)
        navigate(redirect)
      }
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error mt-4">${err.message}</div>`
      btn.disabled = false
      btn.textContent = 'Sign in'
    }
  })
}

function routeSignup() {
  if (auth.isLoggedIn) return navigate('/inventories')
  const redirect = new URLSearchParams(location.search).get('redirect') || '/inventories'
  setHTML(`
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo__mark">🐼</div>
          <div class="auth-logo__name">Stash Panda</div>
        </div>
        <h1 class="auth-title">Create account</h1>
        <div id="auth-error" role="alert"></div>
        <form id="signup-form">
          <div class="field">
            <label for="name">Your name</label>
            <input type="text" id="name" name="name" autocomplete="name" required>
          </div>
          <div class="field">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" autocomplete="email" required>
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" autocomplete="new-password" required minlength="8">
            <span class="field-hint">At least 8 characters</span>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-full btn-lg">Create account</button>
          </div>
        </form>
        <div class="auth-footer">
          Already have an account? <a href="/login${redirect !== '/inventories' ? '?redirect=' + encodeURIComponent(redirect) : ''}" data-link>Sign in</a>
        </div>
      </div>
    </div>
  `)

  document.getElementById('signup-form').addEventListener('submit', async e => {
    e.preventDefault()
    const btn = e.target.querySelector('[type=submit]')
    const errEl = document.getElementById('auth-error')
    errEl.innerHTML = ''
    btn.disabled = true
    btn.textContent = 'Creating account…'
    try {
      const data = await api('POST', '/auth/signup', {
        name: e.target.name.value,
        email: e.target.email.value,
        password: e.target.password.value,
      })
      if (data) {
        auth.save(data.token, data.user)
        navigate(redirect)
      }
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error mt-4">${err.message}</div>`
      btn.disabled = false
      btn.textContent = 'Create account'
    }
  })
}

async function routeInventories() {
  if (!auth.isLoggedIn) return navigate('/login')
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  try {
    const data = await api('GET', '/inventories')
    if (!data) return

    const { inventories } = data
    const listHTML = inventories.length === 0
      ? `<div class="empty-state">
           <div class="empty-state__icon">📦</div>
           <div class="empty-state__title">No inventories yet</div>
           <div class="empty-state__body">
             Create your first inventory to start tracking your treasures.
           </div>
           <a href="/inventories/new" data-link class="btn btn-primary">Create inventory</a>
         </div>`
      : `<div class="item-list" id="inv-list">
           ${inventories.map(inv => `
             <div class="item-row inv-row" draggable="true" data-id="${inv.id}">
               <span class="drag-handle" aria-hidden="true">⠿</span>
               <a href="/inventories/${inv.id}" data-link class="inv-row__link">
                 <div class="item-row__photo item-row__photo--placeholder">${inventoryIcon(inv.name)}</div>
                 <div class="item-row__info">
                   <div class="item-row__name">${escapeHTML(inv.name)}</div>
                   <div class="item-row__meta">${inv.item_count} item${inv.item_count !== 1 ? 's' : ''} · ${inv.role}</div>
                 </div>
               </a>
               <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="text-muted" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
             </div>
           `).join('')}
         </div>`

    setHTML(`
      <div class="page-header page-header-row">
        <div>
          <h1 class="page-title">My Inventories</h1>
          <p class="page-subtitle">Your collections, organized</p>
        </div>
        <a href="/inventories/new" data-link class="btn btn-primary btn-sm">+ New</a>
      </div>
      ${listHTML}
    `)

    if (inventories.length > 1) {
      const list = document.getElementById('inv-list')
      let dragSrc = null

      list.addEventListener('dragstart', e => {
        dragSrc = e.target.closest('.inv-row')
        if (!dragSrc) return
        dragSrc.classList.add('inv-row--dragging')
        e.dataTransfer.effectAllowed = 'move'
      })

      list.addEventListener('dragover', e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const target = e.target.closest('.inv-row')
        if (!target || target === dragSrc) return
        list.querySelectorAll('.inv-row').forEach(r => r.classList.remove('inv-row--drag-over'))
        target.classList.add('inv-row--drag-over')
      })

      list.addEventListener('dragleave', e => {
        if (!e.relatedTarget?.closest?.('#inv-list')) {
          list.querySelectorAll('.inv-row').forEach(r => r.classList.remove('inv-row--drag-over'))
        }
      })

      list.addEventListener('drop', async e => {
        e.preventDefault()
        const target = e.target.closest('.inv-row')
        list.querySelectorAll('.inv-row').forEach(r => r.classList.remove('inv-row--drag-over', 'inv-row--dragging'))
        if (!target || !dragSrc || target === dragSrc) return

        // Reorder in DOM
        const rows = [...list.querySelectorAll('.inv-row')]
        const srcIdx = rows.indexOf(dragSrc)
        const tgtIdx = rows.indexOf(target)
        if (srcIdx < tgtIdx) target.after(dragSrc)
        else target.before(dragSrc)

        // Persist new order
        const order = [...list.querySelectorAll('.inv-row')].map(r => r.dataset.id)
        api('PATCH', '/inventories/reorder', { order }).catch(() => {})
      })

      list.addEventListener('dragend', () => {
        list.querySelectorAll('.inv-row').forEach(r => r.classList.remove('inv-row--dragging', 'inv-row--drag-over'))
        dragSrc = null
      })
    }
  } catch (err) {
    setHTML(`<div class="alert alert-error">${err.message}</div>`)
  }
}

function routeInventoryNew() {
  if (!auth.isLoggedIn) return navigate('/login')
  setHTML(`
    <div>
      <div class="page-header">
        <a href="/inventories" data-link class="btn btn-ghost btn-sm">← Back</a>
        <h1 class="page-title mt-4">New Inventory</h1>
      </div>
      <div class="card">
        <div class="card-body">
          <div id="form-error" role="alert"></div>
          <form id="new-inventory-form">
            <div class="field">
              <label for="inv-name">Name</label>
              <input type="text" id="inv-name" name="name" placeholder="e.g. Home, Workshop, Office" required autofocus>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Create inventory</button>
              <a href="/inventories" data-link class="btn btn-secondary">Cancel</a>
            </div>
          </form>
        </div>
      </div>
    </div>
  `)

  document.getElementById('new-inventory-form').addEventListener('submit', async e => {
    e.preventDefault()
    const btn = e.target.querySelector('[type=submit]')
    const errEl = document.getElementById('form-error')
    errEl.innerHTML = ''
    btn.disabled = true
    try {
      const data = await api('POST', '/inventories', { name: e.target.name.value })
      if (data) navigate(`/inventories/${data.inventory.id}`)
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error mb-4">${err.message}</div>`
      btn.disabled = false
    }
  })
}

async function routeInventory(matches) {
  if (!auth.isLoggedIn) return navigate('/login')
  const inventoryId = matches[1]
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  try {
    const [invData, membersData, locData, catData] = await Promise.all([
      api('GET', `/inventories/${inventoryId}`),
      api('GET', `/inventories/${inventoryId}/members`),
      api('GET', `/inventories/${inventoryId}/locations`),
      api('GET', `/inventories/${inventoryId}/categories`),
    ])
    if (!invData || !membersData) return

    const { inventory } = invData
    const { members } = membersData
    let locations = locData?.locations ?? []
    let categories = catData?.categories ?? []
    const isOwner = inventory.role === 'owner'
    const canEdit = inventory.role === 'owner' || inventory.role === 'editor'

    const roleBadgeClass = { owner: 'badge-green', editor: 'badge-orange', viewer: 'badge-gray' }
    const roleLabel = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' }

    const membersHTML = members.map(m => `
      <div class="member-row">
        <div class="member-avatar">${escapeHTML(m.name[0].toUpperCase())}</div>
        <div class="member-info">
          <div class="font-medium">${escapeHTML(m.name)}</div>
          <div class="text-xs text-muted">${escapeHTML(m.email)}</div>
        </div>
        ${isOwner && m.id !== auth.user?.id ? `
          <select class="role-select" data-user-id="${m.id}" data-current="${m.role}" aria-label="Change role for ${escapeHTML(m.name)}">
            <option value="editor" ${m.role === 'editor' ? 'selected' : ''}>Editor</option>
            <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Viewer</option>
          </select>
          <button class="btn btn-ghost btn-sm btn-remove-member" data-user-id="${m.id}" data-name="${escapeHTML(m.name)}" aria-label="Remove ${escapeHTML(m.name)}">✕</button>
        ` : `<span class="badge ${roleBadgeClass[m.role]}">${roleLabel[m.role]}</span>`}
      </div>
    `).join('')

    setHTML(`
      <div>
        <div class="page-header">
          <a href="/inventories" data-link class="btn btn-ghost btn-sm">← Inventories</a>
          <div class="page-header-row mt-4">
            <div>
              <h1 class="page-title">${escapeHTML(inventory.name)}</h1>
              <p class="page-subtitle">
                ${inventory.item_count} item${inventory.item_count !== 1 ? 's' : ''}
                · <span class="badge ${roleBadgeClass[inventory.role]}">${roleLabel[inventory.role]}</span>
              </p>
            </div>
            ${canEdit ? `<a href="/inventories/${inventoryId}/items/new" data-link class="btn btn-primary btn-sm">+ Add item</a>` : ''}
          </div>
        </div>

        <a href="/inventories/${inventoryId}/items" data-link class="btn btn-secondary btn-full mb-6">
          Browse items →
        </a>

        <!-- Locations & Categories -->
        ${canEdit ? `
        <div class="card mb-4">
          <div class="card-header"><h2 class="font-semi">Organize</h2></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:var(--space-5)">

            <div>
              <div class="text-sm font-medium mb-2">Locations</div>
              <div id="loc-tree"></div>
              <form id="add-room-form" class="inline-add-form mt-2">
                <input type="text" id="room-input" placeholder="Add room…" maxlength="80">
                <button type="submit" class="btn btn-secondary btn-sm">+ Room</button>
              </form>
            </div>

            <div>
              <div class="text-sm font-medium mb-2">Categories</div>
              <div class="tag-list mb-3" id="cat-list">
                ${categories.map(c => `
                  <span class="tag" data-cat-id="${c.id}">
                    ${escapeHTML(c.name)}
                    <button class="tag__remove" data-cat-id="${c.id}" aria-label="Remove ${escapeHTML(c.name)}">×</button>
                  </span>
                `).join('')}
              </div>
              <form id="add-cat-form" class="inline-add-form">
                <input type="text" id="cat-input" placeholder="Add category…" maxlength="80">
                <button type="submit" class="btn btn-secondary btn-sm">Add</button>
              </form>
            </div>

          </div>
        </div>
        ` : ''}

        <!-- Members -->
        <div class="card mb-4">
          <div class="card-header">
            <h2 class="font-semi">Members <span class="text-muted font-normal">(${members.length})</span></h2>
            ${isOwner ? `<button class="btn btn-ghost btn-sm" id="btn-invite-toggle">+ Invite</button>` : ''}
          </div>

          ${isOwner ? `
          <div id="invite-form-wrap" hidden style="border-bottom:1px solid var(--c-border)">
            <div class="card-body">
              <div id="invite-msg" role="alert"></div>
              <form id="invite-form">
                <div class="field">
                  <label for="invite-email">Email address</label>
                  <input type="email" id="invite-email" name="email" required placeholder="teammate@example.com">
                </div>
                <div class="field">
                  <label for="invite-role">Role</label>
                  <select id="invite-role" name="role">
                    <option value="editor">Editor — can add and edit items</option>
                    <option value="viewer">Viewer — read only</option>
                  </select>
                </div>
                <div class="form-actions">
                  <button type="submit" class="btn btn-primary btn-sm">Send invite</button>
                  <button type="button" class="btn btn-ghost btn-sm" id="btn-invite-cancel">Cancel</button>
                </div>
              </form>
            </div>
          </div>
          ` : ''}

          <div class="card-body" style="display:flex;flex-direction:column;gap:var(--space-3)">
            ${membersHTML}
          </div>
        </div>

        ${isOwner ? `
        <!-- Settings -->
        <div class="card mb-4">
          <div class="card-header">
            <h2 class="font-semi">Settings</h2>
          </div>
          <div class="card-body">
            <p class="text-sm text-muted mb-3">Rename this inventory</p>
            <div id="rename-msg" role="alert"></div>
            <form id="rename-form" class="flex gap-3 items-center">
              <div class="field" style="flex:1;margin:0">
                <input type="text" id="rename-input" name="name" value="${escapeHTML(inventory.name)}" required>
              </div>
              <button type="submit" class="btn btn-secondary btn-sm">Rename</button>
            </form>
          </div>
        </div>

        <!-- Danger zone -->
        <div class="card" style="border-color:#fecaca">
          <div class="card-header">
            <h2 class="font-semi" style="color:var(--c-danger)">Danger zone</h2>
          </div>
          <div class="card-body">
            <p class="text-sm text-muted mb-4">
              Permanently delete this inventory and all its items. There is no undo.
            </p>
            <button class="btn btn-danger btn-sm" id="btn-delete-inv">Delete inventory</button>
          </div>
        </div>
        ` : ''}
      </div>
    `)

    // ── Locations & Categories ─────────────────────────────────────────────
    if (canEdit) {
      // Hierarchical location tree (depth 0=room, 1=shelf, 2=container)
      const depthLabel = ['Room', 'Shelf', 'Container']
      const childLabel = ['+ Shelf', '+ Container']

      function buildTree(nodes, parentId = null) {
        return nodes
          .filter(n => (n.parent_id ?? null) === parentId)
          .map(n => ({ ...n, children: buildTree(nodes, n.id) }))
      }

      function startInlineEdit(nameEl, onSave) {
        const original = nameEl.textContent.trim()
        const input = document.createElement('input')
        input.className = 'inline-edit-input'
        input.value = original
        input.maxLength = 80
        nameEl.replaceWith(input)
        input.focus()
        input.select()
        async function commit() {
          const val = input.value.trim()
          if (!val || val === original) { renderLocTree(); return }
          try { await onSave(val) } catch (err) { alert(err.message); renderLocTree() }
        }
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { renderLocTree() }
        })
        input.addEventListener('blur', commit)
      }

      function renderLocTree() {
        const tree = buildTree(locations)
        const container = document.getElementById('loc-tree')
        container.innerHTML = renderNodes(tree, 0)
        container.querySelectorAll('.loc-delete').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id
            try {
              await api('DELETE', `/inventories/${inventoryId}/locations/${id}`)
              const idx = locations.findIndex(l => l.id === id)
              if (idx !== -1) locations.splice(idx, 1)
              locations.forEach(l => { if (l.parent_id === id) l.parent_id = null })
              renderLocTree()
            } catch (err) { alert(err.message) }
          })
        })
        container.querySelectorAll('.loc-node__name').forEach(nameEl => {
          nameEl.addEventListener('click', () => {
            const id = nameEl.dataset.id
            startInlineEdit(nameEl, async val => {
              await api('PATCH', `/inventories/${inventoryId}/locations/${id}`, { name: val })
              const loc = locations.find(l => l.id === id)
              if (loc) loc.name = val
              renderLocTree()
            })
          })
        })
        container.querySelectorAll('.loc-add-child-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const form = container.querySelector(`.loc-child-form[data-parent="${btn.dataset.parent}"]`)
            if (form) { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus() }
          })
        })
        container.querySelectorAll('.loc-child-form').forEach(form => {
          form.addEventListener('submit', async e => {
            e.preventDefault()
            const input = form.querySelector('input')
            const name = input.value.trim()
            if (!name) return
            try {
              const data = await api('POST', `/inventories/${inventoryId}/locations`, {
                name,
                parent_id: form.dataset.parent,
              })
              if (data) { locations.push(data.location); renderLocTree() }
              input.value = ''
            } catch (err) { alert(err.message) }
          })
        })
      }

      function renderNodes(nodes, depth) {
        if (!nodes.length && depth > 0) return ''
        return nodes.map(node => `
          <div class="loc-node loc-depth-${depth}">
            <div class="loc-node__row">
              <span class="loc-depth-label">${depthLabel[depth] ?? 'Location'}</span>
              <span class="loc-node__name editable-name" data-id="${node.id}" title="Click to rename">${escapeHTML(node.name)}</span>
              ${depth < 2 ? `<button class="btn btn-ghost btn-xs loc-add-child-btn" data-parent="${node.id}">${childLabel[depth]}</button>` : ''}
              <button class="btn btn-ghost btn-xs loc-delete" data-id="${node.id}" aria-label="Delete">×</button>
            </div>
            ${depth < 2 ? `
            <form class="inline-add-form loc-child-form mt-1 mb-1" data-parent="${node.id}" hidden>
              <input type="text" placeholder="Add ${depthLabel[depth + 1].toLowerCase()}…" maxlength="80">
              <button type="submit" class="btn btn-secondary btn-sm">Add</button>
            </form>` : ''}
            ${node.children.length ? `<div class="loc-children">${renderNodes(node.children, depth + 1)}</div>` : ''}
          </div>
        `).join('')
      }

      renderLocTree()

      document.getElementById('add-room-form').addEventListener('submit', async e => {
        e.preventDefault()
        const input = document.getElementById('room-input')
        const name = input.value.trim()
        if (!name) return
        try {
          const data = await api('POST', `/inventories/${inventoryId}/locations`, { name })
          if (data) { locations.push(data.location); renderLocTree() }
          input.value = ''
        } catch (err) { alert(err.message) }
      })

      function renderTags(list, containerId, deletePath) {
        const el = document.getElementById(containerId)
        el.innerHTML = list.map(item => `
          <span class="tag">
            <span class="tag-name editable-name" data-id="${item.id}" title="Click to rename">${escapeHTML(item.name)}</span>
            <button class="tag__remove" data-id="${item.id}" aria-label="Remove ${escapeHTML(item.name)}">×</button>
          </span>
        `).join('')
        el.querySelectorAll('.tag__remove').forEach(btn => {
          btn.addEventListener('click', async () => {
            try {
              await api('DELETE', `/inventories/${inventoryId}/${deletePath}/${btn.dataset.id}`)
              list.splice(list.findIndex(i => i.id === btn.dataset.id), 1)
              renderTags(list, containerId, deletePath)
            } catch (err) { alert(err.message) }
          })
        })
        el.querySelectorAll('.tag-name').forEach(nameEl => {
          nameEl.addEventListener('click', () => {
            const id = nameEl.dataset.id
            const original = nameEl.textContent.trim()
            const input = document.createElement('input')
            input.className = 'inline-edit-input inline-edit-input--tag'
            input.value = original
            input.maxLength = 80
            nameEl.replaceWith(input)
            input.focus()
            input.select()
            async function commit() {
              const val = input.value.trim()
              if (!val || val === original) { renderTags(list, containerId, deletePath); return }
              try {
                await api('PATCH', `/inventories/${inventoryId}/${deletePath}/${id}`, { name: val })
                const item = list.find(i => i.id === id)
                if (item) item.name = val
                renderTags(list, containerId, deletePath)
              } catch (err) { alert(err.message); renderTags(list, containerId, deletePath) }
            }
            input.addEventListener('keydown', e => {
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Escape') { renderTags(list, containerId, deletePath) }
            })
            input.addEventListener('blur', commit)
          })
        })
      }

      renderTags(categories, 'cat-list', 'categories')

      document.getElementById('add-cat-form').addEventListener('submit', async e => {
        e.preventDefault()
        const input = document.getElementById('cat-input')
        const name = input.value.trim()
        if (!name) return
        try {
          const data = await api('POST', `/inventories/${inventoryId}/categories`, { name })
          if (data) { categories.push(data.category); renderTags(categories, 'cat-list', 'categories') }
          input.value = ''
        } catch (err) { alert(err.message) }
      })
    }

    // ── Invite toggle ──────────────────────────────────────────────────────
    if (isOwner) {
      const inviteWrap = document.getElementById('invite-form-wrap')
      document.getElementById('btn-invite-toggle').addEventListener('click', () => {
        inviteWrap.hidden = false
        document.getElementById('invite-email').focus()
      })
      document.getElementById('btn-invite-cancel').addEventListener('click', () => {
        inviteWrap.hidden = true
      })

      document.getElementById('invite-form').addEventListener('submit', async e => {
        e.preventDefault()
        const btn = e.target.querySelector('[type=submit]')
        const msgEl = document.getElementById('invite-msg')
        msgEl.innerHTML = ''
        btn.disabled = true
        try {
          await api('POST', `/inventories/${inventoryId}/invite`, {
            email: e.target.email.value,
            role: e.target.role.value,
          })
          inviteWrap.hidden = true
          e.target.reset()
          msgEl.innerHTML = '<div class="alert alert-success mb-4">Invite sent!</div>'
          setTimeout(() => { msgEl.innerHTML = '' }, 4000)
        } catch (err) {
          msgEl.innerHTML = `<div class="alert alert-error mb-4">${err.message}</div>`
        } finally {
          btn.disabled = false
        }
      })

      // ── Role changes ───────────────────────────────────────────────────
      document.querySelectorAll('.role-select').forEach(sel => {
        sel.addEventListener('change', async () => {
          const prev = sel.dataset.current
          try {
            await api('PATCH', `/inventories/${inventoryId}/members/${sel.dataset.userId}`, { role: sel.value })
            sel.dataset.current = sel.value
          } catch (err) {
            alert(err.message)
            sel.value = prev
          }
        })
      })

      // ── Remove member ──────────────────────────────────────────────────
      document.querySelectorAll('.btn-remove-member').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm(`Remove ${btn.dataset.name} from this inventory?`)) return
          try {
            await api('DELETE', `/inventories/${inventoryId}/members/${btn.dataset.userId}`)
            navigate(`/inventories/${inventoryId}`)
          } catch (err) { alert(err.message) }
        })
      })

      // ── Rename ─────────────────────────────────────────────────────────
      document.getElementById('rename-form').addEventListener('submit', async e => {
        e.preventDefault()
        const msgEl = document.getElementById('rename-msg')
        msgEl.innerHTML = ''
        try {
          await api('PATCH', `/inventories/${inventoryId}`, { name: e.target.name.value.trim() })
          navigate(`/inventories/${inventoryId}`)
        } catch (err) {
          msgEl.innerHTML = `<div class="alert alert-error mb-4">${err.message}</div>`
        }
      })

      // ── Delete inventory ───────────────────────────────────────────────
      document.getElementById('btn-delete-inv').addEventListener('click', async () => {
        if (!confirm(`Delete "${inventory.name}" and all its items? This cannot be undone.`)) return
        try {
          await api('DELETE', `/inventories/${inventoryId}`)
          navigate('/inventories')
        } catch (err) { alert(err.message) }
      })
    }
  } catch (err) {
    setHTML(`<div class="alert alert-error">${err.message}</div>`)
  }
}

async function routeItems(matches) {
  if (!auth.isLoggedIn) return navigate('/login')
  const inventoryId = matches[1]
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  try {
    const [invData, itemsData] = await Promise.all([
      api('GET', `/inventories/${inventoryId}`),
      api('GET', `/inventories/${inventoryId}/items`),
    ])
    if (!invData || !itemsData) return

    const { inventory } = invData
    const { items } = itemsData

    const typeIcon = { physical: '📦', digital: '💾', subscription: '🔄', document: '📄' }

    const listHTML = items.length === 0
      ? `<div class="empty-state">
           <div class="empty-state__icon">✨</div>
           <div class="empty-state__title">Nothing stashed yet</div>
           <div class="empty-state__body">Add your first item to start tracking.</div>
           <a href="/inventories/${inventoryId}/items/new" data-link class="btn btn-primary">Add item</a>
         </div>`
      : `<div class="item-list">
           ${items.map(item => `
             <a href="/inventories/${inventoryId}/items/${item.id}" data-link class="item-row" data-type="${item.item_type}">
               <div class="item-row__photo item-row__photo--placeholder">${typeIcon[item.item_type] ?? '📦'}</div>
               <div class="item-row__info">
                 <div class="item-row__name">${escapeHTML(item.name)}</div>
                 <div class="item-row__meta">${escapeHTML(item.category_name ?? item.location_name ?? item.item_type)}</div>
               </div>
               <div class="item-row__qty">${item.quantity}${item.unit ? ' ' + escapeHTML(item.unit) : ''}</div>
             </a>
           `).join('')}
         </div>`

    setHTML(`
      <div>
        <div class="page-header page-header-row">
          <div>
            <a href="/inventories/${inventoryId}" data-link class="btn btn-ghost btn-sm">← ${escapeHTML(inventory.name)}</a>
            <h1 class="page-title mt-4">Items</h1>
          </div>
          <a href="/inventories/${inventoryId}/items/new" data-link class="btn btn-primary btn-sm">+ Add</a>
        </div>
        ${listHTML}
      </div>
    `)
  } catch (err) {
    setHTML(`<div class="alert alert-error">${err.message}</div>`)
  }
}

async function routeItemNew(matches) {
  if (!auth.isLoggedIn) return navigate('/login')
  const inventoryId = matches[1]
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  const [locData, catData] = await Promise.all([
    api('GET', `/inventories/${inventoryId}/locations`),
    api('GET', `/inventories/${inventoryId}/categories`),
  ])
  const locations = locData?.locations ?? []
  const categories = catData?.categories ?? []

  function buildLocOptions(nodes, parentId = null, depth = 0) {
    return nodes
      .filter(n => (n.parent_id ?? null) === parentId)
      .flatMap(n => [
        `<option value="${n.id}">${'\u00a0\u00a0'.repeat(depth)}${escapeHTML(n.name)}</option>`,
        ...buildLocOptions(nodes, n.id, depth + 1),
      ])
  }
  const locOptions = `<option value="">— None —</option>` + buildLocOptions(locations).join('')
  const catOptions = `<option value="">— None —</option>` +
    categories.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('')

  setHTML(`
    <div>
      <div class="page-header">
        <a href="/inventories/${inventoryId}/items" data-link class="btn btn-ghost btn-sm">← Items</a>
        <h1 class="page-title mt-4">Add Item</h1>
      </div>
      <div class="card">
        <div class="card-body">
          <div id="form-error" role="alert"></div>
          <form id="new-item-form">
            <div class="field">
              <label for="item-name">Name <span aria-hidden="true">*</span></label>
              <input type="text" id="item-name" name="name" required autofocus>
            </div>
            <div class="field">
              <label for="item-qty">Quantity</label>
              <quantity-stepper>
                <button type="button" data-action="decrement" aria-label="Decrease">−</button>
                <input type="number" id="item-qty" name="quantity" value="1" min="0" step="any">
                <button type="button" data-action="increment" aria-label="Increase">+</button>
              </quantity-stepper>
            </div>
            <div class="field">
              <label for="item-unit">Unit</label>
              <input type="text" id="item-unit" name="unit" placeholder="e.g. kg, boxes, units">
            </div>
            ${locations.length ? `
            <div class="field">
              <label for="item-location">Location</label>
              <select id="item-location" name="location_id">${locOptions}</select>
            </div>` : ''}
            ${categories.length ? `
            <div class="field">
              <label for="item-category">Category</label>
              <select id="item-category" name="category_id">${catOptions}</select>
            </div>` : ''}
            <div class="field">
              <label for="item-type">Type</label>
              <select id="item-type" name="item_type">
                <option value="physical">Physical</option>
                <option value="digital">Digital</option>
                <option value="subscription">Subscription</option>
                <option value="document">Document</option>
              </select>
            </div>
            <div class="field">
              <label for="item-desc">Description</label>
              <textarea id="item-desc" name="description" rows="2"></textarea>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Add item</button>
              <a href="/inventories/${inventoryId}/items" data-link class="btn btn-secondary">Cancel</a>
            </div>
          </form>
        </div>
      </div>
    </div>
  `)

  document.getElementById('new-item-form').addEventListener('submit', async e => {
    e.preventDefault()
    const btn = e.target.querySelector('[type=submit]')
    const errEl = document.getElementById('form-error')
    errEl.innerHTML = ''
    btn.disabled = true
    try {
      const data = await api('POST', `/inventories/${inventoryId}/items`, {
        name: e.target.name.value,
        quantity: Number(e.target.quantity.value),
        unit: e.target.unit.value || undefined,
        location_id: e.target.location_id?.value || undefined,
        category_id: e.target.category_id?.value || undefined,
        item_type: e.target.item_type.value,
        description: e.target.description.value || undefined,
      })
      if (data) navigate(`/inventories/${inventoryId}/items/${data.item.id}`)
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error mb-4">${err.message}</div>`
      btn.disabled = false
    }
  })
}

async function routeItem(matches) {
  if (!auth.isLoggedIn) return navigate('/login')
  const [, inventoryId, itemId] = matches
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  try {
    const data = await api('GET', `/inventories/${inventoryId}/items/${itemId}`)
    if (!data) return
    const { item, photos, logs } = data

    const logsHTML = logs.length === 0
      ? '<p class="text-sm text-muted">No usage history yet.</p>'
      : logs.map(log => `
          <div class="flex items-center gap-3 text-sm">
            <span class="badge ${log.direction === 'used' ? 'badge-orange' : 'badge-green'}">
              ${log.direction === 'used' ? '−' : '+'}${log.amount}
            </span>
            <span class="text-muted">${escapeHTML(log.user_name ?? 'Unknown')}</span>
            <span class="text-muted">${formatDate(log.created_at)}</span>
            ${log.note ? `<span class="text-muted">· ${escapeHTML(log.note)}</span>` : ''}
          </div>
        `).join('')

    function photosHTML(photoList) {
      return `
        <div class="photo-gallery" id="photo-gallery">
          ${photoList.map(p => `
            <div class="photo-gallery__item" data-photo-id="${p.id}">
              <img src="${p.url}" alt="Item photo" loading="lazy">
              <button class="photo-gallery__delete" aria-label="Delete photo" data-photo-id="${p.id}">×</button>
            </div>
          `).join('')}
          <label class="photo-gallery__add" aria-label="Add photo">
            <input type="file" accept="image/*" capture="environment" id="photo-input" style="display:none">
            <span class="photo-gallery__add-icon">📷</span>
            <span class="text-xs">Add photo</span>
          </label>
        </div>
      `
    }

    setHTML(`
      <div>
        <div class="page-header">
          <a href="/inventories/${inventoryId}/items" data-link class="btn btn-ghost btn-sm">← Items</a>
          <h1 class="page-title mt-4">${escapeHTML(item.name)}</h1>
          ${item.category_name ? `<p class="page-subtitle">${escapeHTML(item.category_name)}</p>` : ''}
        </div>

        <div class="card mb-4">
          <div class="card-body">
            <div class="flex items-center justify-between mb-4">
              <div>
                <div class="text-xs text-muted font-medium" style="text-transform:uppercase;letter-spacing:.05em">Quantity</div>
                <div style="font-size:var(--text-3xl);font-weight:var(--weight-bold);color:var(--c-brand);line-height:1.2">
                  ${item.quantity}${item.unit ? ' <span style="font-size:var(--text-lg)">' + escapeHTML(item.unit) + '</span>' : ''}
                </div>
              </div>
              <quantity-stepper data-item-id="${item.id}" data-inventory-id="${inventoryId}">
                <button type="button" data-action="decrement" aria-label="Use one">−</button>
                <input type="number" value="1" min="0.01" step="any" aria-label="Amount">
                <button type="button" data-action="increment" aria-label="Restock one">+</button>
              </quantity-stepper>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-secondary btn-sm" id="btn-use">Log use</button>
              <button class="btn btn-secondary btn-sm" id="btn-restock">Restock</button>
            </div>
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-header">
            <h2 class="section-title" style="margin:0">Photos</h2>
          </div>
          <div class="card-body">
            ${photosHTML(photos)}
          </div>
        </div>

        ${item.description ? `<div class="card mb-4"><div class="card-body text-sm">${escapeHTML(item.description)}</div></div>` : ''}

        <div class="card">
          <div class="card-header">
            <h2 class="section-title" style="margin:0">Usage history</h2>
          </div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:var(--space-3)">
            ${logsHTML}
          </div>
        </div>
      </div>
    `)

    // Wire up use/restock buttons
    async function logUse(direction) {
      const stepper = document.querySelector('quantity-stepper input')
      const amount = Number(stepper?.value ?? 1)
      try {
        const res = await api('POST', `/inventories/${inventoryId}/items/${itemId}/use`, {
          amount, direction, note: ''
        })
        if (res) navigate(`/inventories/${inventoryId}/items/${itemId}`)
      } catch (err) {
        alert(err.message)
      }
    }

    document.getElementById('btn-use').addEventListener('click', () => logUse('used'))
    document.getElementById('btn-restock').addEventListener('click', () => logUse('restocked'))

    // Wire up photo upload
    document.getElementById('photo-input').addEventListener('change', async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const form = new FormData()
      form.append('photo', file)
      try {
        const headers = {}
        if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`
        const res = await fetch(`/api/inventories/${inventoryId}/items/${itemId}/photos`, {
          method: 'POST', headers, body: form,
        })
        if (res.status === 401) { auth.clear(); return navigate('/login') }
        if (!res.ok) { const d = await res.json().catch(() => null); throw new Error(d?.error ?? 'Upload failed') }
        navigate(`/inventories/${inventoryId}/items/${itemId}`)
      } catch (err) {
        alert(err.message)
      }
    })

    // Wire up photo delete
    document.getElementById('photo-gallery').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-photo-id].photo-gallery__delete')
      if (!btn) return
      if (!confirm('Delete this photo?')) return
      const photoId = btn.dataset.photoId
      try {
        await api('DELETE', `/inventories/${inventoryId}/items/${itemId}/photos/${photoId}`)
        navigate(`/inventories/${inventoryId}/items/${itemId}`)
      } catch (err) {
        alert(err.message)
      }
    })

  } catch (err) {
    setHTML(`<div class="alert alert-error">${err.message}</div>`)
  }
}

function routeProfile() {
  if (!auth.isLoggedIn) return navigate('/login')
  const user = auth.user
  setHTML(`
    <div>
      <div class="page-header">
        <h1 class="page-title">Profile</h1>
      </div>
      <div class="card">
        <div class="card-body">
          <p class="font-semi">${escapeHTML(user?.name ?? '')}</p>
          <p class="text-sm text-muted mt-2">${escapeHTML(user?.email ?? '')}</p>
          <div class="form-actions mt-6">
            <button class="btn btn-danger btn-sm" id="btn-signout">Sign out</button>
          </div>
        </div>
      </div>
    </div>
  `)
  document.getElementById('btn-signout').addEventListener('click', () => {
    auth.clear()
    navigate('/login')
  })
}

async function routeInvite(matches) {
  const token = matches[1]
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  try {
    const data = await api('GET', `/invite/${token}`)
    if (!data) return

    const { inventory, role, invited_by_name } = data
    const roleLabel = { editor: 'Editor', viewer: 'Viewer' }
    const encodedRedirect = encodeURIComponent(`/invite/${token}`)

    setHTML(`
      <div class="auth-page">
        <div class="auth-card">
          <div class="auth-logo">
            <div class="auth-logo__mark">🐼</div>
            <div class="auth-logo__name">Stash Panda</div>
          </div>
          <h1 class="auth-title">You're invited!</h1>
          <p class="text-sm text-muted text-center" style="line-height:1.6">
            <strong>${escapeHTML(invited_by_name)}</strong> invited you to join<br>
            <strong>${escapeHTML(inventory.name)}</strong>
            as a <span class="badge badge-${role === 'editor' ? 'orange' : 'gray'}">${roleLabel[role] ?? role}</span>.
          </p>
          <div id="invite-error" role="alert"></div>
          <div class="form-actions mt-6" style="flex-direction:column">
            ${auth.isLoggedIn
              ? `<button class="btn btn-primary btn-full btn-lg" id="btn-accept">Accept &amp; join</button>`
              : `<a href="/login?redirect=${encodedRedirect}" data-link class="btn btn-primary btn-full btn-lg">Sign in to accept</a>
                 <a href="/signup?redirect=${encodedRedirect}" data-link class="btn btn-secondary btn-full">Create account</a>`
            }
          </div>
          ${auth.isLoggedIn ? `<p class="auth-footer">Joining as <strong>${escapeHTML(auth.user?.name ?? '')}</strong></p>` : ''}
        </div>
      </div>
    `)

    if (auth.isLoggedIn) {
      document.getElementById('btn-accept').addEventListener('click', async e => {
        const btn = e.currentTarget
        btn.disabled = true
        btn.textContent = 'Joining…'
        try {
          const res = await api('POST', `/invite/${token}/accept`)
          if (res) navigate(`/inventories/${res.inventory_id}`)
        } catch (err) {
          document.getElementById('invite-error').innerHTML =
            `<div class="alert alert-error mt-4">${err.message}</div>`
          btn.disabled = false
          btn.textContent = 'Accept & join'
        }
      })
    }
  } catch {
    setHTML(`
      <div class="auth-page">
        <div class="auth-card">
          <div class="auth-logo"><div class="auth-logo__mark">🐼</div></div>
          <h1 class="auth-title">Invite not found</h1>
          <p class="text-sm text-muted text-center">
            This invite may have expired or already been used.
          </p>
          <div class="form-actions mt-6">
            <a href="/" data-link class="btn btn-primary btn-full">Go home</a>
          </div>
        </div>
      </div>
    `)
  }
}

// ─── Router core ─────────────────────────────────────────────────────────────

export function navigate(path) {
  history.pushState(null, '', path)
  render(path)
}

function render(path) {
  for (const { pattern, handler } of routes) {
    const m = path.match(pattern)
    if (m) {
      setNav(auth.isLoggedIn)
      handler(m)
      return
    }
  }
  // 404
  setHTML(`
    <div class="empty-state">
      <div class="empty-state__icon">🤷</div>
      <div class="empty-state__title">Page not found</div>
      <div class="empty-state__body">That page doesn't seem to exist.</div>
      <a href="/" data-link class="btn btn-primary">Go home</a>
    </div>
  `)
}

// Intercept all data-link clicks
document.addEventListener('click', e => {
  const a = e.target.closest('[data-link]')
  if (!a || !a.href) return
  const url = new URL(a.href)
  if (url.origin !== location.origin) return
  e.preventDefault()
  navigate(url.pathname + url.search)
})

// Browser back/forward
window.addEventListener('popstate', () => render(location.pathname))

// ─── Utilities ───────────────────────────────────────────────────────────────

function inventoryIcon(name) {
  const n = name.toLowerCase()
  const rules = [
    [/\b(home|house|flat|apartment|condo|residence|cottage|cabin|hut)\b/, '🏠'],
    [/\b(car|auto|vehicle|truck|van|suv|jeep|pickup|motorhome|rv)\b/, '🚗'],
    [/\b(bike|bicycle|cycle|cycling)\b/, '🚲'],
    [/\b(motorbike|motorcycle|moped|scooter)\b/, '🏍️'],
    [/\b(boat|yacht|sailboat|canoe|kayak|vessel)\b/, '⛵'],
    [/\b(garage|workshop|shop|shed|studio)\b/, '🔧'],
    [/\b(kitchen|pantry|fridge|food|grocery|spice|cooking)\b/, '🍳'],
    [/\b(office|work|desk|computer|tech|electronics|equipment)\b/, '💼'],
    [/\b(clothes|clothing|wardrobe|closet|fashion|apparel)\b/, '👗'],
    [/\b(tools|hardware|toolbox)\b/, '🔨'],
    [/\b(garden|yard|outdoor|plant|greenhouse|nursery)\b/, '🌱'],
    [/\b(sport|gym|fitness|exercise|training|gear)\b/, '🏋️'],
    [/\b(books|library|reading|shelf)\b/, '📚'],
    [/\b(art|craft|hobby|creative|studio)\b/, '🎨'],
    [/\b(music|instrument|studio|band)\b/, '🎵'],
    [/\b(travel|luggage|bag|suitcase|adventure)\b/, '🧳'],
    [/\b(medical|pharmacy|medicine|health|first.?aid)\b/, '💊'],
    [/\b(pet|dog|cat|animal|vet)\b/, '🐾'],
    [/\b(baby|nursery|kids|children|toy)\b/, '🧸'],
    [/\b(camera|photo|photography)\b/, '📷'],
    [/\b(game|gaming|console|video.?game)\b/, '🎮'],
    [/\b(wine|bar|cellar|drinks|spirits|beer|liquor)\b/, '🍷'],
    [/\b(warehouse|storage|stock|inventory|supply|supplies)\b/, '🏭'],
    [/\b(office supplies|stationery|paper)\b/, '📎'],
    [/\b(holiday|christmas|seasonal|decoration)\b/, '🎄'],
  ]
  for (const [pattern, icon] of rules) {
    if (pattern.test(n)) return icon
  }
  return '📦'
}

function escapeHTML(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(unixSeconds) {
  const d = new Date(Number(unixSeconds) * 1000)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
render(location.pathname)
