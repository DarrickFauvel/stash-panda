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
  const headers = {}
  if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`

  let fetchBody
  if (body instanceof FormData) {
    fetchBody = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    fetchBody = JSON.stringify(body)
  }

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: fetchBody,
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

// crumbs: [{label, href?}, ...] — last item is current page (no href)
function setBreadcrumb(crumbs) {
  const bar = document.getElementById('breadcrumb-bar')
  const backBar = document.getElementById('back-bar')
  if (!crumbs.length) {
    bar.hidden = true; bar.innerHTML = ''
    backBar.hidden = true; backBar.innerHTML = ''
    return
  }
  bar.hidden = false
  bar.innerHTML = crumbs.map((c, i) => {
    const isLast = i === crumbs.length - 1
    return isLast
      ? `<span class="breadcrumb__item breadcrumb__item--current">${escapeHTML(c.label)}</span>`
      : `<a href="${c.href}" data-link class="breadcrumb__item">${escapeHTML(c.label)}</a>
         <span class="breadcrumb__sep" aria-hidden="true">›</span>`
  }).join('')

  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null
  if (parent) {
    backBar.hidden = false
    backBar.innerHTML = `<a href="${parent.href}" data-link class="back-link">‹ back</a>`
  } else {
    backBar.hidden = true; backBar.innerHTML = ''
  }
}

function userInitials(name) {
  return (name ?? '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function openAvatarCropper(source, onConfirm) {
  const CANVAS_SIZE = 300
  const img = new Image()
  const isBlobUrl = typeof source !== 'string'
  const url = isBlobUrl ? URL.createObjectURL(source) : source

  img.onload = () => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal-dialog" style="max-width:360px">
        <div class="modal-dialog__header">
          <span style="font-weight:600">Crop photo</span>
          <button class="modal-dialog__close" id="crop-close" aria-label="Close">✕</button>
        </div>
        <div class="modal-dialog__body">
          <div class="crop-canvas-wrap">
            <canvas id="crop-canvas" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}"></canvas>
          </div>
          <div class="crop-zoom-controls">
            <button class="btn btn-ghost btn-sm btn-icon" id="crop-zoom-out" aria-label="Zoom out">−</button>
            <input type="range" id="crop-zoom-slider" min="0" max="100" value="0" class="crop-zoom-slider">
            <button class="btn btn-ghost btn-sm btn-icon" id="crop-zoom-in" aria-label="Zoom in">+</button>
          </div>
        </div>
        <div class="modal-dialog__footer">
          <button class="btn btn-ghost btn-sm" id="crop-cancel">Cancel</button>
          <button class="btn btn-primary btn-sm" id="crop-apply">Apply</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)

    const canvas = document.getElementById('crop-canvas')
    const ctx = canvas.getContext('2d')

    const minScale = Math.max(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height)
    let scale = minScale
    let ox = (CANVAS_SIZE - img.width * scale) / 2
    let oy = (CANVAS_SIZE - img.height * scale) / 2

    function clamp() {
      const w = img.width * scale
      const h = img.height * scale
      ox = w >= CANVAS_SIZE ? Math.min(0, Math.max(ox, CANVAS_SIZE - w)) : (CANVAS_SIZE - w) / 2
      oy = h >= CANVAS_SIZE ? Math.min(0, Math.max(oy, CANVAS_SIZE - h)) : (CANVAS_SIZE - h) / 2
    }

    function draw() {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
      ctx.drawImage(img, ox, oy, img.width * scale, img.height * scale)
      // Dimmed overlay with circular cutout
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.52)'
      ctx.beginPath()
      ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
      ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 3, 0, Math.PI * 2, true)
      ctx.fill('evenodd')
      ctx.restore()
      // Circle border
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 3, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    clamp()
    draw()

    // Mouse drag
    let dragging = false, dsx, dsy, dox, doy
    canvas.addEventListener('mousedown', e => {
      dragging = true; dsx = e.clientX; dsy = e.clientY; dox = ox; doy = oy
    })
    window.addEventListener('mousemove', e => {
      if (!dragging) return
      ox = dox + (e.clientX - dsx); oy = doy + (e.clientY - dsy); clamp(); draw()
    })
    window.addEventListener('mouseup', () => { dragging = false })

    // Touch drag + pinch
    let ltx, lty, lpd
    canvas.addEventListener('touchstart', e => {
      e.preventDefault()
      if (e.touches.length === 1) { ltx = e.touches[0].clientX; lty = e.touches[0].clientY }
      else if (e.touches.length === 2) {
        lpd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
      }
    }, { passive: false })
    canvas.addEventListener('touchmove', e => {
      e.preventDefault()
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - ltx, dy = e.touches[0].clientY - lty
        ltx = e.touches[0].clientX; lty = e.touches[0].clientY
        ox += dx; oy += dy; clamp(); draw()
      } else if (e.touches.length === 2) {
        const pd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
        zoomAround(CANVAS_SIZE / 2, CANVAS_SIZE / 2, pd / lpd)
        lpd = pd
      }
    }, { passive: false })

    // Scroll zoom
    canvas.addEventListener('wheel', e => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      zoomAround(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 0.9)
    }, { passive: false })

    const maxScale = minScale * 8
    const slider = document.getElementById('crop-zoom-slider')

    function scaleToSlider(s) {
      return Math.round(((s - minScale) / (maxScale - minScale)) * 100)
    }

    function zoomAround(cx, cy, factor) {
      const prev = scale
      scale = Math.max(minScale, Math.min(scale * factor, maxScale))
      const f = scale / prev
      ox = cx - f * (cx - ox); oy = cy - f * (cy - oy)
      clamp(); draw()
      slider.value = scaleToSlider(scale)
    }

    function zoomToCenter(newScale) {
      zoomAround(CANVAS_SIZE / 2, CANVAS_SIZE / 2, newScale / scale)
    }

    slider.addEventListener('input', () => {
      const newScale = minScale + (slider.value / 100) * (maxScale - minScale)
      zoomToCenter(newScale)
    })

    document.getElementById('crop-zoom-in').addEventListener('click', () => zoomAround(CANVAS_SIZE / 2, CANVAS_SIZE / 2, 1.2))
    document.getElementById('crop-zoom-out').addEventListener('click', () => zoomAround(CANVAS_SIZE / 2, CANVAS_SIZE / 2, 1 / 1.2))

    function close() { if (isBlobUrl) URL.revokeObjectURL(url); overlay.remove() }

    document.getElementById('crop-close').addEventListener('click', close)
    document.getElementById('crop-cancel').addEventListener('click', close)
    overlay.addEventListener('click', e => { if (e.target === overlay) close() })

    document.getElementById('crop-apply').addEventListener('click', () => {
      // Redraw the display canvas without the overlay, then capture it directly.
      // An offscreen canvas + clip produces a black JPEG when transparent areas
      // (outside the clip) get flattened; using the display canvas avoids that.
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
      ctx.drawImage(img, ox, oy, img.width * scale, img.height * scale)
      canvas.toBlob(blob => { close(); onConfirm(blob) }, 'image/jpeg', 0.92)
    })
  }

  img.onerror = () => URL.revokeObjectURL(url)
  img.src = url
}

function setNav(isLoggedIn) {
  document.getElementById('bottom-nav').hidden = !isLoggedIn

  const actions = document.getElementById('header-actions')
  if (isLoggedIn) {
    const user = auth.user
    const initials = userInitials(user?.name)
    const avatarInner = user?.avatar_url
      ? `<img src="${user.avatar_url}" alt="${escapeHTML(user?.name ?? '')}" class="user-avatar__img">`
      : `<span class="user-avatar__initials">${initials}</span>`

    actions.innerHTML = `
      <div class="user-avatar-wrap" id="user-avatar-wrap">
        <button class="user-avatar" id="btn-avatar" aria-haspopup="true" aria-expanded="false" title="${escapeHTML(user?.name ?? '')}">
          ${avatarInner}
        </button>
        <div class="avatar-menu" id="avatar-menu" hidden>
          <div class="avatar-menu__header">
            <div class="avatar-menu__name">${escapeHTML(user?.name ?? '')}</div>
            <div class="avatar-menu__email">${escapeHTML(user?.email ?? '')}</div>
          </div>
          <a href="/profile" data-link class="avatar-menu__item" id="avatar-menu-profile">Profile &amp; Settings</a>
          <button class="avatar-menu__item avatar-menu__item--danger" id="btn-logout">Sign out</button>
        </div>
      </div>
    `

    const btn = document.getElementById('btn-avatar')
    const menu = document.getElementById('avatar-menu')

    btn.addEventListener('click', e => {
      e.stopPropagation()
      const open = !menu.hidden
      menu.hidden = open
      btn.setAttribute('aria-expanded', String(!open))
    })

    document.getElementById('btn-logout').addEventListener('click', () => {
      auth.clear()
      navigate('/login')
    })

    document.getElementById('avatar-menu-profile').addEventListener('click', () => {
      menu.hidden = true
    })

    document.addEventListener('click', function closeMenu(e) {
      const wrap = document.getElementById('user-avatar-wrap')
      if (!wrap || !wrap.contains(e.target)) {
        if (menu && !menu.hidden) {
          menu.hidden = true
          btn.setAttribute('aria-expanded', 'false')
        }
        if (!wrap) document.removeEventListener('click', closeMenu)
      }
    })
  } else {
    actions.innerHTML = `<a href="/login" data-link class="btn btn-primary btn-sm">Sign in</a>`
  }

  // Highlight active bottom nav item
  const path = location.pathname
  document.querySelectorAll('.bottom-nav__item').forEach(a => {
    const route = a.dataset.nav
    const active = path.startsWith(`/${route}`)
    a.setAttribute('aria-current', active ? 'page' : 'false')
  })
}

// ─── User preferences (localStorage) ────────────────────────────────────────

export const prefs = {
  _key: 'sp_prefs',
  _data: null,
  _load() {
    if (!this._data) {
      try { this._data = JSON.parse(localStorage.getItem(this._key) ?? '{}') } catch { this._data = {} }
    }
    return this._data
  },
  get(key, def) { return this._load()[key] ?? def },
  set(key, val) { this._data = { ...this._load(), [key]: val }; localStorage.setItem(this._key, JSON.stringify(this._data)) },
  get locIcons() { return this.get('locIcons', true) },
  set locIcons(v) { this.set('locIcons', v) },
  get galaxyIcons() { return this.get('galaxyIcons', true) },
  set galaxyIcons(v) { this.set('galaxyIcons', v) },
}

// ─── Disposition ─────────────────────────────────────────────────────────────

const DISPOSITIONS = [
  { value: 'sell',    label: 'To Sell',   color: '#16a34a' },
  { value: 'donate',  label: 'To Donate', color: '#2563eb' },
  { value: 'discard', label: 'To Discard',color: '#dc2626' },
  { value: 'return',  label: 'To Return', color: '#d97706' },
  { value: 'lend',    label: 'To Lend',   color: '#7c3aed' },
]
const DISPOSITION_MAP = Object.fromEntries(DISPOSITIONS.map(d => [d.value, d]))

function dispositionBadge(value) {
  const d = DISPOSITION_MAP[value]
  if (!d) return ''
  return `<span class="disposition-badge" style="--d-color:${d.color}">${d.label}</span>`
}

// ─── Location label system ───────────────────────────────────────────────────
// Each location type maps to a 2-letter code used in compound labels like SH01-LV02

const LOC_TYPE_CODE = {
  room: 'RM', closet: 'CL', shelf: 'SH', level: 'LV', section: 'SC',
  drawer: 'DR', cabinet: 'CB', box: 'BX', banker_box: 'BB',
  shoebox: 'SB', bin: 'BN', basket: 'BK', tote: 'TT', bag: 'BG', other: 'OT',
}

function computeLocLabel(locId, allLocs) {
  const loc = allLocs.find(l => l.id === locId)
  if (!loc) return ''
  const code = LOC_TYPE_CODE[loc.location_type] ?? 'OT'
  const siblings = allLocs
    .filter(l => (l.parent_id ?? null) === (loc.parent_id ?? null) && l.location_type === loc.location_type)
    .sort((a, b) => a.name.localeCompare(b.name))
  const ordinal = String(siblings.findIndex(s => s.id === locId) + 1).padStart(2, '0')
  const myCode = code + ordinal
  if (loc.parent_id) {
    const parentLabel = computeLocLabel(loc.parent_id, allLocs)
    return parentLabel ? `${parentLabel}-${myCode}` : myCode
  }
  return myCode
}

// ─── Route handlers ──────────────────────────────────────────────────────────

const routes = [
  { pattern: /^\/$/, handler: routeHome },
  { pattern: /^\/login$/, handler: routeLogin },
  { pattern: /^\/signup$/, handler: routeSignup },
  { pattern: /^\/forgot-password$/, handler: routeForgotPassword },
  { pattern: /^\/reset-password$/, handler: routeResetPassword },
  { pattern: /^\/galaxies$/, handler: routeGalaxies },
  { pattern: /^\/galaxies\/new$/, handler: routeGalaxyNew },
  { pattern: /^\/galaxies\/([^/]+)$/, handler: routeGalaxy },
  { pattern: /^\/galaxies\/([^/]+)\/locations$/, handler: routeLocations },
  { pattern: /^\/galaxies\/([^/]+)\/locations\/([^/]+)$/, handler: routeLocation },
  { pattern: /^\/galaxies\/([^/]+)\/items$/, handler: routeItems },
  { pattern: /^\/galaxies\/([^/]+)\/items\/new$/, handler: routeItemNew },
  { pattern: /^\/galaxies\/([^/]+)\/items\/([^/]+)\/edit$/, handler: routeItemEdit },
  { pattern: /^\/galaxies\/([^/]+)\/items\/([^/]+)$/, handler: routeItem },
  { pattern: /^\/profile$/, handler: routeProfile },
  { pattern: /^\/invite\/([^/]+)$/, handler: routeInvite },
]

function routeHome() {
  if (auth.isLoggedIn) return navigate('/galaxies')
  setBreadcrumb([])
  setNav(false)
  setHTML(`
    <div class="welcome-page">
      <div class="welcome-hero">
        <div class="auth-logo">
          <div class="auth-logo__mark">🌌</div>
          <div class="auth-logo__name">Pocket Universe</div>
        </div>
        <p class="welcome-tagline">Track everything that matters — at home, at work, anywhere.</p>
      </div>

      <div class="welcome-features">
        <div class="welcome-feature">
          <span class="welcome-feature__icon">📦</span>
          <div>
            <strong>Any kind of inventory</strong>
            <p>Physical items, digital assets, subscriptions, documents — all in one place.</p>
          </div>
        </div>
        <div class="welcome-feature">
          <span class="welcome-feature__icon">👥</span>
          <div>
            <strong>Share with your people</strong>
            <p>Invite family, roommates, or coworkers to manage collections together.</p>
          </div>
        </div>
        <div class="welcome-feature">
          <span class="welcome-feature__icon">📶</span>
          <div>
            <strong>Works offline</strong>
            <p>Make changes anywhere — your data syncs when you're back online.</p>
          </div>
        </div>
      </div>

      <div class="welcome-actions">
        <a href="/signup" data-link class="btn btn-primary btn-lg btn-full">Get started free</a>
        <a href="/login" data-link class="btn btn-secondary btn-lg btn-full">Sign in</a>
      </div>

      <p class="welcome-footnote">No credit card required.</p>
    </div>
  `)
}

function initWelcomeCanvas() {
  const canvas = document.getElementById('star-canvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')

  let W, H

  function resize() {
    W = canvas.width  = window.innerWidth
    H = canvas.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)

  // ── Build bodies ──────────────────────────────────────���───────────────────
  const rand = (min, max) => Math.random() * (max - min) + min
  const bodies = []

  // Dot stars
  const starColors = ['#ffffff', '#e8eeff', '#fff8e8', '#f0e8ff']
  for (let i = 0; i < 55; i++) {
    bodies.push({
      type: 'star',
      x: rand(0, W), y: rand(0, H),
      r: rand(0.4, 1.8),
      color: starColors[Math.floor(Math.random() * starColors.length)],
      opacity: rand(0.15, 0.50),
      vx: rand(-0.12, 0.12), vy: rand(-0.08, 0.08),
      phase: rand(0, Math.PI * 2),
      twinkleSpeed: rand(0.008, 0.025),
    })
  }

  // ── Animation loop ────────────────────────────────────────────────────────
  function frame() {
    ctx.clearRect(0, 0, W, H)

    for (const b of bodies) {
      b.x += b.vx
      b.y += b.vy
      if (b.x < -40) b.x = W + 40
      if (b.x > W + 40) b.x = -40
      if (b.y < -40) b.y = H + 40
      if (b.y > H + 40) b.y = -40

      ctx.save()
      b.phase += b.twinkleSpeed
      ctx.globalAlpha = b.opacity * (0.55 + 0.45 * Math.sin(b.phase))
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      ctx.fillStyle = b.color
      ctx.fill()
      ctx.restore()
    }

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

function routeLogin() {
  if (auth.isLoggedIn) return navigate('/galaxies')
  setBreadcrumb([])
  const redirect = new URLSearchParams(location.search).get('redirect') || '/galaxies'
  setHTML(`
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo__mark">🌌</div>
          <div class="auth-logo__name">Pocket Universe</div>
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
          <a href="/forgot-password" data-link>Forgot password?</a>
        </div>
        <div class="auth-footer">
          No account? <a href="/signup${redirect !== '/galaxies' ? '?redirect=' + encodeURIComponent(redirect) : ''}" data-link>Create one</a>
        </div>
      </div>
    </div>
  `)

  document.getElementById('email').focus()

  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault()
    const btn = e.target.querySelector('[type=submit]')
    const errEl = document.getElementById('auth-error')
    errEl.innerHTML = ''
    btn.disabled = true
    btn.textContent = 'Signing in…'
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e.target.email.value, password: e.target.password.value }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      auth.save(data.token, data.user)
      navigate(redirect)
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error mt-4">${err.message}</div>`
      btn.disabled = false
      btn.textContent = 'Sign in'
    }
  })
}

function routeSignup() {
  if (auth.isLoggedIn) return navigate('/galaxies')
  setBreadcrumb([])
  const redirect = new URLSearchParams(location.search).get('redirect') || '/galaxies'
  setHTML(`
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo__mark">🌌</div>
          <div class="auth-logo__name">Pocket Universe</div>
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
          Already have an account? <a href="/login${redirect !== '/galaxies' ? '?redirect=' + encodeURIComponent(redirect) : ''}" data-link>Sign in</a>
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
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: e.target.name.value, email: e.target.email.value, password: e.target.password.value }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      auth.save(data.token, data.user)
      navigate(redirect)
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error mt-4">${err.message}</div>`
      btn.disabled = false
      btn.textContent = 'Create account'
    }
  })
}

function routeForgotPassword() {
  if (auth.isLoggedIn) return navigate('/galaxies')
  setBreadcrumb([])
  setNav(false)
  setHTML(`
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo__mark">🌌</div>
          <div class="auth-logo__name">Pocket Universe</div>
        </div>
        <h1 class="auth-title">Reset your password</h1>
        <p class="text-muted" style="margin-bottom:1rem;font-size:.95rem">Enter your email and we'll send you a reset link.</p>
        <div id="auth-error" role="alert"></div>
        <div id="auth-success" role="status"></div>
        <form id="forgot-form">
          <div class="field">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" autocomplete="email" required>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-full btn-lg">Send reset link</button>
          </div>
        </form>
        <div class="auth-footer">
          <a href="/login" data-link>Back to sign in</a>
        </div>
      </div>
    </div>
  `)

  document.getElementById('forgot-form').addEventListener('submit', async e => {
    e.preventDefault()
    const btn = e.target.querySelector('[type=submit]')
    const errEl = document.getElementById('auth-error')
    const successEl = document.getElementById('auth-success')
    errEl.innerHTML = ''
    btn.disabled = true
    btn.textContent = 'Sending…'
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e.target.email.value }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      e.target.hidden = true
      successEl.innerHTML = `<div class="alert alert-success mt-4">${data.message}</div>`
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error mt-4">${err.message}</div>`
      btn.disabled = false
      btn.textContent = 'Send reset link'
    }
  })
}

function routeResetPassword() {
  if (auth.isLoggedIn) return navigate('/galaxies')
  setBreadcrumb([])
  setNav(false)
  const token = new URLSearchParams(location.search).get('token') || ''
  setHTML(`
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo__mark">🌌</div>
          <div class="auth-logo__name">Pocket Universe</div>
        </div>
        <h1 class="auth-title">Choose a new password</h1>
        <div id="auth-error" role="alert"></div>
        <div id="auth-success" role="status"></div>
        ${token ? `
        <form id="reset-form">
          <div class="field">
            <label for="password">New password</label>
            <input type="password" id="password" name="password" autocomplete="new-password" minlength="8" required>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-full btn-lg">Set new password</button>
          </div>
        </form>` : `<div class="alert alert-error mt-4">Invalid or missing reset token.</div>`}
        <div class="auth-footer">
          <a href="/login" data-link>Back to sign in</a>
        </div>
      </div>
    </div>
  `)

  if (!token) return

  document.getElementById('reset-form').addEventListener('submit', async e => {
    e.preventDefault()
    const btn = e.target.querySelector('[type=submit]')
    const errEl = document.getElementById('auth-error')
    const successEl = document.getElementById('auth-success')
    errEl.innerHTML = ''
    btn.disabled = true
    btn.textContent = 'Saving…'
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: e.target.password.value }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      e.target.hidden = true
      successEl.innerHTML = `<div class="alert alert-success mt-4">${data.message}</div>`
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error mt-4">${err.message}</div>`
      btn.disabled = false
      btn.textContent = 'Set new password'
    }
  })
}

async function routeGalaxies() {
  if (!auth.isLoggedIn) return navigate('/login')
  setBreadcrumb([])
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  try {
    const data = await api('GET', '/galaxies')
    if (!data) return

    const { galaxies } = data
    const listHTML = galaxies.length === 0
      ? `<div class="empty-state">
           <div class="empty-state__icon">📦</div>
           <div class="empty-state__title">No galaxies yet</div>
           <div class="empty-state__body">
             Create your first galaxy to start tracking your treasures.
           </div>
           <a href="/galaxies/new" data-link class="btn btn-primary">Create galaxy</a>
         </div>`
      : `<div class="item-list" id="galaxy-list">
           ${galaxies.map(inv => `
             <div class="item-row galaxy-row" draggable="true" data-id="${inv.id}">
               <span class="drag-handle" aria-hidden="true">⠿</span>
               <a href="/galaxies/${inv.id}" data-link class="galaxy-row__link">
                 <div class="item-row__photo item-row__photo--placeholder">${prefs.galaxyIcons ? galaxyIcon(inv.name) : escapeHTML(inv.name.charAt(0).toUpperCase())}</div>
                 <div class="item-row__info">
                   <div class="item-row__name">${escapeHTML(inv.name)}<span class="galaxy-row__type-label">galaxy</span></div>
                   <div class="item-row__meta">${inv.subtitle ? escapeHTML(inv.subtitle) + ' · ' : ''}${inv.item_count} item${inv.item_count !== 1 ? 's' : ''} · ${inv.role}</div>
                 </div>
               </a>
               <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="text-muted" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
             </div>
           `).join('')}
         </div>`

    setHTML(`
      <div class="page-header page-header-row">
        <div>
          <h1 class="page-title">My Galaxies</h1>
          <p class="page-subtitle">Your collections, organized</p>
        </div>
        <div style="display:flex;gap:var(--space-2);align-items:center">
          <button id="btn-qr" class="btn btn-ghost btn-sm" aria-label="Show QR code for this app" title="Show QR code">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/>
              <path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3"/>
            </svg>
          </button>
          <a href="/galaxies/new" data-link class="btn btn-primary btn-sm">+ New Galaxy</a>
        </div>
      </div>

      <div class="items-search-bar">
        <input type="search" id="global-search" placeholder="Search all items…" autocomplete="off">
      </div>

      <div id="search-results" hidden></div>
      <div id="galaxy-section">${listHTML}</div>

      <div id="qr-overlay" class="qr-overlay" hidden>
        <div class="qr-modal">
          <button class="qr-modal__close" id="btn-qr-close" aria-label="Close">×</button>
          <p class="qr-modal__label">Scan to open this app</p>
          <div id="qr-canvas"></div>
          <p class="qr-modal__url" id="qr-url"></p>
        </div>
      </div>
    `)

    const appUrl = window.location.origin
    document.getElementById('qr-url').textContent = appUrl

    const overlay = document.getElementById('qr-overlay')
    let qrRendered = false
    document.getElementById('btn-qr').addEventListener('click', () => {
      overlay.hidden = false
      if (!qrRendered) {
        new QRCode(document.getElementById('qr-canvas'), { text: appUrl, width: 200, height: 200 })
        qrRendered = true
      }
    })
    document.getElementById('btn-qr-close').addEventListener('click', () => { overlay.hidden = true })
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.hidden = true })

    if (galaxies.length > 1) {
      const list = document.getElementById('galaxy-list')
      let dragSrc = null

      list.addEventListener('dragstart', e => {
        dragSrc = e.target.closest('.galaxy-row')
        if (!dragSrc) return
        dragSrc.classList.add('galaxy-row--dragging')
        e.dataTransfer.effectAllowed = 'move'
      })

      list.addEventListener('dragover', e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const target = e.target.closest('.galaxy-row')
        if (!target || target === dragSrc) return
        list.querySelectorAll('.galaxy-row').forEach(r => r.classList.remove('galaxy-row--drag-over'))
        target.classList.add('galaxy-row--drag-over')
      })

      list.addEventListener('dragleave', e => {
        if (!e.relatedTarget?.closest?.('#galaxy-list')) {
          list.querySelectorAll('.galaxy-row').forEach(r => r.classList.remove('galaxy-row--drag-over'))
        }
      })

      list.addEventListener('drop', async e => {
        e.preventDefault()
        const target = e.target.closest('.galaxy-row')
        list.querySelectorAll('.galaxy-row').forEach(r => r.classList.remove('galaxy-row--drag-over', 'galaxy-row--dragging'))
        if (!target || !dragSrc || target === dragSrc) return

        // Reorder in DOM
        const rows = [...list.querySelectorAll('.galaxy-row')]
        const srcIdx = rows.indexOf(dragSrc)
        const tgtIdx = rows.indexOf(target)
        if (srcIdx < tgtIdx) target.after(dragSrc)
        else target.before(dragSrc)

        // Persist new order
        const order = [...list.querySelectorAll('.galaxy-row')].map(r => r.dataset.id)
        api('PATCH', '/galaxies/reorder', { order }).catch(() => {})
      })

      list.addEventListener('dragend', () => {
        list.querySelectorAll('.galaxy-row').forEach(r => r.classList.remove('galaxy-row--dragging', 'galaxy-row--drag-over'))
        dragSrc = null
      })
    }

    // ── Global search ────────────────────────────────────────────────────────
    const typeIcon = { physical: '📦', digital: '💾', subscription: '🔄', document: '📄', boardgame: '🎲' }
    const searchEl    = document.getElementById('global-search')
    const resultsEl   = document.getElementById('search-results')
    const invSection  = document.getElementById('galaxy-section')
    let searchTimer   = null

    searchEl.addEventListener('input', () => {
      clearTimeout(searchTimer)
      const q = searchEl.value.trim()
      if (!q) {
        resultsEl.hidden = true
        resultsEl.innerHTML = ''
        invSection.hidden = false
        return
      }
      searchTimer = setTimeout(async () => {
        try {
          const data = await api('GET', `/search?q=${encodeURIComponent(q)}`)
          if (!data) return
          const { items } = data
          invSection.hidden = true
          resultsEl.hidden = false
          if (items.length === 0) {
            resultsEl.innerHTML = `<div class="empty-state">
              <div class="empty-state__icon">🔍</div>
              <div class="empty-state__title">No results for "${escapeHTML(q)}"</div>
            </div>`
          } else {
            resultsEl.innerHTML = `<div class="item-list">
              ${items.map(item => `
                <a href="/galaxies/${item.galaxy_id}/items/${item.id}" data-link class="item-row" data-type="${item.item_type}">
                  ${item.photo_url
                    ? `<div class="item-row__photo"><img src="${item.photo_url}" alt="" loading="lazy"></div>`
                    : `<div class="item-row__photo item-row__photo--placeholder">${typeIcon[item.item_type] ?? '📦'}</div>`
                  }
                  <div class="item-row__info">
                    <div class="item-row__name">${escapeHTML(item.name)}</div>
                    <div class="item-row__meta">${escapeHTML(item.galaxy_name)}${item.location_path ? ' · ' + escapeHTML(item.location_path) : ''}${item.category_name ? ' · ' + escapeHTML(item.category_name) : ''}</div>
                  </div>
                  <div class="item-row__qty">${item.quantity}${item.unit ? ' ' + escapeHTML(item.unit) : ''}</div>
                </a>
              `).join('')}
            </div>`
          }
        } catch { /* silent — don't disrupt the home screen */ }
      }, 200)
    })

  } catch (err) {
    setHTML(`<div class="alert alert-error">${err.message}</div>`)
  }
}

function routeGalaxyNew() {
  if (!auth.isLoggedIn) return navigate('/login')
  setBreadcrumb([
    { label: 'Galaxies', href: '/galaxies' },
    { label: 'New Galaxy' },
  ])
  setHTML(`
    <div>
      <div class="page-header">
        <h1 class="page-title">New Galaxy</h1>
      </div>
      <div class="card">
        <div class="card-body">
          <div id="form-error" role="alert"></div>
          <form id="new-galaxy-form">
            <div class="field">
              <label for="inv-name">Name</label>
              <input type="text" id="inv-name" name="name" placeholder="e.g. Home, Workshop, Office" required autofocus>
            </div>
            <div class="field">
              <label for="inv-subtitle">Description <span class="text-muted">(optional)</span></label>
              <input type="text" id="inv-subtitle" name="subtitle" placeholder="e.g. 123 Lawrence St, Ford Focus 2015 (red)">
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Create galaxy</button>
              <a href="/galaxies" data-link class="btn btn-secondary">Cancel</a>
            </div>
          </form>
        </div>
      </div>
    </div>
  `)

  document.getElementById('new-galaxy-form').addEventListener('submit', async e => {
    e.preventDefault()
    const btn = e.target.querySelector('[type=submit]')
    const errEl = document.getElementById('form-error')
    errEl.innerHTML = ''
    btn.disabled = true
    try {
      const data = await api('POST', '/galaxies', { name: e.target.name.value, subtitle: e.target.subtitle.value })
      if (data) navigate(`/galaxies/${data.galaxy.id}`)
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error mb-4">${err.message}</div>`
      btn.disabled = false
    }
  })
}

async function routeGalaxy(matches) {
  if (!auth.isLoggedIn) return navigate('/login')
  const galaxyId = matches[1]
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  try {
    const [invData, membersData, locData, catData] = await Promise.all([
      api('GET', `/galaxies/${galaxyId}`),
      api('GET', `/galaxies/${galaxyId}/members`),
      api('GET', `/galaxies/${galaxyId}/locations`),
      api('GET', `/galaxies/${galaxyId}/categories`),
    ])
    if (!invData || !membersData) return

    const { galaxy } = invData
    const { members } = membersData
    let locations = locData?.locations ?? []
    let categories = catData?.categories ?? []
    const isOwner = galaxy.role === 'owner'
    const canEdit = galaxy.role === 'owner' || galaxy.role === 'editor'

    setBreadcrumb([
      { label: 'Galaxies', href: '/galaxies' },
      { label: galaxy.name },
    ])

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
          <div class="page-header-row">
            <div>
              <h1 class="page-title">${escapeHTML(galaxy.name)}<span class="galaxy-row__type-label" style="font-size:0.55em;vertical-align:baseline">galaxy</span></h1>
              <p class="page-subtitle">
                ${galaxy.subtitle ? escapeHTML(galaxy.subtitle) + ' · ' : ''}${galaxy.item_count} item${galaxy.item_count !== 1 ? 's' : ''}
                · <span class="badge ${roleBadgeClass[galaxy.role]}">${roleLabel[galaxy.role]}</span>
              </p>
            </div>
            ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="openAddItemModal('${galaxyId}','')">+ Add item</button>` : ''}
          </div>
        </div>

        <div style="display:flex;gap:var(--space-3);margin-bottom:var(--space-6)">
          <a href="/galaxies/${galaxyId}/items" data-link class="btn btn-secondary" style="flex:1">
            Browse items →
          </a>
          <a href="/galaxies/${galaxyId}/locations" data-link class="btn btn-secondary" style="flex:1">
            Locations →
          </a>
        </div>

        <!-- Locations & Categories -->
        ${canEdit ? `
        <div class="card mb-4">
          <div class="card-header"><h2 class="font-semi">Organize</h2></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:var(--space-5)">

            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-2)">
                <div class="text-sm font-medium">Locations</div>
                <button id="add-loc-btn" class="btn btn-secondary btn-xs">+ Location</button>
              </div>
              <div id="loc-tree"></div>
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

        <div id="add-loc-modal" class="modal-overlay" hidden>
          <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="add-loc-modal-title">
            <div class="modal-dialog__header">
              <h3 class="font-semi" id="add-loc-modal-title">New location</h3>
              <button class="modal-dialog__close" id="add-loc-close" aria-label="Close">×</button>
            </div>
            <form id="add-loc-form" class="modal-dialog__body">
              <div class="field">
                <label for="add-loc-name">Name</label>
                <input type="text" id="add-loc-name" placeholder="e.g. Living Room" maxlength="80" autocomplete="off">
              </div>
              <div class="field">
                <label for="add-loc-type">Type</label>
                <select id="add-loc-type"></select>
              </div>
              <div class="modal-dialog__footer">
                <button type="button" class="btn btn-ghost" id="add-loc-cancel">Cancel</button>
                <button type="submit" class="btn btn-primary">Add location</button>
              </div>
            </form>
          </div>
        </div>

        <div id="add-child-loc-modal" class="modal-overlay" hidden>
          <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="add-child-loc-modal-title">
            <div class="modal-dialog__header">
              <h3 class="font-semi" id="add-child-loc-modal-title">New sub-location</h3>
              <button class="modal-dialog__close" id="add-child-loc-close" aria-label="Close">×</button>
            </div>
            <form id="add-child-loc-form" class="modal-dialog__body">
              <div class="field">
                <label for="add-child-loc-name">Name</label>
                <input type="text" id="add-child-loc-name" placeholder="e.g. Level 1" maxlength="80" autocomplete="off">
              </div>
              <div class="field">
                <label for="add-child-loc-type">Type</label>
                <select id="add-child-loc-type"></select>
              </div>
              <div class="modal-dialog__footer">
                <button type="button" class="btn btn-ghost" id="add-child-loc-cancel">Cancel</button>
                <button type="submit" class="btn btn-primary">Add sub-location</button>
              </div>
            </form>
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
            <div id="rename-msg" role="alert"></div>
            <form id="rename-form">
              <div class="field">
                <label for="rename-input">Name</label>
                <input type="text" id="rename-input" name="name" value="${escapeHTML(galaxy.name)}" required>
              </div>
              <div class="field">
                <label for="subtitle-input">Description <span class="text-muted">(optional)</span></label>
                <input type="text" id="subtitle-input" name="subtitle" value="${escapeHTML(galaxy.subtitle ?? '')}" placeholder="e.g. 123 Lawrence St, Ford Focus 2015 (red)">
              </div>
              <button type="submit" class="btn btn-secondary btn-sm">Save</button>
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
              Permanently delete this galaxy and all its items. There is no undo.
            </p>
            <button class="btn btn-danger btn-sm" id="btn-delete-inv">Delete galaxy</button>
          </div>
        </div>
        ` : ''}
      </div>
    `)

    // ── Locations & Categories ─────────────────────────────────────────────
    if (canEdit) {
      const LOC_TYPES = [
        { value: 'room',       label: 'Room',       icon: '🚪' },
        { value: 'closet',     label: 'Closet',     icon: '🚪' },
        { value: 'shelf',      label: 'Shelf',      icon: '📚' },
        { value: 'level',      label: 'Level',      icon: '📋' },
        { value: 'section',    label: 'Section',    icon: '📂' },
        { value: 'drawer',     label: 'Drawer',     icon: '🗂️' },
        { value: 'cabinet',    label: 'Cabinet',    icon: '🗄️' },
        { value: 'box',        label: 'Box',        icon: '📦' },
        { value: 'banker_box', label: 'Banker Box', icon: '🗃️' },
        { value: 'shoebox',    label: 'Shoebox',    icon: '👟' },
        { value: 'bin',        label: 'Bin',        icon: '🪣' },
        { value: 'basket',     label: 'Basket',     icon: '🧺' },
        { value: 'tote',       label: 'Tote',       icon: '🛍️' },
        { value: 'bag',        label: 'Bag',        icon: '👜' },
        { value: 'other',      label: 'Other',      icon: '📍' },
      ]
      const locTypeMap = Object.fromEntries(LOC_TYPES.map(t => [t.value, t]))
      const locTypeOptions = LOC_TYPES.map(t => `<option value="${t.value}">${prefs.locIcons ? `${t.icon} ` : ''}${t.label}</option>`).join('')

      function buildTree(nodes, parentId = null) {
        return nodes
          .filter(n => (n.parent_id ?? null) === parentId)
          .map(n => ({ ...n, children: buildTree(nodes, n.id) }))
      }

      function getLocDescendantIds(id) {
        const result = new Set([id])
        const stack = [id]
        while (stack.length) {
          const cur = stack.pop()
          locations.filter(l => l.parent_id === cur).forEach(l => { result.add(l.id); stack.push(l.id) })
        }
        return result
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
        container.innerHTML = '<div id="loc-root-drop" class="loc-root-drop" hidden>↑ Drop here to make top-level</div>' + renderNodes(tree, 0)
        container.querySelectorAll('.loc-delete').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id
            const name = btn.closest('.loc-node__row')?.querySelector('.loc-node__name')?.textContent ?? 'this location'
            if (!await confirmDelete(`Delete "${name}"?`, 'Items inside will be unassigned. Child locations will be moved up. This cannot be undone.')) return
            try {
              await api('DELETE', `/galaxies/${galaxyId}/locations/${id}`)
              const idx = locations.findIndex(l => l.id === id)
              if (idx !== -1) locations.splice(idx, 1)
              locations.forEach(l => { if (l.parent_id === id) l.parent_id = null })
              renderLocTree()
            } catch (err) { alert(err.message) }
          })
        })
        container.querySelectorAll('.loc-node__name, .loc-node__subname').forEach(nameEl => {
          nameEl.addEventListener('click', () => {
            const id = nameEl.dataset.id
            const loc = locations.find(l => l.id === id)
            nameEl.textContent = loc?.name ?? nameEl.textContent.trim()
            startInlineEdit(nameEl, async val => {
              await api('PATCH', `/galaxies/${galaxyId}/locations/${id}`, { name: val })
              if (loc) loc.name = val
              renderLocTree()
            })
          })
        })
        container.querySelectorAll('.loc-type-select').forEach(sel => {
          sel.addEventListener('change', async () => {
            const id = sel.dataset.id
            try {
              await api('PATCH', `/galaxies/${galaxyId}/locations/${id}`, { location_type: sel.value })
              const loc = locations.find(l => l.id === id)
              if (loc) loc.location_type = sel.value
              renderLocTree()
            } catch (err) { alert(err.message); renderLocTree() }
          })
        })
        container.querySelectorAll('.loc-add-child-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const parentId = btn.dataset.parent
            const parentName = locations.find(l => l.id === parentId)?.name ?? ''
            document.getElementById('add-child-loc-modal-title').textContent = `Add to ${parentName}`
            document.getElementById('add-child-loc-modal').dataset.parent = parentId
            document.getElementById('add-child-loc-modal').removeAttribute('hidden')
            document.getElementById('add-child-loc-name').focus()
          })
        })
        // dead code kept for safety — inline forms removed
        container.querySelectorAll('.loc-child-form').forEach(form => {
          form.addEventListener('submit', async e => {
            e.preventDefault()
            const input = form.querySelector('input[name="loc-name"]')
            const typeSelect = form.querySelector('select[name="loc-type"]')
            const name = input.value.trim()
            if (!name) return
            try {
              const data = await api('POST', `/galaxies/${galaxyId}/locations`, {
                name,
                parent_id: form.dataset.parent,
                location_type: typeSelect.value,
              })
              if (data) { locations.push(data.location); renderLocTree() }
              input.value = ''
            } catch (err) { alert(err.message) }
          })
        })
        container.querySelectorAll('.loc-drag-handle').forEach(handle => {
          function startLocDrag(startX, startY) {
            const locId = handle.dataset.id
            const sourceRow = handle.closest('.loc-node__row')
            let clone = null, currentTarget = null, didDrag = false

            function getDropTarget(x, y) {
              if (clone) clone.style.display = 'none'
              const el = document.elementFromPoint(x, y)
              if (clone) clone.style.display = ''
              const rootDrop = el?.closest('#loc-root-drop')
              if (rootDrop) return rootDrop
              const row = el?.closest('.loc-node__row[data-id]')
              if (!row || row === sourceRow) return null
              if (getLocDescendantIds(locId).has(row.dataset.id)) return null
              return row
            }

            function setTarget(target) {
              if (currentTarget === target) return
              if (currentTarget) currentTarget.classList.remove('loc-node--drag-over', 'loc-root-drop--active')
              currentTarget = target
              if (target) target.classList.add(target.id === 'loc-root-drop' ? 'loc-root-drop--active' : 'loc-node--drag-over')
            }

            function onMove(x, y) {
              if (!didDrag && Math.hypot(x - startX, y - startY) < 5) return
              if (!didDrag) {
                didDrag = true
                const rect = sourceRow.getBoundingClientRect()
                clone = sourceRow.cloneNode(true)
                clone.style.cssText = `position:fixed;width:${rect.width}px;pointer-events:none;opacity:0.85;z-index:9999;border-radius:var(--radius);box-shadow:0 4px 16px rgba(0,0,0,0.4);background:var(--c-surface);padding:var(--space-3) var(--space-2);`
                document.body.appendChild(clone)
                sourceRow.classList.add('loc-node--dragging')
                document.getElementById('loc-root-drop')?.removeAttribute('hidden')
              }
              const rect = sourceRow.getBoundingClientRect()
              clone.style.left = (x - rect.width / 2) + 'px'
              clone.style.top = (y - 16) + 'px'
              setTarget(getDropTarget(x, y))
            }

            async function onUp() {
              document.removeEventListener('mousemove', onMouseMove)
              document.removeEventListener('mouseup', onUp)
              document.removeEventListener('touchmove', onTouchMove)
              document.removeEventListener('touchend', onTouchEnd)
              clone?.remove()
              sourceRow.classList.remove('loc-node--dragging')
              document.getElementById('loc-root-drop')?.setAttribute('hidden', '')
              const target = currentTarget
              setTarget(null)
              if (!didDrag || !target) return
              const newParentId = target.id === 'loc-root-drop' ? null : target.dataset.id
              const loc = locations.find(l => l.id === locId)
              if (loc && (loc.parent_id ?? null) === (newParentId ?? null)) return
              try {
                await api('PATCH', `/galaxies/${galaxyId}/locations/${locId}`, { parent_id: newParentId ?? null })
                if (loc) loc.parent_id = newParentId ?? null
                renderLocTree()
              } catch (err) { alert(err.message); renderLocTree() }
            }

            function onMouseMove(e) { onMove(e.clientX, e.clientY) }
            function onTouchMove(e) { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY) }
            function onTouchEnd() { onUp() }

            document.addEventListener('mousemove', onMouseMove)
            document.addEventListener('mouseup', onUp)
            document.addEventListener('touchmove', onTouchMove, { passive: false })
            document.addEventListener('touchend', onTouchEnd)
          }

          handle.addEventListener('mousedown', e => {
            if (e.button !== 0) return
            e.preventDefault()
            startLocDrag(e.clientX, e.clientY)
          })

          handle.addEventListener('touchstart', e => {
            e.preventDefault()
            startLocDrag(e.touches[0].clientX, e.touches[0].clientY)
          }, { passive: false })
        })
      }

      function renderNodes(nodes, depth) {
        if (!nodes.length && depth > 0) return ''
        return nodes.map(node => {
          const t = locTypeMap[node.location_type] ?? locTypeMap['room']
          const typeSelectHTML = LOC_TYPES.map(t2 =>
            `<option value="${t2.value}"${t2.value === node.location_type ? ' selected' : ''}>${prefs.locIcons ? `${t2.icon} ` : ''}${t2.label}</option>`
          ).join('')
          const isRoom = node.location_type === 'room'
          const segLabel = computeLocLabel(node.id, locations).split('-').pop()
          const typeLabel = (node.location_type ?? 'other').replace('_', ' ').toUpperCase()
          const isGenericName = /^[\w\s]+-\d+$/i.test(node.name)
          const showName = !isRoom && !isGenericName
          return `
          <div class="loc-node loc-depth-${depth}" data-id="${node.id}">
            <div class="loc-node__row" data-id="${node.id}">
              <span class="loc-drag-handle" data-id="${node.id}" aria-hidden="true">⠿</span>
              <span class="loc-node__info">
                <span class="location-row__primary">
                  <span class="loc-label-badge loc-node__name editable-name" data-id="${node.id}" title="Click to rename">
                    ${isRoom ? escapeHTML(node.name) : segLabel}
                  </span>
                  <label class="loc-type-label-btn" title="Change type">
                    <span class="location-row__type">${typeLabel}</span>
                    <select class="loc-type-select" data-id="${node.id}" aria-label="Location type">${typeSelectHTML}</select>
                  </label>
                </span>
                ${showName ? `<span class="loc-node__subname editable-name" data-id="${node.id}" title="Click to rename">${escapeHTML(node.name)}</span>` : ''}
              </span>
              <button class="btn btn-ghost btn-xs loc-add-child-btn" data-parent="${node.id}" title="Add child location" aria-label="Add child location">+</button>
              <button class="btn btn-ghost btn-xs loc-delete" data-id="${node.id}" title="Delete" aria-label="Delete location">×</button>
            </div>
            ${node.children.length ? `<div class="loc-children">${renderNodes(node.children, depth + 1)}</div>` : ''}
          </div>
        `}).join('')
      }

      document.getElementById('add-loc-type').innerHTML = locTypeOptions
      renderLocTree()

      const addLocModal = document.getElementById('add-loc-modal')
      const openAddLoc = () => { addLocModal.removeAttribute('hidden'); document.getElementById('add-loc-name').focus() }
      const closeAddLoc = () => { addLocModal.setAttribute('hidden', ''); document.getElementById('add-loc-form').reset() }

      document.getElementById('add-loc-btn').addEventListener('click', openAddLoc)
      document.getElementById('add-loc-close').addEventListener('click', closeAddLoc)
      document.getElementById('add-loc-cancel').addEventListener('click', closeAddLoc)
      addLocModal.addEventListener('click', e => { if (e.target === addLocModal) closeAddLoc() })

      document.getElementById('add-loc-form').addEventListener('submit', async e => {
        e.preventDefault()
        const name = document.getElementById('add-loc-name').value.trim()
        if (!name) return
        try {
          const data = await api('POST', `/galaxies/${galaxyId}/locations`, {
            name,
            location_type: document.getElementById('add-loc-type').value,
          })
          if (data) { locations.push(data.location); renderLocTree() }
          closeAddLoc()
        } catch (err) { alert(err.message) }
      })

      const addChildLocModal = document.getElementById('add-child-loc-modal')
      const closeAddChildLoc = () => { addChildLocModal.setAttribute('hidden', ''); document.getElementById('add-child-loc-form').reset() }
      document.getElementById('add-child-loc-close').addEventListener('click', closeAddChildLoc)
      document.getElementById('add-child-loc-cancel').addEventListener('click', closeAddChildLoc)
      addChildLocModal.addEventListener('click', e => { if (e.target === addChildLocModal) closeAddChildLoc() })
      document.getElementById('add-child-loc-type').innerHTML = locTypeOptions

      document.getElementById('add-child-loc-form').addEventListener('submit', async e => {
        e.preventDefault()
        const name = document.getElementById('add-child-loc-name').value.trim()
        const parentId = addChildLocModal.dataset.parent
        if (!name) return
        try {
          const data = await api('POST', `/galaxies/${galaxyId}/locations`, {
            name,
            location_type: document.getElementById('add-child-loc-type').value,
            parent_id: parentId,
          })
          if (data) { locations.push(data.location); renderLocTree() }
          closeAddChildLoc()
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
            const name = btn.closest('.tag')?.querySelector('.tag-name')?.textContent ?? 'this'
            const label = deletePath === 'categories' ? 'category' : 'item'
            if (!await confirmDelete(`Delete "${name}"?`, `Items assigned to this ${label} will be unassigned.`)) return
            try {
              await api('DELETE', `/galaxies/${galaxyId}/${deletePath}/${btn.dataset.id}`)
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
                await api('PATCH', `/galaxies/${galaxyId}/${deletePath}/${id}`, { name: val })
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
          const data = await api('POST', `/galaxies/${galaxyId}/categories`, { name })
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
          await api('POST', `/galaxies/${galaxyId}/invite`, {
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
            await api('PATCH', `/galaxies/${galaxyId}/members/${sel.dataset.userId}`, { role: sel.value })
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
          if (!await confirmDelete(`Remove ${btn.dataset.name}?`, 'They will lose access to this galaxy.')) return
          try {
            await api('DELETE', `/galaxies/${galaxyId}/members/${btn.dataset.userId}`)
            navigate(`/galaxies/${galaxyId}`)
          } catch (err) { alert(err.message) }
        })
      })

      // ── Rename ─────────────────────────────────────────────────────────
      document.getElementById('rename-form').addEventListener('submit', async e => {
        e.preventDefault()
        const msgEl = document.getElementById('rename-msg')
        msgEl.innerHTML = ''
        try {
          await api('PATCH', `/galaxies/${galaxyId}`, { name: e.target.name.value.trim(), subtitle: e.target.subtitle.value.trim() })
          navigate(`/galaxies/${galaxyId}`)
        } catch (err) {
          msgEl.innerHTML = `<div class="alert alert-error mb-4">${err.message}</div>`
        }
      })

      // ── Delete galaxy ───────────────────────────────────────────────
      document.getElementById('btn-delete-inv').addEventListener('click', async () => {
        if (!await confirmDelete(`Delete "${galaxy.name}"?`, 'All locations, categories and items will be permanently removed. This cannot be undone.')) return
        try {
          await api('DELETE', `/galaxies/${galaxyId}`)
          navigate('/galaxies')
        } catch (err) { alert(err.message) }
      })
    }
  } catch (err) {
    setHTML(`<div class="alert alert-error">${err.message}</div>`)
  }
}

async function routeLocations(matches) {
  if (!auth.isLoggedIn) return navigate('/login')
  const galaxyId = matches[1]
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  try {
    const [invData, locData] = await Promise.all([
      api('GET', `/galaxies/${galaxyId}`),
      api('GET', `/galaxies/${galaxyId}/locations`),
    ])
    if (!invData || !locData) return
    const locations = locData.locations ?? []
    const invName = invData.galaxy.name

    setBreadcrumb([
      { label: 'Galaxies', href: '/galaxies' },
      { label: invName, href: `/galaxies/${galaxyId}` },
      { label: 'Locations' },
    ])

    // Build a tree structure
    function buildTree(nodes, parentId = null) {
      return nodes
        .filter(n => (n.parent_id ?? null) === parentId)
        .map(n => ({ ...n, children: buildTree(nodes, n.id) }))
    }

    // Sum item_count recursively (includes items in child locations)
    function totalCount(node) {
      return Number(node.item_count ?? 0) + node.children.reduce((s, c) => s + totalCount(c), 0)
    }

    const LOC_TYPE_ICON = { room:'🚪', closet:'🚪', shelf:'📚', level:'📋', section:'📂', drawer:'🗂️', cabinet:'🗄️', box:'📦', banker_box:'🗃️', shoebox:'👟', bin:'🪣', basket:'🧺', tote:'🛍️', bag:'👜', other:'📍' }

    function renderTree(nodes, depth = 0) {
      if (!nodes.length) return ''
      return nodes.map(node => {
        const total = totalCount(node)
        const indent = depth * 1.25
        const icon = LOC_TYPE_ICON[node.location_type] ?? '📍'
        const isRoom = node.location_type === 'room'
        const label = computeLocLabel(node.id, locations).split('-').pop()
        const typeLabel = (node.location_type ?? 'other').replace('_', ' ').toUpperCase()
        const isGenericName = /^[\w\s]+-\d+$/i.test(node.name)
        const showName = !isRoom && !isGenericName
        return `
          <a href="/galaxies/${galaxyId}/locations/${node.id}" data-link
             class="location-row" style="padding-left:calc(var(--space-4) + ${indent}rem)">
            ${prefs.locIcons ? `<span class="location-row__icon" style="font-size:1rem;margin-right:.35rem">${icon}</span>` : ''}
            <span class="location-row__info">
              <span class="location-row__primary">
                ${isRoom
                  ? `<span class="loc-label-badge">${escapeHTML(node.name)}</span>`
                  : `<span class="loc-label-badge">${label}</span>`}
                <span class="location-row__type">${typeLabel}</span>
              </span>
              ${showName ? `<span class="location-row__name">${escapeHTML(node.name)}</span>` : ''}
            </span>
            <span class="location-row__count">${total} item${total !== 1 ? 's' : ''}</span>
            <button type="button" class="btn btn-ghost btn-sm location-row__add-item" title="Add item here"
              onclick="event.preventDefault();event.stopPropagation();openAddItemModal('${galaxyId}','${node.id}')">+</button>
          </a>
          ${renderTree(node.children, depth + 1)}
        `
      }).join('')
    }

    const tree = buildTree(locations)
    const isEmpty = locations.length === 0

    setHTML(`
      <div>
        <div class="page-header">
          <h1 class="page-title">Locations</h1>
        </div>

        ${isEmpty
          ? `<div class="empty-state">
               <div class="empty-state__icon">📍</div>
               <div class="empty-state__title">No locations yet</div>
               <div class="empty-state__body">Add locations in the galaxy settings.</div>
               <a href="/galaxies/${galaxyId}" data-link class="btn btn-primary">Go to settings</a>
             </div>`
          : `<div class="card">
               <div class="location-tree">
                 ${renderTree(tree)}
               </div>
             </div>`
        }
      </div>
    `)
  } catch (err) {
    setHTML(`<div class="alert alert-error">${err.message}</div>`)
  }
}

async function routeLocation(matches) {
  if (!auth.isLoggedIn) return navigate('/login')
  const [, galaxyId, locationId] = matches
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  try {
    const [locData, itemsData] = await Promise.all([
      api('GET', `/galaxies/${galaxyId}/locations`),
      api('GET', `/galaxies/${galaxyId}/items?location=${locationId}`),
    ])
    if (!locData) return

    const allLocs = locData.locations ?? []
    const current = allLocs.find(l => l.id === locationId)
    if (!current) return navigate(`/galaxies/${galaxyId}/locations`)

    const children = allLocs.filter(l => l.parent_id === locationId)
    const parent = allLocs.find(l => l.id === current.parent_id)
    const items = itemsData?.items ?? []
    const typeIcon = { physical: '📦', digital: '💾', subscription: '🔄', document: '📄', boardgame: '🎲' }
    const locTypeIcon = { room:'🚪', closet:'🚪', shelf:'📚', level:'📋', section:'📂', drawer:'🗂️', cabinet:'🗄️', box:'📦', banker_box:'🗃️', shoebox:'👟', bin:'🪣', basket:'🧺', tote:'🛍️', bag:'👜', other:'📍' }

    // Count items for each child (direct only shown in badge, totals would need recursion)
    function childCount(locId) {
      return Number(allLocs.find(l => l.id === locId)?.item_count ?? 0)
    }

    const sublocsHTML = children.length ? `
      <div class="card mb-4">
        <div class="card-header"><h2 class="section-title" style="margin:0">Sub-locations</h2></div>
        <div class="location-tree">
          ${children.map(c => {
            const cLabel = computeLocLabel(c.id, allLocs).split('-').pop()
            const cnt = childCount(c.id)
            return `
            <a href="/galaxies/${galaxyId}/locations/${c.id}" data-link class="location-row">
              ${prefs.locIcons ? `<span style="font-size:1rem;margin-right:.35rem">${locTypeIcon[c.location_type] ?? '📍'}</span>` : ''}
              <span class="location-row__info">
                <span class="location-row__primary">
                  ${c.location_type === 'room'
                    ? `<span class="loc-label-badge">${escapeHTML(c.name)}</span>`
                    : `<span class="loc-label-badge">${cLabel}</span>`}
                  <span class="location-row__type">${(c.location_type ?? 'other').replace('_', ' ').toUpperCase()}</span>
                </span>
                ${c.location_type !== 'room' && !/^[\w\s]+-\d+$/i.test(c.name) ? `<span class="location-row__name">${escapeHTML(c.name)}</span>` : ''}
              </span>
              <span class="location-row__count">${cnt} item${cnt !== 1 ? 's' : ''}</span>
            </a>`
          }).join('')}
        </div>
      </div>` : ''

    const itemsHTML = items.length ? `
      <div class="card">
        <div class="card-header"><h2 class="section-title" style="margin:0">Items here</h2></div>
        <div class="item-list" style="padding:var(--space-2)">
          ${items.map(item => `
            <a href="/galaxies/${galaxyId}/items/${item.id}" data-link class="item-row">
              ${item.photo_url
                ? `<div class="item-row__photo"><img src="${item.photo_url}" alt="" loading="lazy"></div>`
                : `<div class="item-row__photo item-row__photo--placeholder">${typeIcon[item.item_type] ?? '📦'}</div>`}
              <div class="item-row__info">
                <div class="item-row__name">${escapeHTML(item.name)}${item.disposition ? ' ' + dispositionBadge(item.disposition) : ''}</div>
                <div class="item-row__meta">${escapeHTML(item.category_name ?? item.item_type)}</div>
              </div>
              <div class="item-row__qty">${item.quantity}${item.unit ? ' ' + escapeHTML(item.unit) : ''}</div>
            </a>
          `).join('')}
        </div>
      </div>` : ''

    const emptyHTML = !children.length && !items.length ? `
      <div class="empty-state">
        <div class="empty-state__nebula" aria-hidden="true"></div>
        <div class="empty-state__title">This system is still forming.</div>
        <div class="empty-state__body">Matter has yet to coalesce here. Add items to bring this location to life.</div>
      </div>` : ''

    // Build ancestor chain + breadcrumb
    const ancestors = []
    let node = current
    while (node.parent_id) {
      node = allLocs.find(l => l.id === node.parent_id)
      if (node) ancestors.unshift(node)
    }

    // Need inventory name — fetch it
    const invData = await api('GET', `/galaxies/${galaxyId}`)
    const invName = invData?.galaxy?.name ?? ''

    setBreadcrumb([
      { label: 'Galaxies', href: '/galaxies' },
      { label: invName, href: `/galaxies/${galaxyId}` },
      { label: 'Locations', href: `/galaxies/${galaxyId}/locations` },
      ...ancestors.map(a => ({ label: a.name, href: `/galaxies/${galaxyId}/locations/${a.id}` })),
      { label: current.name },
    ])

    const currentLabel = computeLocLabel(current.id, allLocs)
    setHTML(`
      <div>
        <div class="page-header">
          <div class="page-header-row">
            <h1 class="page-title">${prefs.locIcons ? `${locTypeIcon[current.location_type] ?? '📍'} ` : ''}${escapeHTML(current.name)} <span class="loc-label-badge loc-label-badge--lg">${currentLabel}</span></h1>
            <button class="btn btn-primary btn-sm" onclick="openAddItemModal('${galaxyId}','${locationId}')">+ Add Item</button>
          </div>
        </div>
        ${sublocsHTML}
        ${itemsHTML}
        ${emptyHTML}
      </div>
    `)
  } catch (err) {
    setHTML(`<div class="alert alert-error">${err.message}</div>`)
  }
}

async function routeItems(matches) {
  if (!auth.isLoggedIn) return navigate('/login')
  const galaxyId = matches[1]
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  try {
    const [invData, itemsData, locData] = await Promise.all([
      api('GET', `/galaxies/${galaxyId}`),
      api('GET', `/galaxies/${galaxyId}/items`),
      api('GET', `/galaxies/${galaxyId}/locations`),
    ])
    if (!invData || !itemsData) return

    const { galaxy } = invData
    const allItems = itemsData.items

    // Build full location path map: id → "A > B > C"
    const allLocations = locData?.locations ?? []
    const locById = Object.fromEntries(allLocations.map(l => [l.id, l]))
    function locationPath(id) {
      const parts = []
      let cur = locById[id]
      while (cur) { parts.unshift(cur.name); cur = locById[cur.parent_id] }
      return parts.join(' › ')
    }

    setBreadcrumb([
      { label: 'Galaxies', href: '/galaxies' },
      { label: galaxy.name, href: `/galaxies/${galaxyId}` },
      { label: 'Items' },
    ])

    const typeIcon = { physical: '📦', digital: '💾', subscription: '🔄', document: '📄', boardgame: '🎲' }
    const typeLabel = { physical: 'Physical', digital: 'Digital', subscription: 'Subscription', document: 'Document', boardgame: 'Board Game' }

    // Derive unique categories from items
    const categories = [...new Map(
      allItems.filter(i => i.category_id).map(i => [i.category_id, i.category_name])
    ).entries()].sort((a, b) => a[1].localeCompare(b[1]))

    const types = [...new Set(allItems.map(i => i.item_type))].sort()

    function renderList(items) {
      if (items.length === 0) {
        return `<div class="empty-state">
          <div class="empty-state__icon">🔍</div>
          <div class="empty-state__title">No items match</div>
          <div class="empty-state__body">Try adjusting your search or filters.</div>
        </div>`
      }
      return `<div class="item-list">
        ${items.map(item => `
          <a href="/galaxies/${galaxyId}/items/${item.id}" data-link class="item-row" data-type="${item.item_type}">
            ${item.photo_url
              ? `<div class="item-row__photo"><img src="${item.photo_url}" alt="" loading="lazy"></div>`
              : `<div class="item-row__photo item-row__photo--placeholder">${typeIcon[item.item_type] ?? '📦'}</div>`
            }
            <div class="item-row__info">
              <div class="item-row__name">${escapeHTML(item.name)}${item.disposition ? ' ' + dispositionBadge(item.disposition) : ''}</div>
              <div class="item-row__meta">${item.location_id ? `${escapeHTML(locationPath(item.location_id))} <span class="loc-label-badge" style="font-size:0.6rem">${computeLocLabel(item.location_id, allLocations)}</span>` : escapeHTML(item.category_name ?? item.item_type)}</div>
            </div>
            <div class="item-row__qty">${item.quantity}${item.unit ? ' ' + escapeHTML(item.unit) : ''}</div>
          </a>
        `).join('')}
      </div>`
    }

    setHTML(`
      <div>
        <div class="page-header page-header-row">
          <h1 class="page-title">Items<span class="galaxy-row__type-label" style="font-size:0.55em;vertical-align:baseline">${escapeHTML(galaxy.name)} galaxy</span></h1>
          <button class="btn btn-primary btn-sm" onclick="openAddItemModal('${galaxyId}','')">+ Add</button>
        </div>

        ${allItems.length > 0 ? `
        <div class="items-search-bar">
          <input type="search" id="item-search" placeholder="Search items…" autocomplete="off">
        </div>` : ''}

        <div class="items-filters" id="items-filters">
          ${categories.length > 0 ? `
          <select id="filter-category" class="filter-select">
            <option value="">All categories</option>
            ${categories.map(([id, name]) => `<option value="${id}">${escapeHTML(name)}</option>`).join('')}
          </select>` : ''}
          ${types.length > 1 ? `
          <select id="filter-type" class="filter-select">
            <option value="">All types</option>
            ${types.map(t => `<option value="${t}">${typeLabel[t] ?? t}</option>`).join('')}
          </select>` : ''}
          ${allItems.length > 0 ? `
          <select id="filter-sort" class="filter-select">
            <option value="name">Name A–Z</option>
            <option value="quantity">Quantity</option>
            <option value="added">Recently added</option>
            <option value="value">Value</option>
          </select>` : ''}
        </div>

        <div id="item-count" class="items-count text-sm text-muted"></div>
        <div id="items-list-container">
          ${allItems.length === 0
            ? `<div class="empty-state">
                <div class="empty-state__icon">✨</div>
                <div class="empty-state__title">Nothing stashed yet</div>
                <div class="empty-state__body">Add your first item to start tracking.</div>
                <button class="btn btn-primary" onclick="openAddItemModal('${galaxyId}','')">Add item</button>
              </div>`
            : renderList(allItems)
          }
        </div>
      </div>
    `)

    if (allItems.length === 0) return

    // ── Filter logic ────────────────────────────────────────────────────────
    const searchEl = document.getElementById('item-search')
    const catEl    = document.getElementById('filter-category')
    const typeEl   = document.getElementById('filter-type')
    const sortEl   = document.getElementById('filter-sort')
    const listEl   = document.getElementById('items-list-container')
    const countEl  = document.getElementById('item-count')

    const sortFns = {
      name:     (a, b) => a.name.localeCompare(b.name),
      quantity: (a, b) => b.quantity - a.quantity,
      added:    (a, b) => b.created_at - a.created_at,
      value:    (a, b) => (b.value ?? 0) - (a.value ?? 0),
    }

    function applyFilters() {
      const q    = searchEl?.value.trim().toLowerCase() ?? ''
      const cat  = catEl?.value ?? ''
      const type = typeEl?.value ?? ''
      const sort = sortEl?.value ?? 'name'

      let filtered = allItems.filter(item => {
        if (cat  && item.category_id !== cat)   return false
        if (type && item.item_type   !== type)   return false
        if (q) {
          const hay = `${item.name} ${item.description ?? ''} ${item.tags ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })

      filtered = [...filtered].sort(sortFns[sort] ?? sortFns.name)

      listEl.innerHTML = renderList(filtered)
      countEl.textContent = filtered.length !== allItems.length
        ? `${filtered.length} of ${allItems.length} items`
        : ''
    }

    searchEl?.addEventListener('input', applyFilters)
    catEl?.addEventListener('change', applyFilters)
    typeEl?.addEventListener('change', applyFilters)
    sortEl?.addEventListener('change', applyFilters)

  } catch (err) {
    setHTML(`<div class="alert alert-error">${err.message}</div>`)
  }
}

async function routeItemNew(matches) {
  if (!auth.isLoggedIn) return navigate('/login')
  const galaxyId = matches[1]
  const urlParams = new URLSearchParams(window.location.search)
  const preselectedLocationId = urlParams.get('location') ?? ''
  const preselectedBarcode = urlParams.get('barcode') ?? ''
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  const [invData, locData, catData] = await Promise.all([
    api('GET', `/galaxies/${galaxyId}`),
    api('GET', `/galaxies/${galaxyId}/locations`),
    api('GET', `/galaxies/${galaxyId}/categories`),
  ])
  const locations  = locData?.locations ?? []
  const categories = catData?.categories ?? []

  setBreadcrumb([
    { label: 'Galaxies', href: '/galaxies' },
    { label: invData?.galaxy?.name ?? '', href: `/galaxies/${galaxyId}` },
    { label: 'Items', href: `/galaxies/${galaxyId}/items` },
    { label: 'Add Item' },
  ])

  const locById = Object.fromEntries(locations.map(n => [n.id, n]))
  const selectedAncestors = new Set()
  let _cur = locById[preselectedLocationId]
  while (_cur?.parent_id) { selectedAncestors.add(_cur.parent_id); _cur = locById[_cur.parent_id] }

  function buildLocOptions(nodes, parentId = null, depth = 0) {
    return nodes
      .filter(n => (n.parent_id ?? null) === parentId)
      .flatMap(n => {
        const inChain = n.id === preselectedLocationId || selectedAncestors.has(n.id)
        const prefix = inChain ? '▸\u00a0' : '\u00a0\u00a0'
        const label = n.location_type === 'room'
          ? prefix + escapeHTML(n.name)
          : prefix + '\u00a0\u00a0'.repeat(depth) + escapeHTML(n.name)
        return [
          `<option value="${n.id}"${n.id === preselectedLocationId ? ' selected' : ''}>${label}</option>`,
          ...buildLocOptions(nodes, n.id, depth + 1),
        ]
      })
  }
  const locOptions = `<option value="">— None —</option>` + buildLocOptions(locations).join('')
  const catOptions = `<option value="">— None —</option>` +
    categories.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('')

  setHTML(`
    <div>
      <div class="page-header">
        <h1 class="page-title">Add Item</h1>
      </div>

      <div class="card">
        <div class="card-body">
          <div id="form-error" role="alert"></div>
          <form id="new-item-form">

            <div class="field">
              <label for="barcode-input">Barcode</label>
              <div style="display:flex;gap:var(--space-2)">
                <input type="text" id="barcode-input" inputmode="numeric" placeholder="Scan or type UPC…" autocomplete="off" style="flex:1">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-lookup-barcode">Look up</button>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-scan-barcode" hidden>📷 Scan</button>
              </div>
              <div id="scan-preview" hidden style="margin-top:var(--space-2)">
                <video id="scan-video" autoplay playsinline muted style="width:100%;border-radius:var(--radius);max-height:220px;background:#000;object-fit:cover;display:block"></video>
                <button type="button" class="btn btn-ghost btn-sm" id="btn-scan-cancel" style="margin-top:var(--space-2)">Cancel</button>
              </div>
              <div id="barcode-status" class="text-sm mt-1" style="min-height:1.2em"></div>
            </div>

            <div class="field">
              <label for="item-name">Name <span aria-hidden="true">*</span></label>
              <input type="text" id="item-name" name="name" required>
              <div id="item-name-hint"></div>
            </div>
            <div class="field">
              <label for="item-qty">Quantity</label>
              <quantity-stepper>
                <button type="button" data-action="decrement" aria-label="Decrease">−</button>
                <input type="number" id="item-qty" name="quantity" value="1" min="0" step="1">
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
                <option value="boardgame">🎲 Board Game</option>
                <option value="digital">Digital</option>
                <option value="subscription">Subscription</option>
                <option value="document">Document</option>
              </select>
              <p id="bg-type-hint" class="text-xs text-muted mt-1">Select <strong>Board Game</strong> to enter game-specific details.</p>
            </div>

            <div id="boardgame-fields" hidden>
              <div class="field">
                <label for="bg-url">BGG URL</label>
                <input type="url" id="bg-url" name="bg_url" placeholder="https://boardgamegeek.com/boardgame/13/catan">
                <span id="bg-id-display" class="text-xs text-muted" hidden></span>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
                <div class="field">
                  <label for="bg-year">Year published</label>
                  <input type="number" id="bg-year" name="bg_year" min="1900" max="2100" placeholder="e.g. 2021">
                </div>
                <div class="field">
                  <label for="bg-age">Min age</label>
                  <input type="number" id="bg-age" name="bg_min_age" min="0" max="99" placeholder="e.g. 10">
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-3)">
                <div class="field">
                  <label for="bg-min-players">Min players</label>
                  <input type="number" id="bg-min-players" name="bg_min_players" min="1" placeholder="1">
                </div>
                <div class="field">
                  <label for="bg-max-players">Max players</label>
                  <input type="number" id="bg-max-players" name="bg_max_players" min="1" placeholder="4">
                </div>
                <div class="field">
                  <label for="bg-time">Play time (min)</label>
                  <input type="number" id="bg-time" name="bg_playing_time" min="1" placeholder="60">
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
                <div class="field">
                  <label for="bg-publisher">Publisher</label>
                  <input type="text" id="bg-publisher" name="bg_publisher" placeholder="e.g. Stonemaier Games">
                </div>
                <div class="field">
                  <label for="bg-designer">Designer</label>
                  <input type="text" id="bg-designer" name="bg_designer" placeholder="e.g. Jamey Stegmaier">
                </div>
              </div>
              <div class="field">
                <label>Box dimensions</label>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:var(--space-2);align-items:center">
                  <input type="number" id="bg-dim-l" name="bg_dim_l" min="0" step="any" placeholder="L">
                  <input type="number" id="bg-dim-w" name="bg_dim_w" min="0" step="any" placeholder="W">
                  <input type="number" id="bg-dim-h" name="bg_dim_h" min="0" step="any" placeholder="H">
                  <select id="bg-dim-unit" name="bg_dim_unit" style="width:5rem">
                    <option value="cm">cm</option>
                    <option value="in">in</option>
                  </select>
                </div>
              </div>
              <div class="field">
                <label for="bg-weight">Weight</label>
                <div style="display:grid;grid-template-columns:1fr auto;gap:var(--space-2);align-items:center">
                  <input type="number" id="bg-weight" name="bg_weight" min="0" step="any" placeholder="0.0">
                  <select id="bg-weight-unit" name="bg_weight_unit" style="width:5rem">
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                    <option value="g">g</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="field" style="margin-top:var(--space-6)">
              <label for="item-desc">Description</label>
              <textarea id="item-desc" name="description" rows="2"></textarea>
            </div>

            <div id="new-custom-cards" style="margin-top:var(--space-4)"></div>
            <button type="button" id="btn-add-card" class="btn btn-ghost btn-sm" style="margin-bottom:var(--space-4)">+ Add custom card</button>

            <div class="field">
              <label>Photo</label>
              <div class="new-item-photo-row">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-open-camera">📷 Camera</button>
                <label class="btn btn-secondary btn-sm" style="cursor:pointer">
                  🖼 Choose file
                  <input type="file" id="new-item-photo-input" accept="image/*" style="display:none">
                </label>
                <span id="new-item-photo-name" class="text-xs text-muted"></span>
              </div>
              <div id="new-item-camera-preview" hidden style="margin-top:var(--space-2)">
                <video id="new-item-camera-video" autoplay playsinline muted style="width:100%;border-radius:var(--radius);max-height:260px;background:#000;object-fit:cover;display:block"></video>
                <div style="display:flex;gap:var(--space-2);margin-top:var(--space-2)">
                  <button type="button" class="btn btn-primary btn-sm" id="btn-capture-photo">⬤ Capture</button>
                  <button type="button" class="btn btn-ghost btn-sm" id="btn-cancel-camera">Cancel</button>
                </div>
              </div>
              <div id="new-item-photo-preview" style="margin-top:var(--space-2);display:none">
                <img id="new-item-photo-img" style="max-height:160px;border-radius:var(--radius);object-fit:cover;display:block">
                <button type="button" class="btn btn-ghost btn-xs" id="btn-clear-photo" style="margin-top:var(--space-1)">Remove</button>
              </div>
              <canvas id="new-item-photo-canvas" style="display:none"></canvas>
            </div>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Add item</button>
              <a href="/galaxies/${galaxyId}/items" data-link class="btn btn-secondary">Cancel</a>
            </div>
          </form>
        </div>
      </div>
    </div>
  `)

  // ── Board game fields toggle + BGG URL parsing ───────────────────────────
  const bgFields = document.getElementById('boardgame-fields')
  document.getElementById('item-type').addEventListener('change', e => {
    const isBoardGame = e.target.value === 'boardgame'
    bgFields.hidden = !isBoardGame
    document.getElementById('bg-type-hint').hidden = isBoardGame
  })

  document.getElementById('bg-url').addEventListener('input', e => {
    const id = parseBggId(e.target.value)
    const display = document.getElementById('bg-id-display')
    if (id) { display.textContent = `BGG ID: ${id}`; display.hidden = false }
    else { display.hidden = true }
  })

  // ── Custom cards ─────────────────────────────────────────────────────────
  const newUserCards = []
  renderCustomCards(newUserCards, 'new-custom-cards')
  bindCustomCards(newUserCards, 'new-custom-cards')
  document.getElementById('btn-add-card').addEventListener('click', () => {
    newUserCards.push({ name: '', fields: [{ label: '', value: '' }] })
    renderCustomCards(newUserCards, 'new-custom-cards')
    const inputs = document.querySelectorAll('.custom-card__name-input')
    inputs[inputs.length - 1]?.focus()
  })

  // ── Duplicate item check ──────────────────────────────────────────────────
  const nameInput = document.getElementById('item-name')
  const nameHint  = document.getElementById('item-name-hint')
  let dupTimer = null

  nameInput.addEventListener('input', () => {
    clearTimeout(dupTimer)
    nameHint.innerHTML = ''
    const val = nameInput.value.trim()
    if (!val) return
    dupTimer = setTimeout(async () => {
      const data = await api('GET', `/galaxies/${galaxyId}/items?q=${encodeURIComponent(val)}`)
      if (!data) return
      const exact = (data.items ?? []).filter(i => i.name.toLowerCase() === val.toLowerCase())
      if (!exact.length) return

      const item = exact[0]
      const locText = item.location_name ? ` · stored in <strong>${escapeHTML(item.location_name)}</strong>` : ''

      nameHint.innerHTML = `
        <div class="item-dup-hint">
          <span>⚠ "<strong>${escapeHTML(item.name)}</strong>" already exists${locText}.</span>
          <div class="item-dup-hint__actions">
            <a href="/galaxies/${galaxyId}/items/${item.id}" data-link class="btn btn-secondary btn-sm">View item</a>
            <button type="button" class="btn btn-ghost btn-sm" id="dup-dismiss">Add anyway</button>
          </div>
        </div>
      `
      document.getElementById('dup-dismiss').addEventListener('click', () => { nameHint.innerHTML = '' })
    }, 350)
  })

  // ── Pre-fill from modal capture ───────────────────────────────────────────
  // (consume module-level state set by openAddItemModal before any async work)
  const capturedPhoto = window.pendingItemPhoto ?? null
  window.pendingItemPhoto = null

  // ── Photo selection ───────────────────────────────────────────────────────
  let pendingPhotoFile = null
  let photoStream = null

  function setPhotoPreview(file, label) {
    pendingPhotoFile = file
    document.getElementById('new-item-photo-name').textContent = label ?? file.name
    const img = document.getElementById('new-item-photo-img')
    img.src = URL.createObjectURL(file)
    document.getElementById('new-item-photo-preview').style.display = 'block'
  }

  function stopPhotoCamera() {
    if (photoStream) { photoStream.getTracks().forEach(t => t.stop()); photoStream = null }
    document.getElementById('new-item-camera-preview').hidden = true
    document.getElementById('new-item-camera-video').srcObject = null
  }

  document.getElementById('new-item-photo-input').addEventListener('change', e => {
    const file = e.target.files?.[0]
    if (file) setPhotoPreview(file)
  })

  document.getElementById('btn-open-camera').addEventListener('click', async () => {
    try {
      photoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      const video = document.getElementById('new-item-camera-video')
      video.srcObject = photoStream
      document.getElementById('new-item-camera-preview').hidden = false
    } catch {
      alert('Camera access denied or unavailable.')
    }
  })

  document.getElementById('btn-capture-photo').addEventListener('click', () => {
    const video = document.getElementById('new-item-camera-video')
    const canvas = document.getElementById('new-item-photo-canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    stopPhotoCamera()
    canvas.toBlob(blob => {
      if (blob) setPhotoPreview(new File([blob], 'photo.jpg', { type: 'image/jpeg' }), 'Camera photo')
    }, 'image/jpeg', 0.9)
  })

  document.getElementById('btn-cancel-camera').addEventListener('click', stopPhotoCamera)

  document.getElementById('btn-clear-photo').addEventListener('click', () => {
    pendingPhotoFile = null
    document.getElementById('new-item-photo-preview').style.display = 'none'
    document.getElementById('new-item-photo-name').textContent = ''
  })

  // Pre-populate photo captured from the add-item modal
  if (capturedPhoto) setPhotoPreview(capturedPhoto, 'Camera photo')

  // ── Barcode scanning & lookup ─────────────────────────────────────────────
  let productImageUrl = null

  const barcodeInput  = document.getElementById('barcode-input')
  const scanBtn       = document.getElementById('btn-scan-barcode')
  const scanPreview   = document.getElementById('scan-preview')
  const scanVideo     = document.getElementById('scan-video')
  const scanCancelBtn = document.getElementById('btn-scan-cancel')
  const barcodeStatus = document.getElementById('barcode-status')

  if ('BarcodeDetector' in window) scanBtn.hidden = false

  let mediaStream = null
  let scanRaf = null

  function stopCamera() {
    if (scanRaf) { cancelAnimationFrame(scanRaf); scanRaf = null }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null }
    scanPreview.hidden = true
    scanVideo.srcObject = null
  }

  async function startCamera() {
    barcodeStatus.textContent = 'Starting camera…'
    barcodeStatus.style.color = ''
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      scanVideo.srcObject = mediaStream
      scanPreview.hidden = false
      barcodeStatus.textContent = 'Point camera at barcode…'

      const detector = new BarcodeDetector({
        formats: ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39', 'itf', 'codabar'],
      })

      async function tick() {
        if (!mediaStream) return
        try {
          const results = await detector.detect(scanVideo)
          if (results.length) {
            const upc = results[0].rawValue
            stopCamera()
            barcodeInput.value = upc
            await lookupBarcode(upc)
            return
          }
        } catch {}
        scanRaf = requestAnimationFrame(tick)
      }
      scanRaf = requestAnimationFrame(tick)
    } catch {
      barcodeStatus.textContent = 'Camera access denied'
      barcodeStatus.style.color = 'var(--c-danger)'
      stopCamera()
    }
  }

  scanBtn.addEventListener('click', startCamera)
  scanCancelBtn.addEventListener('click', () => { stopCamera(); barcodeStatus.textContent = '' })

  // USB / Bluetooth keyboard-wedge scanners emit the barcode then Enter
  barcodeInput.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const upc = barcodeInput.value.trim()
      if (upc) await lookupBarcode(upc)
    }
  })

  document.getElementById('btn-lookup-barcode').addEventListener('click', async () => {
    const upc = barcodeInput.value.trim()
    if (upc) await lookupBarcode(upc)
  })

  async function lookupBarcode(upc) {
    barcodeStatus.textContent = 'Looking up product…'
    barcodeStatus.style.color = ''
    try {
      const data = await api('GET', `/barcode/${upc}`)
      if (!data) return
      const nameEl = document.getElementById('item-name')
      const descEl = document.getElementById('item-desc')
      const typeEl = document.getElementById('item-type')
      if (data.name) nameEl.value = data.name
      if (data.description) descEl.value = data.description
      if (data.imageUrl) productImageUrl = data.imageUrl
      if (data.itemType && typeEl) {
        const isBoardGame = data.itemType === 'boardgame'
        typeEl.value = data.itemType
        document.getElementById('boardgame-fields').hidden = !isBoardGame
        document.getElementById('bg-type-hint').hidden = isBoardGame
      }
      barcodeStatus.textContent = data.name ? `✓ Found: ${data.name}` : '✓ Product found'
      barcodeStatus.style.color = 'var(--c-brand)'
      nameEl.focus()
    } catch (err) {
      barcodeStatus.textContent = err.message ?? 'Lookup failed'
      barcodeStatus.style.color = 'var(--c-danger)'
    }
  }

  // Auto-lookup barcode passed from the add-item modal
  if (preselectedBarcode) {
    barcodeInput.value = preselectedBarcode
    lookupBarcode(preselectedBarcode)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  document.getElementById('new-item-form').addEventListener('submit', async e => {
    e.preventDefault()
    const btn = e.target.querySelector('[type=submit]')
    const errEl = document.getElementById('form-error')
    errEl.innerHTML = ''
    btn.disabled = true

    // Collect board game custom fields if type is boardgame
    let customFields = {}
    if (e.target.item_type.value === 'boardgame') {
      const num = name => { const v = Number(e.target[name]?.value); return v || undefined }
      const str = name => e.target[name]?.value.trim() || undefined
      const dimL = num('bg_dim_l'), dimW = num('bg_dim_w'), dimH = num('bg_dim_h')
      const dimUnit = str('bg_dim_unit')
      const weight = num('bg_weight'), weightUnit = str('bg_weight_unit')
      customFields = Object.fromEntries(Object.entries({
        bgg_id:         parseBggId(e.target.bg_url?.value ?? '') ?? undefined,
        year_published: num('bg_year'),
        min_players:    num('bg_min_players'),
        max_players:    num('bg_max_players'),
        playing_time_min: num('bg_playing_time'),
        min_age:        num('bg_min_age'),
        publisher:      str('bg_publisher'),
        designer:       str('bg_designer'),
        box_dimensions: (dimL || dimW || dimH) ? { l: dimL, w: dimW, h: dimH, unit: dimUnit } : undefined,
        weight:         weight ? { value: weight, unit: weightUnit } : undefined,
      }).filter(([, v]) => v != null))
    }

    const cards = collectCustomCards(newUserCards)
    if (cards.length) customFields._cards = cards

    try {
      const data = await api('POST', `/galaxies/${galaxyId}/items`, {
        name: e.target.name.value,
        quantity: Number(e.target.quantity.value),
        unit: e.target.unit.value || undefined,
        location_id: e.target.location_id?.value || undefined,
        category_id: e.target.category_id?.value || undefined,
        item_type: e.target.item_type.value,
        description: e.target.description.value || undefined,
        custom_fields: Object.keys(customFields).length ? customFields : undefined,
      })
      if (data) {
        stopPhotoCamera()
        if (pendingPhotoFile) {
          try {
            const form = new FormData()
            form.append('photo', pendingPhotoFile)
            const headers = {}
            if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`
            await fetch(`/api/galaxies/${galaxyId}/items/${data.item.id}/photos`, { method: 'POST', headers, body: form })
          } catch {}
        } else if (productImageUrl) {
          try { await api('POST', `/galaxies/${galaxyId}/items/${data.item.id}/photos/url`, { url: productImageUrl }) } catch {}
        }
        navigate(`/galaxies/${galaxyId}/items/${data.item.id}`)
      }
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error mb-4">${err.message}</div>`
      btn.disabled = false
    }
  })
}

async function routeItem(matches) {
  if (!auth.isLoggedIn) return navigate('/login')
  const [, galaxyId, itemId] = matches
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  try {
    const [data, invData, locData] = await Promise.all([
      api('GET', `/galaxies/${galaxyId}/items/${itemId}`),
      api('GET', `/galaxies/${galaxyId}`),
      api('GET', `/galaxies/${galaxyId}/locations`),
    ])
    if (!data) return
    const { item, photos } = data

    const locById = Object.fromEntries((locData?.locations ?? []).map(l => [l.id, l]))
    const locationAncestors = []
    let cur = locById[item.location_id]
    while (cur) { locationAncestors.unshift(cur); cur = locById[cur.parent_id] }

    setBreadcrumb([
      { label: 'Galaxies', href: '/galaxies' },
      { label: invData?.galaxy?.name ?? '', href: `/galaxies/${galaxyId}` },
      ...locationAncestors.map(l => ({ label: l.name, href: `/galaxies/${galaxyId}/locations/${l.id}` })),
    ])

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
            <span class="text-xs">Upload</span>
          </label>
          <button type="button" class="photo-gallery__add" id="photo-url-btn" aria-label="Add photo by URL">
            <span class="photo-gallery__add-icon">🔗</span>
            <span class="text-xs">URL</span>
          </button>
        </div>
        <div id="photo-url-form" hidden style="display:flex;gap:var(--space-2);margin-top:var(--space-3)">
          <input type="url" id="photo-url-input" placeholder="https://…" style="flex:1">
          <button type="button" class="btn btn-secondary btn-sm" id="photo-url-submit">Add</button>
          <button type="button" class="btn btn-ghost btn-sm" id="photo-url-cancel">Cancel</button>
        </div>
      `
    }

    const heroPhoto = photos[0] ?? null

    let cf = {}
    try { cf = JSON.parse(item.custom_fields ?? '{}') } catch {}
    const d = cf.box_dimensions
    const dimStr = d ? [d.l, d.w, d.h].filter(Boolean).join(' × ') + (d.unit ? ` ${d.unit}` : '') : null
    const w = cf.weight
    const weightStr = w ? `${w.value}${w.unit ? ' ' + w.unit : ''}` : null
    const bggFields = [
      cf.year_published != null    ? ['Published', String(cf.year_published), 'year_published'] : null,
      (cf.min_players != null || cf.max_players != null) ? ['Players', `${cf.min_players ?? '?'}–${cf.max_players ?? '?'}`, 'players'] : null,
      cf.playing_time_min != null  ? ['Play time', `~${cf.playing_time_min} min`, 'playing_time_min'] : null,
      cf.min_age != null           ? ['Min age', `${cf.min_age}+`, 'min_age'] : null,
      cf.publisher                 ? ['Publisher', escapeHTML(cf.publisher), 'publisher'] : null,
      cf.designer                  ? ['Designer', escapeHTML(cf.designer), 'designer'] : null,
      dimStr                       ? ['Box size', escapeHTML(dimStr), 'box_dimensions'] : null,
      weightStr                    ? ['Weight', escapeHTML(weightStr), 'weight'] : null,
    ].filter(Boolean)

    setHTML(`
      <div>
        <div class="page-header">
          <div class="flex items-center justify-between">
            <div class="flex gap-2">
              <a href="/galaxies/${galaxyId}/items/${itemId}/edit" data-link class="btn btn-secondary btn-sm">Edit</a>
              <button class="btn btn-ghost btn-sm" id="btn-delete" style="color:var(--c-danger)">Delete</button>
            </div>
          </div>
          <h1 class="page-title mt-4 inline-editable" id="item-title" title="Click to edit">${escapeHTML(item.name)}</h1>
          ${item.category_name ? `<p class="page-subtitle">${escapeHTML(item.category_name)}</p>` : ''}
        </div>

        ${heroPhoto ? `<img src="${heroPhoto.url}" alt="${escapeHTML(item.name)}" class="item-hero-photo">` : ''}

        <div class="card mb-4">
          <div class="card-body text-sm inline-editable" id="item-desc-body" title="Click to edit">
            ${item.description
              ? `<span class="inline-desc-text" style="white-space:pre-wrap">${escapeHTML(item.description)}</span>`
              : `<span class="inline-desc-placeholder text-muted">Add a description…</span>`}
          </div>
        </div>

        ${bggFields.length ? `
        <div class="card mb-4">
          <div class="card-header"><h2 class="section-title" style="margin:0">🎲 Board Game Info</h2></div>
          <div class="card-body">
            <dl class="bgg-info-grid">
              ${bggFields.map(([k, v, f]) => `<dt>${k}</dt><dd class="inline-editable" data-bg-field="${f}" title="Click to edit">${v}</dd>`).join('')}
            </dl>
          </div>
        </div>` : ''}

        ${(cf._cards ?? []).filter(c => c.fields?.length).map(c => `
        <div class="card mb-4">
          <div class="card-header"><h2 class="section-title" style="margin:0">${escapeHTML(c.name || 'Custom Fields')}</h2></div>
          <div class="card-body">
            <dl class="bgg-info-grid">
              ${c.fields.map(f => `<dt>${escapeHTML(f.label)}</dt><dd>${escapeHTML(f.value)}</dd>`).join('')}
            </dl>
          </div>
        </div>`).join('')}

        <div class="card mb-4">
          <div class="card-body">
            <div class="text-xs text-muted font-medium mb-1" style="text-transform:uppercase;letter-spacing:.05em">Disposition</div>
            <div class="disposition-btns" id="disposition-btns">
              ${DISPOSITIONS.map(d => `
                <button class="disposition-btn${item.disposition === d.value ? ' disposition-btn--active' : ''}"
                  data-value="${d.value}" style="--d-color:${d.color}">${d.label}</button>
              `).join('')}
              ${item.disposition ? `<button class="disposition-btn disposition-btn--clear" id="disposition-clear">Clear</button>` : ''}
            </div>
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-body">
            <div class="text-xs text-muted font-medium mb-1" style="text-transform:uppercase;letter-spacing:.05em">Quantity</div>
            <div class="inline-editable" id="item-qty-row" title="Click to edit" style="font-size:var(--text-3xl);font-weight:var(--weight-bold);color:var(--c-brand);line-height:1.2;display:inline-block">
              <span id="item-qty-val">${item.quantity}</span>${item.unit ? ' <span style="font-size:var(--text-lg)">' + escapeHTML(item.unit) + '</span>' : ''}
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

      </div>
    `)

    document.getElementById('disposition-btns').addEventListener('click', async e => {
      const btn = e.target.closest('.disposition-btn')
      if (!btn) return
      const value = btn.id === 'disposition-clear' ? null : btn.dataset.value
      try {
        await api('PATCH', `/galaxies/${galaxyId}/items/${itemId}`, { disposition: value })
        // Update buttons in place — no page reload
        const container = document.getElementById('disposition-btns')
        container.querySelectorAll('.disposition-btn').forEach(b => b.classList.remove('disposition-btn--active'))
        if (value) btn.classList.add('disposition-btn--active')
        // Show/hide clear button
        let clearBtn = document.getElementById('disposition-clear')
        if (value && !clearBtn) {
          clearBtn = document.createElement('button')
          clearBtn.className = 'disposition-btn disposition-btn--clear'
          clearBtn.id = 'disposition-clear'
          clearBtn.textContent = 'Clear'
          container.appendChild(clearBtn)
        } else if (!value && clearBtn) {
          clearBtn.remove()
        }
      } catch (err) { alert(err.message) }
    })

    document.getElementById('btn-delete').addEventListener('click', async () => {
      if (!await confirmDelete(`Delete "${item.name}"?`, 'This item and all its photos will be permanently removed.')) return
      try {
        await api('DELETE', `/galaxies/${galaxyId}/items/${itemId}`)
        navigate(`/galaxies/${galaxyId}/items`)
      } catch (err) {
        alert(err.message)
      }
    })

    // Wire up photo upload
    document.getElementById('photo-input').addEventListener('change', async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const form = new FormData()
      form.append('photo', file)
      try {
        const headers = {}
        if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`
        const res = await fetch(`/api/galaxies/${galaxyId}/items/${itemId}/photos`, {
          method: 'POST', headers, body: form,
        })
        if (res.status === 401) { auth.clear(); return navigate('/login') }
        if (!res.ok) { const d = await res.json().catch(() => null); throw new Error(d?.error ?? 'Upload failed') }
        navigate(`/galaxies/${galaxyId}/items/${itemId}`)
      } catch (err) {
        alert(err.message)
      }
    })

    // Wire up photo URL
    document.getElementById('photo-url-btn').addEventListener('click', () => {
      const form = document.getElementById('photo-url-form')
      form.hidden = false
      form.style.display = 'flex'
      document.getElementById('photo-url-input').focus()
    })
    document.getElementById('photo-url-cancel').addEventListener('click', () => {
      document.getElementById('photo-url-form').hidden = true
      document.getElementById('photo-url-input').value = ''
    })
    async function submitPhotoUrl() {
      const url = document.getElementById('photo-url-input').value.trim()
      if (!url) return
      try {
        await api('POST', `/galaxies/${galaxyId}/items/${itemId}/photos/url`, { url })
        navigate(`/galaxies/${galaxyId}/items/${itemId}`)
      } catch (err) {
        alert(err.message)
      }
    }
    document.getElementById('photo-url-submit').addEventListener('click', submitPhotoUrl)
    document.getElementById('photo-url-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); submitPhotoUrl() }
    })

    // Wire up photo delete
    document.getElementById('photo-gallery').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-photo-id].photo-gallery__delete')
      if (!btn) return
      if (!await confirmDelete('Delete this photo?')) return
      const photoId = btn.dataset.photoId
      try {
        await api('DELETE', `/galaxies/${galaxyId}/items/${itemId}/photos/${photoId}`)
        navigate(`/galaxies/${galaxyId}/items/${itemId}`)
      } catch (err) {
        alert(err.message)
      }
    })

    // ---- Inline editing ----
    async function patchField(field, value) {
      await api('PATCH', `/galaxies/${galaxyId}/items/${itemId}`, { [field]: value })
    }

    // Tab flow: commit current field and activate next/prev .inline-editable in DOM order
    function tabToNext(currentEditable, reverse = false) {
      const editables = [...document.querySelectorAll('.inline-editable')]
      const idx = editables.indexOf(currentEditable)
      const next = editables[reverse ? idx - 1 : idx + 1]
      if (next) next.click()
    }

    // Name
    const titleEl = document.getElementById('item-title')
    titleEl.addEventListener('click', () => {
      const orig = item.name
      const input = document.createElement('input')
      input.type = 'text'
      input.value = orig
      input.className = 'inline-edit-input inline-edit-input--title'
      titleEl.replaceWith(input)
      input.focus(); input.select()
      let done = false
      async function commit() {
        if (done) return; done = true
        const val = input.value.trim()
        if (!val || val === orig) { input.replaceWith(titleEl); return }
        item.name = val; titleEl.textContent = val; input.replaceWith(titleEl)
        try { await patchField('name', val) }
        catch (err) { alert(err.message); item.name = orig; titleEl.textContent = orig }
      }
      function cancel() { if (done) return; done = true; input.replaceWith(titleEl) }
      input.addEventListener('blur', commit)
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') { input.removeEventListener('blur', commit); cancel() }
        if (e.key === 'Tab') { e.preventDefault(); commit(); tabToNext(titleEl, e.shiftKey) }
      })
    })

    // Description
    const descBodyEl = document.getElementById('item-desc-body')
    function renderDescContent(text) {
      descBodyEl.innerHTML = text
        ? `<span class="inline-desc-text" style="white-space:pre-wrap">${escapeHTML(text)}</span>`
        : `<span class="inline-desc-placeholder text-muted">Add a description…</span>`
    }
    descBodyEl.addEventListener('click', () => {
      if (descBodyEl.querySelector('textarea')) return
      const orig = item.description ?? ''
      const textarea = document.createElement('textarea')
      textarea.value = orig
      textarea.className = 'inline-edit-input'
      textarea.rows = Math.max(3, orig.split('\n').length + 1)
      descBodyEl.innerHTML = ''
      descBodyEl.appendChild(textarea)
      textarea.focus()
      let done = false
      async function commit() {
        if (done) return; done = true
        const val = textarea.value.trim()
        item.description = val || null; renderDescContent(item.description)
        if (val !== orig) {
          try { await patchField('description', item.description) }
          catch (err) { alert(err.message); item.description = orig || null; renderDescContent(item.description) }
        }
      }
      function cancel() { if (done) return; done = true; renderDescContent(orig) }
      textarea.addEventListener('blur', commit)
      textarea.addEventListener('keydown', e => {
        if (e.key === 'Escape') { textarea.removeEventListener('blur', commit); cancel() }
        if (e.key === 'Tab') { e.preventDefault(); commit(); tabToNext(descBodyEl, e.shiftKey) }
      })
    })

    // Quantity
    const qtyRowEl = document.getElementById('item-qty-row')
    const qtyValEl = document.getElementById('item-qty-val')
    qtyRowEl.addEventListener('click', () => {
      if (qtyRowEl.querySelector('input')) return
      const orig = item.quantity
      const input = document.createElement('input')
      input.type = 'number'; input.value = orig; input.min = '0'; input.step = '1'
      input.className = 'inline-edit-input inline-edit-input--qty'
      qtyValEl.replaceWith(input)
      input.focus(); input.select()
      let done = false
      async function commit() {
        if (done) return; done = true
        const val = Math.max(0, Math.round(Number(input.value) || 0))
        item.quantity = val; qtyValEl.textContent = val; input.replaceWith(qtyValEl)
        if (val !== orig) {
          try { await patchField('quantity', val) }
          catch (err) { alert(err.message); item.quantity = orig; qtyValEl.textContent = orig }
        }
      }
      function cancel() { if (done) return; done = true; input.replaceWith(qtyValEl) }
      input.addEventListener('blur', commit)
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') { input.removeEventListener('blur', commit); cancel() }
        if (e.key === 'Tab') { e.preventDefault(); commit(); tabToNext(qtyRowEl, e.shiftKey) }
      })
    })

    // BGG fields
    function bgFieldDisplay(field) {
      if (field === 'year_published')   return cf.year_published != null ? String(cf.year_published) : ''
      if (field === 'playing_time_min') return cf.playing_time_min != null ? `~${cf.playing_time_min} min` : ''
      if (field === 'min_age')          return cf.min_age != null ? `${cf.min_age}+` : ''
      if (field === 'publisher')        return cf.publisher ?? ''
      if (field === 'designer')         return cf.designer ?? ''
      if (field === 'players') {
        const mn = cf.min_players, mx = cf.max_players
        return (mn != null || mx != null) ? `${mn ?? '?'}–${mx ?? '?'}` : ''
      }
      if (field === 'box_dimensions') {
        const bd = cf.box_dimensions
        return bd ? [bd.l, bd.w, bd.h].filter(Boolean).join(' × ') + (bd.unit ? ` ${bd.unit}` : '') : ''
      }
      if (field === 'weight') {
        const wt = cf.weight
        return wt ? `${wt.value}${wt.unit ? ' ' + wt.unit : ''}` : ''
      }
      return ''
    }

    document.querySelectorAll('[data-bg-field]').forEach(dd => {
      dd.addEventListener('click', () => {
        if (dd.querySelector('input,select')) return
        const field = dd.dataset.bgField
        const origDisplay = dd.innerHTML
        const allInputs = []

        function num(val, opts = {}) {
          const el = document.createElement('input')
          el.type = 'number'; el.value = val ?? ''; el.className = 'inline-edit-input'
          el.style.width = opts.width ?? '5rem'; el.min = opts.min ?? '0'
          if (opts.step) el.step = opts.step
          if (opts.placeholder) el.placeholder = opts.placeholder
          allInputs.push(el); return el
        }
        function txt(val) {
          const el = document.createElement('input')
          el.type = 'text'; el.value = val ?? ''; el.className = 'inline-edit-input'
          allInputs.push(el); return el
        }
        function sel(options, current) {
          const el = document.createElement('select')
          el.className = 'inline-edit-input'; el.style.width = 'auto'
          options.forEach(([v, l]) => {
            const o = document.createElement('option')
            o.value = v; o.textContent = l; if (v === current) o.selected = true
            el.appendChild(o)
          })
          allInputs.push(el); return el
        }
        function span(text) {
          const s = document.createElement('span'); s.textContent = text; s.style.padding = '0 2px'; return s
        }

        const wrap = document.createElement('div')
        wrap.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap'

        if (field === 'year_published' || field === 'playing_time_min' || field === 'min_age') {
          wrap.appendChild(num(cf[field], { width: '6rem' }))
        } else if (field === 'publisher' || field === 'designer') {
          wrap.appendChild(txt(cf[field]))
        } else if (field === 'players') {
          wrap.appendChild(num(cf.min_players, { width: '4rem', min: '1', placeholder: 'min' }))
          wrap.appendChild(span('–'))
          wrap.appendChild(num(cf.max_players, { width: '4rem', min: '1', placeholder: 'max' }))
        } else if (field === 'box_dimensions') {
          const bd = cf.box_dimensions ?? {}
          wrap.appendChild(num(bd.l, { width: '4rem', step: 'any', placeholder: 'L' }))
          wrap.appendChild(span('×'))
          wrap.appendChild(num(bd.w, { width: '4rem', step: 'any', placeholder: 'W' }))
          wrap.appendChild(span('×'))
          wrap.appendChild(num(bd.h, { width: '4rem', step: 'any', placeholder: 'H' }))
          wrap.appendChild(sel([['cm','cm'],['in','in']], cf.box_dimensions?.unit ?? 'cm'))
        } else if (field === 'weight') {
          const wt = cf.weight ?? {}
          wrap.appendChild(num(wt.value, { width: '5rem', step: 'any' }))
          wrap.appendChild(sel([['kg','kg'],['lb','lb'],['g','g']], wt.unit ?? 'kg'))
        }

        dd.innerHTML = ''; dd.appendChild(wrap)
        if (allInputs[0]) allInputs[0].focus()

        let done = false
        async function commit() {
          if (done) return; done = true
          const n = i => { const v = Number(allInputs[i]?.value); return isNaN(v) || !allInputs[i]?.value ? undefined : v }
          const s = i => allInputs[i]?.value.trim() || undefined

          if (field === 'year_published')        cf.year_published   = n(0)
          else if (field === 'playing_time_min') cf.playing_time_min = n(0)
          else if (field === 'min_age')          cf.min_age          = n(0)
          else if (field === 'publisher')        cf.publisher        = s(0)
          else if (field === 'designer')         cf.designer         = s(0)
          else if (field === 'players')          { cf.min_players = n(0); cf.max_players = n(1) }
          else if (field === 'box_dimensions') {
            const l = n(0), w = n(1), h = n(2), unit = allInputs[3]?.value
            cf.box_dimensions = (l || w || h) ? { l, w, h, unit } : undefined
          } else if (field === 'weight') {
            const val = n(0), unit = allInputs[1]?.value
            cf.weight = val ? { value: val, unit } : undefined
          }

          dd.innerHTML = bgFieldDisplay(field)
          try { await patchField('custom_fields', cf) }
          catch (err) { alert(err.message); dd.innerHTML = origDisplay }
        }
        function cancel() { if (done) return; done = true; dd.innerHTML = origDisplay }

        wrap.addEventListener('focusout', e => {
          if (wrap.contains(e.relatedTarget)) return
          commit()
        })
        allInputs.forEach((el, i) => {
          el.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') cancel()
            if (e.key === 'Tab') {
              const isFirst = i === 0
              const isLast = i === allInputs.length - 1
              if (!e.shiftKey && isLast) { e.preventDefault(); commit(); tabToNext(dd, false) }
              else if (e.shiftKey && isFirst) { e.preventDefault(); commit(); tabToNext(dd, true) }
              // otherwise let Tab flow naturally between inputs within the compound field
            }
          })
        })
      })
    })

  } catch (err) {
    setHTML(`<div class="alert alert-error">${err.message}</div>`)
  }
}

async function routeItemEdit(matches) {
  if (!auth.isLoggedIn) return navigate('/login')
  const [, galaxyId, itemId] = matches
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  const [itemData, invData, locData, catData] = await Promise.all([
    api('GET', `/galaxies/${galaxyId}/items/${itemId}`),
    api('GET', `/galaxies/${galaxyId}`),
    api('GET', `/galaxies/${galaxyId}/locations`),
    api('GET', `/galaxies/${galaxyId}/categories`),
  ])
  if (!itemData) return
  const { item } = itemData

  setBreadcrumb([
    { label: 'Galaxies', href: '/galaxies' },
    { label: invData?.galaxy?.name ?? '', href: `/galaxies/${galaxyId}` },
    { label: 'Items', href: `/galaxies/${galaxyId}/items` },
    { label: item.name, href: `/galaxies/${galaxyId}/items/${itemId}` },
    { label: 'Edit' },
  ])
  const locations = locData?.locations ?? []
  const categories = catData?.categories ?? []

  let cf = {}
  try { cf = JSON.parse(item.custom_fields ?? '{}') } catch {}
  const dim = cf.box_dimensions ?? {}
  const wt = cf.weight ?? {}

  const locById = Object.fromEntries(locations.map(n => [n.id, n]))
  const selectedAncestors = new Set()
  let _cur = locById[item.location_id]
  while (_cur?.parent_id) { selectedAncestors.add(_cur.parent_id); _cur = locById[_cur.parent_id] }

  function buildLocOptions(nodes, parentId = null, depth = 0) {
    return nodes
      .filter(n => (n.parent_id ?? null) === parentId)
      .flatMap(n => {
        const inChain = n.id === item.location_id || selectedAncestors.has(n.id)
        const prefix = inChain ? '▸\u00a0' : '\u00a0\u00a0'
        const label = n.location_type === 'room'
          ? prefix + escapeHTML(n.name)
          : prefix + '\u00a0\u00a0'.repeat(depth) + escapeHTML(n.name)
        return [
          `<option value="${n.id}" ${item.location_id === n.id ? 'selected' : ''}>${label}</option>`,
          ...buildLocOptions(nodes, n.id, depth + 1),
        ]
      })
  }
  const locOptions = `<option value="">— None —</option>` + buildLocOptions(locations).join('')
  const catOptions = `<option value="">— None —</option>` +
    categories.map(c => `<option value="${c.id}" ${item.category_id === c.id ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('')

  const bgDataKeys = ['year_published','min_players','max_players','playing_time_min','min_age','publisher','designer','box_dimensions','weight','bgg_id']
  const hasBgData = bgDataKeys.some(k => cf[k] != null)
  const isBG = item.item_type === 'boardgame' || hasBgData

  setHTML(`
    <div>
      <div class="page-header page-header--sticky">
        <div class="page-header-row">
          <h1 class="page-title">Edit Item</h1>
          <span id="autosave-status" class="autosave-status" aria-live="polite"></span>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <div id="form-error" role="alert"></div>
          <form id="edit-item-form">
            <div class="field">
              <label for="item-name">Name <span aria-hidden="true">*</span></label>
              <input type="text" id="item-name" name="name" required value="${escapeHTML(item.name)}">
            </div>
            <div class="field">
              <label for="item-qty">Quantity</label>
              <quantity-stepper>
                <button type="button" data-action="decrement" aria-label="Decrease">−</button>
                <input type="number" id="item-qty" name="quantity" value="${item.quantity}" min="0" step="1">
                <button type="button" data-action="increment" aria-label="Increase">+</button>
              </quantity-stepper>
            </div>
            <div class="field">
              <label for="item-unit">Unit</label>
              <input type="text" id="item-unit" name="unit" placeholder="e.g. kg, boxes, units" value="${escapeHTML(item.unit ?? '')}">
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
                <option value="physical" ${item.item_type === 'physical' ? 'selected' : ''}>Physical</option>
                <option value="boardgame" ${item.item_type === 'boardgame' ? 'selected' : ''}>🎲 Board Game</option>
                <option value="digital" ${item.item_type === 'digital' ? 'selected' : ''}>Digital</option>
                <option value="subscription" ${item.item_type === 'subscription' ? 'selected' : ''}>Subscription</option>
                <option value="document" ${item.item_type === 'document' ? 'selected' : ''}>Document</option>
              </select>
              <p id="bg-type-hint" class="text-xs text-muted mt-1" ${isBG ? 'hidden' : ''}>Select <strong>Board Game</strong> to enter game-specific details.</p>
            </div>

            <div id="boardgame-fields" ${isBG ? '' : 'hidden'}>
              <div class="field">
                <label for="bg-url">BGG URL</label>
                <input type="url" id="bg-url" name="bg_url" placeholder="https://boardgamegeek.com/boardgame/13/catan" value="${cf.bgg_id ? `https://boardgamegeek.com/boardgame/${cf.bgg_id}` : ''}">
                <span id="bg-id-display" class="text-xs text-muted" ${cf.bgg_id ? '' : 'hidden'}>BGG ID: ${cf.bgg_id ?? ''}</span>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
                <div class="field">
                  <label for="bg-year">Year published</label>
                  <input type="number" id="bg-year" name="bg_year" min="1900" max="2100" placeholder="e.g. 2021" value="${cf.year_published ?? ''}">
                </div>
                <div class="field">
                  <label for="bg-age">Min age</label>
                  <input type="number" id="bg-age" name="bg_min_age" min="0" max="99" placeholder="e.g. 10" value="${cf.min_age ?? ''}">
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-3)">
                <div class="field">
                  <label for="bg-min-players">Min players</label>
                  <input type="number" id="bg-min-players" name="bg_min_players" min="1" placeholder="1" value="${cf.min_players ?? ''}">
                </div>
                <div class="field">
                  <label for="bg-max-players">Max players</label>
                  <input type="number" id="bg-max-players" name="bg_max_players" min="1" placeholder="4" value="${cf.max_players ?? ''}">
                </div>
                <div class="field">
                  <label for="bg-time">Play time (min)</label>
                  <input type="number" id="bg-time" name="bg_playing_time" min="1" placeholder="60" value="${cf.playing_time_min ?? ''}">
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
                <div class="field">
                  <label for="bg-publisher">Publisher</label>
                  <input type="text" id="bg-publisher" name="bg_publisher" placeholder="e.g. Stonemaier Games" value="${escapeHTML(cf.publisher ?? '')}">
                </div>
                <div class="field">
                  <label for="bg-designer">Designer</label>
                  <input type="text" id="bg-designer" name="bg_designer" placeholder="e.g. Jamey Stegmaier" value="${escapeHTML(cf.designer ?? '')}">
                </div>
              </div>
              <div class="field">
                <label>Box dimensions</label>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:var(--space-2);align-items:center">
                  <input type="number" id="bg-dim-l" name="bg_dim_l" min="0" step="any" placeholder="L" value="${dim.l ?? ''}">
                  <input type="number" id="bg-dim-w" name="bg_dim_w" min="0" step="any" placeholder="W" value="${dim.w ?? ''}">
                  <input type="number" id="bg-dim-h" name="bg_dim_h" min="0" step="any" placeholder="H" value="${dim.h ?? ''}">
                  <select id="bg-dim-unit" name="bg_dim_unit" style="width:5rem">
                    <option value="cm" ${(dim.unit ?? 'cm') === 'cm' ? 'selected' : ''}>cm</option>
                    <option value="in" ${dim.unit === 'in' ? 'selected' : ''}>in</option>
                  </select>
                </div>
              </div>
              <div class="field">
                <label for="bg-weight">Weight</label>
                <div style="display:grid;grid-template-columns:1fr auto;gap:var(--space-2);align-items:center">
                  <input type="number" id="bg-weight" name="bg_weight" min="0" step="any" placeholder="0.0" value="${wt.value ?? ''}">
                  <select id="bg-weight-unit" name="bg_weight_unit" style="width:5rem">
                    <option value="kg" ${(wt.unit ?? 'kg') === 'kg' ? 'selected' : ''}>kg</option>
                    <option value="lb" ${wt.unit === 'lb' ? 'selected' : ''}>lb</option>
                    <option value="g"  ${wt.unit === 'g'  ? 'selected' : ''}>g</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="field">
              <label for="item-desc">Description</label>
              <textarea id="item-desc" name="description" rows="2">${escapeHTML(item.description ?? '')}</textarea>
            </div>

            <div id="edit-custom-cards" style="margin-top:var(--space-4)"></div>
            <button type="button" id="btn-add-card" class="btn btn-ghost btn-sm" style="margin-bottom:var(--space-4)">+ Add custom card</button>

            <div class="field">
              <label for="item-disposition">Disposition</label>
              <select id="item-disposition" name="disposition">
                <option value="">— None —</option>
                ${DISPOSITIONS.map(d => `<option value="${d.value}" ${item.disposition === d.value ? 'selected' : ''}>${d.label}</option>`).join('')}
              </select>
            </div>

            <div class="form-actions">
              <a href="/galaxies/${galaxyId}/items/${itemId}" data-link class="btn btn-secondary">← Done</a>
            </div>
          </form>
        </div>
      </div>
    </div>
  `)

  document.getElementById('item-type').addEventListener('change', e => {
    const isBoardGame = e.target.value === 'boardgame'
    document.getElementById('boardgame-fields').hidden = !isBoardGame
    document.getElementById('bg-type-hint').hidden = isBoardGame
  })

  document.getElementById('bg-url').addEventListener('input', e => {
    const id = parseBggId(e.target.value)
    const display = document.getElementById('bg-id-display')
    if (id) { display.textContent = `BGG ID: ${id}`; display.hidden = false }
    else { display.hidden = true }
  })

  // ── Custom cards ─────────────────────────────────────────────────────────
  const editUserCards = (cf._cards ?? []).map(c => ({
    name: c.name ?? '',
    fields: (c.fields ?? []).map(f => ({ label: f.label ?? '', value: f.value ?? '' })),
  }))
  renderCustomCards(editUserCards, 'edit-custom-cards')
  bindCustomCards(editUserCards, 'edit-custom-cards')
  document.getElementById('btn-add-card').addEventListener('click', () => {
    editUserCards.push({ name: '', fields: [{ label: '', value: '' }] })
    renderCustomCards(editUserCards, 'edit-custom-cards')
    const inputs = document.querySelectorAll('.custom-card__name-input')
    inputs[inputs.length - 1]?.focus()
  })

  // ── Auto-save ──────────────────────────────────────────────────────────────
  const statusEl = document.getElementById('autosave-status')
  let fadeTimer = null

  function showSaveStatus(state, msg) {
    clearTimeout(fadeTimer)
    statusEl.className = 'autosave-status autosave-status--' + state
    statusEl.textContent = msg
    if (state === 'saved') {
      fadeTimer = setTimeout(() => {
        statusEl.classList.add('autosave-status--fade')
        setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'autosave-status' }, 350)
      }, 1800)
    }
  }

  function collectFormData() {
    const f = document.getElementById('edit-item-form')
    let customFields = {}
    if (f.item_type.value === 'boardgame') {
      const num = n => { const v = Number(f[n]?.value); return v || undefined }
      const str = n => f[n]?.value.trim() || undefined
      const dimL = num('bg_dim_l'), dimW = num('bg_dim_w'), dimH = num('bg_dim_h')
      customFields = Object.fromEntries(Object.entries({
        bgg_id:           parseBggId(f.bg_url?.value ?? '') ?? undefined,
        year_published:   num('bg_year'),
        min_players:      num('bg_min_players'),
        max_players:      num('bg_max_players'),
        playing_time_min: num('bg_playing_time'),
        min_age:          num('bg_min_age'),
        publisher:        str('bg_publisher'),
        designer:         str('bg_designer'),
        box_dimensions: (dimL || dimW || dimH) ? { l: dimL, w: dimW, h: dimH, unit: str('bg_dim_unit') } : undefined,
        weight:         num('bg_weight') ? { value: num('bg_weight'), unit: str('bg_weight_unit') } : undefined,
      }).filter(([, v]) => v != null))
    }
    const editCards = collectCustomCards(editUserCards)
    if (editCards.length) customFields._cards = editCards
    return {
      name:          f.name.value,
      quantity:      Number(f.quantity.value),
      unit:          f.unit.value || null,
      location_id:   f.location_id?.value || null,
      category_id:   f.category_id?.value || null,
      item_type:     f.item_type.value,
      description:   f.description.value || null,
      custom_fields: customFields,
      disposition:   f.disposition.value || null,
    }
  }

  async function autoSave(triggerEl) {
    const f = document.getElementById('edit-item-form')
    if (!f.name.value.trim()) return
    showSaveStatus('saving', 'Saving…')
    try {
      await api('PATCH', `/galaxies/${galaxyId}/items/${itemId}`, collectFormData())
      showSaveStatus('saved', '✓ Saved')
      const field = triggerEl?.closest('.field')
      if (field) {
        field.classList.add('field--saved-flash')
        setTimeout(() => field.classList.remove('field--saved-flash'), 900)
      }
      document.getElementById('form-error').innerHTML = ''
    } catch (err) {
      showSaveStatus('error', '⚠ Not saved')
      document.getElementById('form-error').innerHTML =
        `<div class="alert alert-error mb-4">${err.message}</div>`
    }
  }

  const editForm = document.getElementById('edit-item-form')
  editForm.addEventListener('submit', e => e.preventDefault())

  // Text inputs + textareas → save on blur
  editForm.querySelectorAll('input[type="text"], input[type="number"], input[type="url"], textarea')
    .forEach(el => el.addEventListener('blur', () => autoSave(el)))

  // Selects → save on change
  editForm.querySelectorAll('select')
    .forEach(el => el.addEventListener('change', () => autoSave(el)))

  // Quantity stepper buttons → save after value update
  editForm.querySelectorAll('quantity-stepper button')
    .forEach(btn => btn.addEventListener('click', () => setTimeout(() => autoSave(btn), 0)))
}

function routeProfile() {
  if (!auth.isLoggedIn) return navigate('/login')
  setBreadcrumb([{ label: 'Profile' }])
  const user = auth.user
  setHTML(`
    <div>
      <div class="page-header">
        <h1 class="page-title">Profile</h1>
      </div>

      <div class="card mb-4">
        <div class="card-body">
          <h2 class="text-sm font-semi text-muted mb-4" style="text-transform:uppercase;letter-spacing:.05em">Avatar</h2>
          <div id="avatar-error" role="alert"></div>
          <div class="avatar-editor">
            <div class="avatar-editor__preview">
              ${user?.avatar_url
                ? `<button class="avatar-editor__preview-btn" id="btn-recrop-avatar" title="Re-crop photo" type="button">
                    <img src="${escapeHTML(user.avatar_url)}" alt="" class="user-avatar user-avatar--lg">
                    <span class="avatar-editor__preview-overlay" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    </span>
                   </button>`
                : `<label class="avatar-editor__preview-btn" title="Upload photo" style="cursor:pointer">
                    <div class="user-avatar user-avatar--lg"><span class="user-avatar__initials">${userInitials(user?.name)}</span></div>
                    <span class="avatar-editor__preview-overlay" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    </span>
                    <input type="file" id="avatar-file-input" accept="image/*" style="display:none">
                   </label>`}
            </div>
            <div class="avatar-editor__actions">
              <label class="btn btn-secondary btn-sm" style="cursor:pointer">
                ${user?.avatar_url ? 'Change photo' : 'Upload photo'}
                <input type="file" id="avatar-file-input-btn" accept="image/*" style="display:none">
              </label>
              ${user?.avatar_url ? `<button class="btn btn-ghost btn-sm" id="btn-remove-avatar">Remove</button>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-body">
          <h2 class="text-sm font-semi text-muted mb-4" style="text-transform:uppercase;letter-spacing:.05em">Account details</h2>
          <div id="profile-success" role="status"></div>
          <div id="profile-error" role="alert"></div>
          <form id="profile-form">
            <div class="field">
              <label for="profile-name">Name</label>
              <input type="text" id="profile-name" name="name" value="${escapeHTML(user?.name ?? '')}" required>
            </div>
            <div class="field">
              <label for="profile-email">Email</label>
              <input type="email" id="profile-email" value="${escapeHTML(user?.email ?? '')}" disabled>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary btn-sm" id="btn-save-profile">Save changes</button>
            </div>
          </form>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-body">
          <h2 class="text-sm font-semi text-muted mb-4" style="text-transform:uppercase;letter-spacing:.05em">Change password</h2>
          <div id="password-success" role="status"></div>
          <div id="password-error" role="alert"></div>
          <form id="password-form">
            <div class="field">
              <label for="current-password">Current password</label>
              <input type="password" id="current-password" name="currentPassword" autocomplete="current-password" required>
            </div>
            <div class="field">
              <label for="new-password">New password</label>
              <input type="password" id="new-password" name="newPassword" autocomplete="new-password" minlength="8" required>
            </div>
            <div class="field">
              <label for="confirm-password">Confirm new password</label>
              <input type="password" id="confirm-password" name="confirmPassword" autocomplete="new-password" minlength="8" required>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary btn-sm" id="btn-save-password">Update password</button>
            </div>
          </form>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-body">
          <h2 class="text-sm font-semi text-muted mb-4" style="text-transform:uppercase;letter-spacing:.05em">Preferences</h2>
          <label class="toggle-row">
            <span class="toggle-row__label">Show galaxy icons</span>
            <input type="checkbox" id="pref-galaxy-icons" class="toggle-checkbox" ${prefs.galaxyIcons ? 'checked' : ''}>
          </label>
          <label class="toggle-row" style="margin-top:var(--space-3)">
            <span class="toggle-row__label">Show location icons</span>
            <input type="checkbox" id="pref-loc-icons" class="toggle-checkbox" ${prefs.locIcons ? 'checked' : ''}>
          </label>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <button class="btn btn-danger btn-sm" id="btn-signout">Sign out</button>
        </div>
      </div>
    </div>
  `)

  async function uploadCroppedAvatar(blob, originalFile = null) {
    const errorEl = document.getElementById('avatar-error')
    if (!errorEl) return
    errorEl.innerHTML = ''
    const formData = new FormData()
    formData.append('avatar', blob, 'avatar.jpg')
    if (originalFile) formData.append('avatar_original', originalFile, 'avatar_original' + originalFile.name.slice(originalFile.name.lastIndexOf('.')))
    try {
      const data = await api('POST', '/auth/avatar', formData)
      if (data) {
        auth.save(data.token, data.user)
        setNav(true)
        routeProfile()
      }
    } catch (err) {
      if (errorEl) errorEl.innerHTML = `<div class="alert alert-error mb-4">${err.message}</div>`
    }
  }

  function handleAvatarFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    openAvatarCropper(file, blob => uploadCroppedAvatar(blob, file))
  }

  document.getElementById('avatar-file-input')?.addEventListener('change', handleAvatarFileChange)
  document.getElementById('avatar-file-input-btn').addEventListener('change', handleAvatarFileChange)

  document.getElementById('btn-recrop-avatar')?.addEventListener('click', () => {
    const sourceUrl = user.avatar_original_url || user.avatar_url
    openAvatarCropper(sourceUrl, blob => uploadCroppedAvatar(blob))
  })

  document.getElementById('btn-remove-avatar')?.addEventListener('click', async () => {
    const errorEl = document.getElementById('avatar-error')
    errorEl.innerHTML = ''
    try {
      const data = await api('DELETE', '/auth/avatar')
      if (data) {
        auth.save(data.token, data.user)
        setNav(true)
        routeProfile()
      }
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-error mb-4">${err.message}</div>`
    }
  })

  document.getElementById('pref-galaxy-icons').addEventListener('change', e => {
    prefs.galaxyIcons = e.target.checked
  })
  document.getElementById('pref-loc-icons').addEventListener('change', e => {
    prefs.locIcons = e.target.checked
  })

  document.getElementById('btn-signout').addEventListener('click', () => {
    auth.clear()
    navigate('/login')
  })

  document.getElementById('profile-form').addEventListener('submit', async e => {
    e.preventDefault()
    const btn = document.getElementById('btn-save-profile')
    const successEl = document.getElementById('profile-success')
    const errorEl = document.getElementById('profile-error')
    successEl.innerHTML = ''
    errorEl.innerHTML = ''
    btn.disabled = true
    btn.textContent = 'Saving…'
    try {
      const data = await api('PATCH', '/auth/profile', {
        name: e.target.name.value,
      })
      if (data) {
        auth.save(data.token, data.user)
        setNav(true)
        successEl.innerHTML = `<div class="alert alert-success mb-4">Name updated.</div>`
        document.getElementById('profile-name').value = data.user.name
      }
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-error mb-4">${err.message}</div>`
    } finally {
      btn.disabled = false
      btn.textContent = 'Save changes'
    }
  })

  document.getElementById('password-form').addEventListener('submit', async e => {
    e.preventDefault()
    const btn = document.getElementById('btn-save-password')
    const successEl = document.getElementById('password-success')
    const errorEl = document.getElementById('password-error')
    successEl.innerHTML = ''
    errorEl.innerHTML = ''

    const newPassword = e.target.newPassword.value
    const confirmPassword = e.target.confirmPassword.value
    if (newPassword !== confirmPassword) {
      errorEl.innerHTML = `<div class="alert alert-error mb-4">Passwords do not match.</div>`
      return
    }

    btn.disabled = true
    btn.textContent = 'Updating…'
    try {
      const data = await api('PATCH', '/auth/profile', {
        currentPassword: e.target.currentPassword.value,
        newPassword,
      })
      if (data) {
        auth.save(data.token, data.user)
        successEl.innerHTML = `<div class="alert alert-success mb-4">Password updated.</div>`
        e.target.reset()
      }
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert-error mb-4">${err.message}</div>`
    } finally {
      btn.disabled = false
      btn.textContent = 'Update password'
    }
  })
}

async function routeInvite(matches) {
  const token = matches[1]
  setHTML('<div class="page-loader"><div class="page-loader__spinner"></div></div>')

  try {
    const data = await api('GET', `/invite/${token}`)
    if (!data) return

    const { galaxy, role, invited_by_name } = data
    const roleLabel = { editor: 'Editor', viewer: 'Viewer' }
    const encodedRedirect = encodeURIComponent(`/invite/${token}`)

    setHTML(`
      <div class="auth-page">
        <div class="auth-card">
          <div class="auth-logo">
            <div class="auth-logo__mark">🌌</div>
            <div class="auth-logo__name">Pocket Universe</div>
          </div>
          <h1 class="auth-title">You're invited!</h1>
          <p class="text-sm text-muted text-center" style="line-height:1.6">
            <strong>${escapeHTML(invited_by_name)}</strong> invited you to join<br>
            <strong>${escapeHTML(galaxy.name)}</strong>
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
          if (res) navigate(`/galaxies/${res.galaxy_id}`)
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
          <div class="auth-logo"><div class="auth-logo__mark">🌌</div></div>
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

function getPathDepth(path) {
  const pathname = path.split('?')[0]
  if (pathname === '/' || /^\/(login|signup|forgot-password|reset-password)/.test(pathname)) return 0
  return pathname.split('/').filter(Boolean).length
}

let _currentDepth = getPathDepth(location.pathname)

function doRender(path, direction) {
  document.documentElement.dataset.navDir = direction
  if (document.startViewTransition) {
    document.startViewTransition(() => render(path))
  } else {
    render(path)
  }
}

export function navigate(path) {
  const newDepth = getPathDepth(path)
  const direction = newDepth >= _currentDepth ? 'forward' : 'backward'
  _currentDepth = newDepth
  history.pushState(null, '', path)
  doRender(path, direction)
}

function render(path) {
  const pathname = path.split('?')[0]
  for (const { pattern, handler } of routes) {
    const m = pathname.match(pattern)
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
  const target = url.pathname + url.search
  // Resolve where the target actually lands (e.g. / → /galaxies when logged in)
  const resolved = (target === '/' && auth.isLoggedIn) ? '/galaxies' : target
  if (resolved === location.pathname + location.search) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  navigate(target)
})

// Browser back/forward
window.addEventListener('popstate', () => {
  const path = location.pathname + location.search
  const newDepth = getPathDepth(path)
  const direction = newDepth >= _currentDepth ? 'forward' : 'backward'
  _currentDepth = newDepth
  doRender(path, direction)
})

// ─── Add Item modal ───────────────────────────────────────────────────────────

function openAddItemModal(galaxyId, locationId = '') {
  const overlay = document.createElement('div')
  overlay.className = 'aim-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Add item')

  let aimStream = null
  let aimScanRaf = null

  function stopAimCamera() {
    if (aimScanRaf) { cancelAnimationFrame(aimScanRaf); aimScanRaf = null }
    if (aimStream) { aimStream.getTracks().forEach(t => t.stop()); aimStream = null }
  }

  function closeModal() {
    stopAimCamera()
    document.removeEventListener('keydown', onKey)
    overlay.remove()
  }

  function onKey(e) { if (e.key === 'Escape') closeModal() }
  document.addEventListener('keydown', onKey)

  function buildFormUrl(extra = {}) {
    const p = new URLSearchParams()
    if (locationId) p.set('location', locationId)
    for (const [k, v] of Object.entries(extra)) p.set(k, v)
    return `/galaxies/${galaxyId}/items/new?${p}`
  }

  function renderMethods() {
    overlay.innerHTML = `
      <div class="aim-modal">
        <div class="aim-header">
          <h2 class="aim-title">Add Item</h2>
          <button class="aim-close" aria-label="Close">×</button>
        </div>
        <div class="aim-methods">
          <button class="aim-method" data-method="photo">
            <span class="aim-method__icon">📷</span>
            <span class="aim-method__label">Take Photo</span>
            <span class="aim-method__desc">Capture the object with your camera</span>
          </button>
          <button class="aim-method" data-method="scan">
            <span class="aim-method__icon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="7" y2="12.01"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="17" y1="12" x2="17" y2="12.01"/></svg>
            </span>
            <span class="aim-method__label">Scan Barcode</span>
            <span class="aim-method__desc">Point your camera at a barcode</span>
          </button>
          <button class="aim-method" data-method="type">
            <span class="aim-method__icon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10h2m2 0h4M8 14h4"/></svg>
            </span>
            <span class="aim-method__label">Type Barcode</span>
            <span class="aim-method__desc">Enter a UPC or barcode number</span>
          </button>
          <button class="aim-method" data-method="manual">
            <span class="aim-method__icon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </span>
            <span class="aim-method__label">Manual Entry</span>
            <span class="aim-method__desc">Fill in item details yourself</span>
          </button>
        </div>
      </div>
    `
    overlay.querySelector('.aim-close').addEventListener('click', closeModal)
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal() })
    overlay.querySelectorAll('.aim-method').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = btn.dataset.method
        if (m === 'manual') { closeModal(); navigate(buildFormUrl()) }
        else if (m === 'type') renderTypeBarcode()
        else if (m === 'scan') renderScanBarcode()
        else if (m === 'photo') renderPhotoCapture()
      })
    })
  }

  function backBtn() {
    return `<button class="aim-back" aria-label="Back to methods">←</button>`
  }

  function bindBack() {
    overlay.querySelector('.aim-back')?.addEventListener('click', () => {
      stopAimCamera()
      renderMethods()
    })
  }

  function renderTypeBarcode() {
    overlay.querySelector('.aim-modal').innerHTML = `
      <div class="aim-header">
        ${backBtn()}
        <h2 class="aim-title">Type Barcode</h2>
        <button class="aim-close" aria-label="Close">×</button>
      </div>
      <div class="aim-body">
        <p class="aim-hint">Enter the barcode number to look up the product automatically.</p>
        <div class="aim-barcode-row">
          <input type="text" id="aim-bc-input" inputmode="numeric" placeholder="e.g. 012345678901" autocomplete="off" class="aim-input">
          <button class="btn btn-primary" id="aim-bc-lookup">Look up</button>
        </div>
        <div id="aim-bc-status" class="aim-status"></div>
        <button class="btn btn-primary aim-proceed-btn" id="aim-proceed" hidden>Continue to form →</button>
      </div>
    `
    overlay.querySelector('.aim-close').addEventListener('click', closeModal)
    bindBack()

    const input = overlay.querySelector('#aim-bc-input')
    const statusEl = overlay.querySelector('#aim-bc-status')
    const proceedBtn = overlay.querySelector('#aim-proceed')
    let resolvedBarcode = ''

    async function doLookup() {
      const upc = input.value.trim()
      if (!upc) return
      statusEl.textContent = 'Looking up…'
      statusEl.className = 'aim-status'
      try {
        const data = await api('GET', `/barcode/${upc}`)
        resolvedBarcode = upc
        statusEl.textContent = data?.name ? `✓ Found: ${data.name}` : '✓ Product found'
        statusEl.className = 'aim-status aim-status--ok'
      } catch (err) {
        statusEl.textContent = `Not found — you can still continue and fill in details manually`
        statusEl.className = 'aim-status aim-status--warn'
        resolvedBarcode = upc
      }
      proceedBtn.hidden = false
    }

    overlay.querySelector('#aim-bc-lookup').addEventListener('click', doLookup)
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doLookup() } })
    proceedBtn.addEventListener('click', () => {
      closeModal()
      navigate(buildFormUrl(resolvedBarcode ? { barcode: resolvedBarcode } : {}))
    })
    setTimeout(() => input.focus(), 50)
  }

  async function renderScanBarcode() {
    if (!('BarcodeDetector' in window)) {
      renderTypeBarcode()
      return
    }
    overlay.querySelector('.aim-modal').innerHTML = `
      <div class="aim-header">
        ${backBtn()}
        <h2 class="aim-title">Scan Barcode</h2>
        <button class="aim-close" aria-label="Close">×</button>
      </div>
      <div class="aim-body aim-body--camera">
        <video id="aim-scan-video" autoplay playsinline muted class="aim-camera-feed"></video>
        <div class="aim-scan-overlay" aria-hidden="true">
          <div class="aim-scan-frame"></div>
        </div>
        <p id="aim-scan-status" class="aim-camera-status">Starting camera…</p>
      </div>
    `
    overlay.querySelector('.aim-close').addEventListener('click', closeModal)
    bindBack()

    const video = overlay.querySelector('#aim-scan-video')
    const statusEl = overlay.querySelector('#aim-scan-status')

    try {
      aimStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      video.srcObject = aimStream
      statusEl.textContent = 'Point at a barcode…'
      const detector = new BarcodeDetector({
        formats: ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39', 'itf', 'codabar'],
      })
      async function tick() {
        if (!aimStream) return
        try {
          const results = await detector.detect(video)
          if (results.length) {
            stopAimCamera()
            const upc = results[0].rawValue
            closeModal()
            navigate(buildFormUrl({ barcode: upc }))
            return
          }
        } catch {}
        aimScanRaf = requestAnimationFrame(tick)
      }
      aimScanRaf = requestAnimationFrame(tick)
    } catch {
      statusEl.textContent = 'Camera access denied — try typing the barcode instead.'
    }
  }

  async function renderPhotoCapture() {
    overlay.querySelector('.aim-modal').innerHTML = `
      <div class="aim-header">
        ${backBtn()}
        <h2 class="aim-title">Take Photo</h2>
        <button class="aim-close" aria-label="Close">×</button>
      </div>
      <div class="aim-body aim-body--camera">
        <video id="aim-photo-video" autoplay playsinline muted class="aim-camera-feed"></video>
        <canvas id="aim-photo-canvas" style="display:none"></canvas>
        <p id="aim-photo-status" class="aim-camera-status">Starting camera…</p>
        <button class="aim-capture-btn" id="aim-capture-btn" disabled aria-label="Capture photo">
          <span class="aim-capture-btn__ring"></span>
        </button>
      </div>
      <div class="aim-photo-fallback">
        <label class="aim-photo-fallback__btn">
          Or choose from library
          <input type="file" id="aim-photo-file" accept="image/*" style="display:none">
        </label>
      </div>
    `
    overlay.querySelector('.aim-close').addEventListener('click', closeModal)
    bindBack()

    const video = overlay.querySelector('#aim-photo-video')
    const canvas = overlay.querySelector('#aim-photo-canvas')
    const statusEl = overlay.querySelector('#aim-photo-status')
    const captureBtn = overlay.querySelector('#aim-capture-btn')

    overlay.querySelector('#aim-photo-file').addEventListener('change', e => {
      const file = e.target.files?.[0]
      if (file) {
        window.pendingItemPhoto = file
        closeModal()
        navigate(buildFormUrl())
      }
    })

    try {
      aimStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      video.srcObject = aimStream
      statusEl.textContent = 'Frame the object and tap the button'
      captureBtn.disabled = false
    } catch {
      statusEl.textContent = 'Camera unavailable — use the library option below.'
      return
    }

    captureBtn.addEventListener('click', () => {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d').drawImage(video, 0, 0)
      stopAimCamera()
      canvas.toBlob(blob => {
        if (blob) window.pendingItemPhoto = new File([blob], 'photo.jpg', { type: 'image/jpeg' })
        closeModal()
        navigate(buildFormUrl())
      }, 'image/jpeg', 0.92)
    })
  }

  renderMethods()
  document.body.appendChild(overlay)
  requestAnimationFrame(() => overlay.classList.add('aim-overlay--open'))
}

// ─── Confirm delete modal ─────────────────────────────────────────────────────

function confirmDelete(title, body = '') {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'delete-modal-overlay'
    overlay.innerHTML = `
      <div class="delete-modal" role="dialog" aria-modal="true" aria-labelledby="dm-title">
        <h3 class="delete-modal__title" id="dm-title">${escapeHTML(title)}</h3>
        ${body ? `<p class="delete-modal__body">${escapeHTML(body)}</p>` : ''}
        <div class="delete-modal__actions">
          <button class="btn btn-secondary" id="dm-cancel">Cancel</button>
          <button class="btn btn-danger"    id="dm-confirm">Delete</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)

    const close = result => {
      document.removeEventListener('keydown', onKey)
      overlay.remove()
      resolve(result)
    }

    overlay.querySelector('#dm-cancel').addEventListener('click', () => close(false))
    overlay.querySelector('#dm-confirm').addEventListener('click', () => close(true))
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false) })
    overlay.querySelector('#dm-cancel').focus()

    function onKey(e) {
      if (e.key === 'Escape') close(false)
    }
    document.addEventListener('keydown', onKey)
  })
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function galaxyIcon(name) {
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

// ─── Custom cards UI ──────────────────────────────────────────────────────────

function renderCustomCards(cards, containerId) {
  const container = document.getElementById(containerId)
  if (!container) return
  container.innerHTML = cards.map((card, ci) => `
    <div class="custom-card" data-card-index="${ci}">
      <div class="custom-card__header">
        <input type="text" class="custom-card__name-input" placeholder="Card title…" value="${escapeHTML(card.name)}" aria-label="Card title">
        <button type="button" class="btn btn-ghost btn-sm custom-card__remove" data-card="${ci}" aria-label="Remove card">✕</button>
      </div>
      <div class="custom-card__fields">
        ${card.fields.map((f, fi) => `
          <div class="custom-card__field-row" data-field-index="${fi}">
            <input type="text" class="custom-card__field-label" placeholder="Label" value="${escapeHTML(f.label)}" aria-label="Field label">
            <input type="text" class="custom-card__field-value" placeholder="Value" value="${escapeHTML(f.value)}" aria-label="Field value">
            <button type="button" class="btn btn-ghost btn-sm custom-card__field-remove" data-card="${ci}" data-field="${fi}" aria-label="Remove field">✕</button>
          </div>
        `).join('')}
      </div>
      <button type="button" class="btn btn-ghost btn-sm custom-card__add-field" data-card="${ci}">+ Add field</button>
    </div>
  `).join('')
}

function bindCustomCards(cards, containerId) {
  const container = document.getElementById(containerId)
  if (!container) return

  container.addEventListener('input', e => {
    const row = e.target.closest('[data-card-index]')
    if (!row) return
    const ci = Number(row.dataset.cardIndex)
    if (e.target.classList.contains('custom-card__name-input')) {
      cards[ci].name = e.target.value
    } else if (e.target.classList.contains('custom-card__field-label')) {
      const fi = Number(e.target.closest('[data-field-index]').dataset.fieldIndex)
      cards[ci].fields[fi].label = e.target.value
    } else if (e.target.classList.contains('custom-card__field-value')) {
      const fi = Number(e.target.closest('[data-field-index]').dataset.fieldIndex)
      cards[ci].fields[fi].value = e.target.value
    }
  })

  container.addEventListener('click', e => {
    const removeCard = e.target.closest('.custom-card__remove')
    if (removeCard) {
      cards.splice(Number(removeCard.dataset.card), 1)
      renderCustomCards(cards, containerId)
      return
    }
    const addField = e.target.closest('.custom-card__add-field')
    if (addField) {
      cards[Number(addField.dataset.card)].fields.push({ label: '', value: '' })
      renderCustomCards(cards, containerId)
      const newInputs = container.querySelectorAll('.custom-card__field-label')
      newInputs[newInputs.length - 1]?.focus()
      return
    }
    const removeField = e.target.closest('.custom-card__field-remove')
    if (removeField) {
      cards[Number(removeField.dataset.card)].fields.splice(Number(removeField.dataset.field), 1)
      renderCustomCards(cards, containerId)
    }
  })
}

function collectCustomCards(cards) {
  return cards
    .map(c => ({ name: c.name.trim(), fields: c.fields.filter(f => f.label.trim() || f.value.trim()) }))
    .filter(c => c.name || c.fields.length)
}

function parseBggId(url) {
  const m = String(url).match(/boardgamegeek\.com\/boardgame\/(\d+)/i)
  return m ? m[1] : null
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

// ─── Theme picker ─────────────────────────────────────────────────────────────

function initThemePicker() {
  const saved = localStorage.getItem('pu_theme') || 'space'
  applyTheme(saved)

  const btn   = document.getElementById('theme-picker-btn')
  const panel = document.getElementById('theme-panel')
  if (!btn || !panel) return

  btn.addEventListener('click', e => {
    e.stopPropagation()
    panel.hidden = !panel.hidden
  })

  panel.addEventListener('click', e => {
    const swatch = e.target.closest('[data-theme-pick]')
    if (!swatch) return
    const theme = swatch.dataset.themePick
    applyTheme(theme)
    localStorage.setItem('pu_theme', theme)
    panel.hidden = true
  })

  document.addEventListener('click', () => { panel.hidden = true })
}

function applyTheme(theme) {
  const html = document.documentElement
  if (theme === 'space') {
    delete html.dataset.theme
  } else {
    html.dataset.theme = theme
  }
  // Mark active swatch
  document.querySelectorAll('[data-theme-pick]').forEach(s => {
    s.setAttribute('aria-current', s.dataset.themePick === theme ? 'true' : 'false')
  })
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
initThemePicker()
initWelcomeCanvas()
render(location.pathname)

// Track sticky-nav height so page-header--sticky can sit flush below it
new ResizeObserver(([entry]) => {
  document.documentElement.style.setProperty('--sticky-nav-height', entry.contentRect.height + 'px')
}).observe(document.querySelector('.sticky-nav'))

// Expose globals for inline onclick handlers in dynamically rendered HTML
window.navigate = navigate
window.openAddItemModal = openAddItemModal
