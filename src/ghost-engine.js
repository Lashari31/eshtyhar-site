import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

/**
 * GHOST ANIMATION ENGINE
 * ---------------------------------------------------------------------------
 * A FLIP-style scroll morph.
 *
 * The REAL element lives in the fixed navbar (small, final state).
 * The GHOST is an invisible placeholder in the hero (large, start state).
 *
 * On init we measure both, then gsap.fromTo() the real element FROM the ghost's
 * geometry back TO its own natural position, scrubbed against scroll.
 *
 * Reading it backwards like this means the element always lands pixel-perfect in
 * the navbar, because its end state is simply "no transform".
 *
 * Pairing is declarative:
 *   <a class="nav-logo" data-ghost="logo" data-ghost-type="text">NESH</a>
 *   <div data-ghost-target="logo">NESH</div>
 *
 * Scroll range is configured on any ancestor carrying data-flip-start:
 *   <section class="hero" data-flip-start="top top" data-flip-end="900px top">
 * ---------------------------------------------------------------------------
 */

const MOBILE_BREAKPOINT = 768
const RESIZE_DEBOUNCE = 150

export const GhostEngine = {
  initialized: false,
  tweens: [],
  resizeTimer: null,
  boundResize: null,

  init() {
    // Heavy morph is desktop-only. Phones get the static navbar, no work done.
    if (window.innerWidth < MOBILE_BREAKPOINT) return
    if (this.initialized) return

    this.createAll()
    this.initialized = true

    this.boundResize = this.onResize.bind(this)
    window.addEventListener('resize', this.boundResize)
  },

  onResize() {
    clearTimeout(this.resizeTimer)
    this.resizeTimer = setTimeout(() => {
      if (window.innerWidth < MOBILE_BREAKPOINT) {
        this.destroy()
        return
      }
      this.rebuild()
    }, RESIZE_DEBOUNCE)
  },

  destroy() {
    this.tweens.forEach((t) => {
      if (t.scrollTrigger) t.scrollTrigger.kill()
      t.kill()
    })
    this.tweens = []

    this.collectPairs().forEach(({ real, wrapper }) => {
      gsap.set(real, { clearProps: 'all' })
      if (wrapper) gsap.set(wrapper, { clearProps: 'width,height,position,minHeight' })
    })

    this.initialized = false
  },

  rebuild() {
    this.destroy()
    // Two frames: let the browser settle layout after clearProps before we measure.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.createAll()
        this.initialized = true
        ScrollTrigger.refresh()
      })
    })
  },

  collectPairs() {
    const pairs = []

    document.querySelectorAll('[data-ghost]').forEach((real) => {
      const key = real.getAttribute('data-ghost')
      const ghost = document.querySelector(`[data-ghost-target="${key}"]`)

      if (!ghost) {
        console.warn(`[GhostEngine] no ghost found for "${key}"`)
        return
      }

      const type = real.dataset.ghostType || 'link'
      // Box morphs resize the element, so its slot in the nav must be locked
      // or the siblings reflow on every scroll tick.
      const wrapper = type === 'box' ? real.parentElement : null

      pairs.push({ real, ghost, type, key, wrapper })
    })

    return pairs
  },

  getSettings(real) {
    const cfg =
      real.closest('[data-flip-start]') ||
      document.querySelector('[data-flip-start]') ||
      document.querySelector('.hero')

    return {
      trigger: cfg?.dataset.flipTrigger || '.hero',
      start: cfg?.dataset.flipStart || 'top top',
      end: cfg?.dataset.flipEnd || '900px top',
    }
  },

  /**
   * PHASE 1 — pure reads. No style mutations in here, ever.
   * Batching every getBoundingClientRect() before any write is what keeps this
   * from thrashing layout. Interleaving the two is the #1 cause of scroll jank.
   */
  measurePair({ real, ghost, type, wrapper }) {
    if (!real || !ghost) return null

    const rRect = real.getBoundingClientRect()
    const gRect = ghost.getBoundingClientRect()

    const m = {
      real,
      ghost,
      type,
      wrapper,
      rRect,
      gRect,
      settings: this.getSettings(real),
    }

    // The navbar is position:fixed, so its rect is scroll-independent.
    // The ghost scrolls with the page, so normalise it back to document space.
    m.xDiff = Math.round(gRect.left - rRect.left)
    m.yDiff = Math.round(gRect.top + window.scrollY - rRect.top)

    if (type === 'text') {
      m.realFontSize = parseFloat(getComputedStyle(real).fontSize)
      m.ghostFontSize = parseFloat(getComputedStyle(ghost).fontSize)
    }

    if (type === 'box') {
      const rs = getComputedStyle(real)
      const gs = getComputedStyle(ghost)
      m.realRadius = parseFloat(rs.borderRadius) || 0
      m.ghostRadius = parseFloat(gs.borderRadius) || 0
      if (wrapper) m.wrapperRect = wrapper.getBoundingClientRect()
    }

    return m
  },

  /**
   * PHASE 2 — pure writes, using only pre-measured numbers.
   */
  applyAnimation(m) {
    if (!m) return

    const { real, type, settings, rRect, xDiff, yDiff, wrapper } = m

    const from = { x: xDiff, y: yDiff, force3D: true }
    const to = {
      x: 0,
      y: 0,
      force3D: true,
      ease: 'power1.inOut',
      scrollTrigger: {
        trigger: settings.trigger,
        start: settings.start,
        end: settings.end,
        scrub: 1,
      },
    }

    if (type === 'text') {
      from.fontSize = m.ghostFontSize + 'px'
      to.fontSize = m.realFontSize + 'px'
      from.transformOrigin = 'left top'
    }

    if (type === 'box') {
      // Freeze the wrapper at its natural size so the growing child can't push
      // the rest of the navbar around, then take the child out of flow.
      if (wrapper && m.wrapperRect) {
        wrapper.style.position = 'relative'
        wrapper.style.width = m.wrapperRect.width + 'px'
        wrapper.style.height = m.wrapperRect.height + 'px'
        real.style.position = 'absolute'
        real.style.top = '0px'
        real.style.left = '0px'
      }

      from.width = m.gRect.width + 'px'
      from.height = m.gRect.height + 'px'
      from.borderRadius = m.ghostRadius + 'px'

      to.width = rRect.width + 'px'
      to.height = rRect.height + 'px'
      to.borderRadius = m.realRadius + 'px'

      from.transformOrigin = 'left top'
    }

    this.tweens.push(gsap.fromTo(real, from, to))
  },

  createAll() {
    const pairs = this.collectPairs()
    if (!pairs.length) return

    // Clear any leftover transforms so we measure a clean DOM.
    pairs.forEach(({ real }) => gsap.set(real, { clearProps: 'all' }))

    // ---- Phase 1: measure everything ----
    const measurements = pairs.map((p) => this.measurePair(p))

    // ---- Phase 2: write everything ----
    measurements.forEach((m) => this.applyAnimation(m))
  },
}
