import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import SplitText from 'gsap/SplitText'
import Lenis from 'lenis'
import Swiper from 'swiper'
import { Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'

gsap.registerPlugin(ScrollTrigger, SplitText)

/* --------------------------------------------------------------------------
   LENIS + GSAP TICKER SYNC — one RAF loop drives both.
   duration 0.4 / lerp 0.1 mirrors the reference: snappy, not syrupy.
-------------------------------------------------------------------------- */
const lenis = new Lenis({
  duration: 0.4,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
  lerp: 0.1,
})
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((time) => lenis.raf(time * 1000))
gsap.ticker.lagSmoothing(0)

/* --------------------------------------------------------------------------
   HERO SCROLL TIMELINE — the signature move.
   The hero pins for one viewport height. As you scroll through the pin:
     - the portrait scales up, BLURS, and fades back
     - the giant wordmark shrinks and drifts toward the top-left
     - all hero UI (nav, cards, tag, blurb) fades and lifts away
     - the headline settles up and out
     - the fixed topbar fades in to take over
   Everything is scrubbed to scroll position, so it's reversible and physical.
-------------------------------------------------------------------------- */
function initHeroTimeline() {
  const bar = document.querySelector('[data-sidebar]')

  // Phones: no pin, no morph. Show the sidebar menu statically.
  if (window.innerWidth < 768) {
    gsap.set('[data-side], [data-side-fade], [data-logo]', { opacity: 1, x: 0, y: 0 })
    if (bar) bar.style.pointerEvents = 'auto'
    return
  }

  if (bar) bar.style.pointerEvents = 'none'

  // Sidebar bits that just FADE in to RECEIVE the incoming flights. The CTA is
  // excluded (it flies in), and the top block (socials/blurb/stats) is split out
  // so it can wait for the shrinking wordmark to clear its space.
  const topRecv = [...document.querySelectorAll('.side-top [data-side-fade]')]
  const lowRecv = [...document.querySelectorAll('[data-side-fade]')]
    .filter((el) => !el.closest('.side-top') && !el.matches('.side-cta'))
  gsap.set([...topRecv, ...lowRecv], { opacity: 0 })
  gsap.set('[data-logo]', { opacity: 0 })   // logo comes in LATE, after the wordmark wipe

  // --- FLIP measures (before the pin exists) --------------------------------
  // PILLS fly from their hero nav link INTO the rail: each starts sitting ON its
  // matching link, then travels the whole way to its slot, staying fully visible —
  // you literally watch the nav fly into the menu.
  const pillFly = [...document.querySelectorAll('[data-side]')]
    .map((pill) => {
      const link = document.querySelector(`[data-link-id="${pill.dataset.side}"]`)
      if (!link) return null
      const p = pill.getBoundingClientRect()
      const h = link.getBoundingClientRect()
      return { pill, dx: Math.round(h.left - p.left), dy: Math.round(h.top - p.top) }
    })
    .filter(Boolean)
  pillFly.forEach((m) => gsap.set(m.pill, { x: m.dx, y: m.dy, opacity: 0 }))

  // STAT CARDS fly the whole way from the hero to their stat slot, shrinking as
  // they go, and dissolve only at the very end onto the real stat box.
  const cardFly = [...document.querySelectorAll('[data-morph-src]')]
    .filter((src) => src.dataset.morphSrc !== 'cta')
    .map((src) => {
      const dst = document.querySelector(`[data-morph-dst="${src.dataset.morphSrc}"]`)
      if (!dst) return null
      const s = src.getBoundingClientRect()
      const d = dst.getBoundingClientRect()
      return { src, dx: Math.round(d.left - s.left), dy: Math.round(d.top - s.top), scale: d.width / s.width }
    })
    .filter(Boolean)

  // CTA: the REAL hero "Book a Call" itself flies to the rail (so it reads as ONE
  // button moving, not a copy that appears while the original stays), GROWING into
  // the full-width slot, then dissolves onto the real sidebar button at the very
  // end. Because the actual element flies, the headline must lift WITHOUT dragging
  // it — so below we lift the headline + About Me individually, not hero-center.
  const ctaSrc = document.querySelector('[data-morph-src="cta"]')
  const ctaDst = document.querySelector('[data-morph-dst="cta"]')
  const heroAlt = document.querySelector('.hero-ctas a:not([data-morph-src])')  // "About Me"
  let ctaFly = null
  if (ctaSrc && ctaDst) {
    const s = ctaSrc.getBoundingClientRect()
    const d = ctaDst.getBoundingClientRect()
    ctaFly = { src: ctaSrc, dst: ctaDst, dx: Math.round(d.left - s.left), dy: Math.round(d.top - s.top), scale: d.width / s.width }
    gsap.set(ctaDst, { opacity: 0 })
  }

  // Wordmark → sidebar-logo FLIP: measure the ACTUAL logo glyph and land the
  // giant wordmark exactly on it (same size + position), so it morphs INTO the
  // logo instead of shrinking to an arbitrary offset spot next to it.
  const wmEl = document.querySelector('[data-wordmark]')
  const logoTarget = document.querySelector('.sidebar-logo .wm-mark')
  let wmFlip = { scale: 7 / 94.44, dx: 0, dy: 0 }
  if (wmEl && logoTarget) {
    const w = wmEl.getBoundingClientRect()
    const l = logoTarget.getBoundingClientRect()
    wmFlip = { scale: l.width / w.width, dx: l.left - w.left, dy: l.top - w.top }
  }

  // --- Timeline -------------------------------------------------------------
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '[data-hero]',
      start: 'top top',
      end: '+=95%',            // tighter pin — less dead scroll on the blurred hold
      pin: '[data-hero]',
      pinSpacing: true,
      scrub: 1,
      refreshPriority: 2,
    },
  })

  // Portrait blur 0→80px, opacity 1→0.42 — stays a touch more present so the mid
  // transition never reads as a fully blank screen.
  // Wordmark shrinks into the top-left corner (scale 7vw / 94.44vw) to BECOME the
  // sidebar logo — it travels there rather than fading in place.
  tl.to('[data-portrait]', { scale: 1.1, '--blur': '80px', opacity: 0.42, ease: 'power1.in' }, 0)
    // 1) the yellow NESH shrinks + travels into the top-left logo slot (stays yellow)
    .to('[data-wordmark]', { x: wmFlip.dx, y: wmFlip.dy, scale: wmFlip.scale, ease: 'power2.inOut', duration: 0.5 }, 0)
    // 2) ONE scroll more: a diagonal gradient wipe switches it yellow → black
    //    (both stops move together so their order never inverts)
    .to('.wordmark .wm-mark', { backgroundColor: '#111', ease: 'power1.inOut', duration: 0.18 }, 0.52)
    // 3) the yellow logo box + real logo fade in AFTER the wipe, then the wordmark
    //    hands off (no black logo shows while the wordmark is still yellow)
    .to('[data-logo]', { opacity: 1, ease: 'power1.out', duration: 0.16 }, 0.64)
    .to('[data-wordmark]', { opacity: 0, ease: 'power1.in', duration: 0.12 }, 0.72)
    // The originals hand off to their flying counterparts: the hero nav vanishes
    // FAST (its pills take over the flight → no double text), traits/tag/blurb fade
    // + lift, and the headline lifts away.
    .to('[data-hero-nav]', { opacity: 0, ease: 'power1.out', duration: 0.14 }, 0.05)
    .to('[data-hero-ui]', { opacity: 0, y: -26, ease: 'power1.out', duration: 0.4, stagger: 0.03 }, 0.08)
    // Lift the headline + About Me INDIVIDUALLY (not the hero-center wrapper), so
    // the wrapper's transform can't drag the Book a Call button that flies below.
    .to('.headline', { opacity: 0, y: -60, ease: 'power1.in', duration: 0.5 }, 0.18)

  // PILLS fly nav → rail, fully visible the whole way — the nav literally flies in.
  pillFly.forEach((m) => {
    tl.to(m.pill, { opacity: 1, ease: 'power1.out', duration: 0.1 }, 0.05)
    tl.to(m.pill, { x: 0, y: 0, ease: 'power2.inOut', duration: 0.62 }, 0.06)
  })

  // STAT CARDS fly the whole way across into their slot, then dissolve at the end
  // as the real stat box fades in to catch them.
  cardFly.forEach((m) => {
    tl.to(m.src, { x: m.dx, y: m.dy, scale: m.scale, ease: 'power2.inOut', duration: 0.5, transformOrigin: 'left top' }, 0.05)
      .to(m.src, { opacity: 0, ease: 'power1.in', duration: 0.14 }, 0.46)
  })

  // About Me lifts away with the headline (it has no rail counterpart).
  if (heroAlt) tl.to(heroAlt, { opacity: 0, y: -40, ease: 'power1.in', duration: 0.4 }, 0.18)

  // The REAL hero button flies to the rail and grows into the slot — one solid,
  // continuous move — then dissolves onto the real sidebar button (same size at the
  // crossfade, so there's no text-size pop and no pale ghost).
  if (ctaFly) {
    tl.to(ctaFly.src, { x: ctaFly.dx, y: ctaFly.dy, scale: ctaFly.scale, transformOrigin: 'left top', ease: 'power2.inOut', duration: 0.5 }, 0.12)
      .to(ctaFly.src, { opacity: 0, duration: 0.1, ease: 'power1.in' }, 0.52)
      .to(ctaFly.dst, { opacity: 1, duration: 0.12, ease: 'power1.out' }, 0.5)
  }

  // Receivers fade in: the lower rail early; the top block (socials/blurb/stats)
  // only once the wordmark has shrunk out of its space and the cards have landed.
  tl.to(lowRecv, {
    opacity: 1, ease: 'power2.out', duration: 0.45, stagger: 0.05,
    onStart: () => { if (bar) bar.style.pointerEvents = 'auto' },
    onReverseComplete: () => { if (bar) bar.style.pointerEvents = 'none' },
  }, 0.3)
    .to(topRecv, { opacity: 1, ease: 'power2.out', duration: 0.4, stagger: 0.05 }, 0.5)
}

/* --------------------------------------------------------------------------
   SECTION REVEALS — [data-reveal] elements rise + fade in on enter.
   Grouped per parent so siblings stagger together (expo.out, like the ref).
-------------------------------------------------------------------------- */
const HEADING_SEL = '.section-h, .contact-h, .cta-band-h'

function initReveals() {
  const groups = new Map()
  document.querySelectorAll('[data-reveal]').forEach((el) => {
    if (el.matches(HEADING_SEL)) return // headings get their own word-rise
    const key = el.closest('section, footer') || document.body
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(el)
  })
  groups.forEach((els) => {
    gsap.set(els, { y: 40, opacity: 0 })
    ScrollTrigger.create({
      trigger: els[0],
      start: 'top 82%',
      once: true,
      onEnter: () => gsap.to(els, {
        y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'expo.out',
      }),
    })
  })
}

/* Every section heading rises word-by-word from behind a mask */
function initHeadingReveal() {
  document.querySelectorAll(HEADING_SEL).forEach((h) => {
    const split = new SplitText(h, { type: 'lines,words', linesClass: 'rv-line' })
    gsap.set(h, { opacity: 1 })
    gsap.from(split.words, {
      yPercent: 118, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.055,
      scrollTrigger: { trigger: h, start: 'top 88%', once: true },
    })
  })
}

/* --------------------------------------------------------------------------
   TIMELINE — serpentine curve threaded through the alternating cards.
   The path is built in JS from each card's dot, then drawn on scroll.
-------------------------------------------------------------------------- */
function buildTimelinePath() {
  const box = document.querySelector('[data-timeline]')
  const svg = document.querySelector('[data-tl-curve]')
  const path = document.querySelector('[data-tl-path]')
  if (!box || !svg || !path) return null

  const b = box.getBoundingClientRect()
  svg.setAttribute('viewBox', `0 0 ${b.width} ${b.height}`)

  // dot centres, in container space
  const pts = [...box.querySelectorAll('.tl-dot')].map((d) => {
    const r = d.getBoundingClientRect()
    return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 }
  })
  if (pts.length < 2) return null

  // Catmull-Rom spline through every dot → one flowing, organic curve (not a
  // uniform per-segment S, which reads as a mechanical zig-zag). A low divisor
  // gives bigger tangents = broader, more abstract bends.
  const F = 3.2   // smaller = broader/loopier, larger = tighter
  const segs = [`M ${pts[0].x} ${pts[0].y}`]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1.x + (p2.x - p0.x) / F
    const c1y = p1.y + (p2.y - p0.y) / F
    const c2x = p2.x - (p3.x - p1.x) / F
    const c2y = p2.y - (p3.y - p1.y) / F
    segs.push(` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`)
  }
  const full = segs.join('')
  path.setAttribute('d', full)

  // Cumulative path length AT each dot, so the draw can stop exactly on a dot
  // (never floating in the gap). lengths[i] = length from start to dot i.
  const lengths = [0]
  let acc = segs[0]
  for (let i = 1; i < segs.length; i++) {
    acc += segs[i]
    path.setAttribute('d', acc)
    lengths.push(path.getTotalLength())
  }
  path.setAttribute('d', full)
  path._dotLengths = lengths
  path._totalLen = lengths[lengths.length - 1]
  return path
}

function initTimeline() {
  let path = buildTimelinePath()
  if (!path) return

  // The line grows WITH YOU, but stops exactly on each dot instead of overshooting
  // into the empty gap: as each card enters, we animate the stroke to reach that
  // card's dot. So it always ends on a dot, never floating mid-air.
  let total = path._totalLen
  path.style.strokeDasharray = total
  path.style.strokeDashoffset = total   // nothing drawn yet
  let current = 0   // dot index the line is currently drawn to

  // Animate the stroke so it ends exactly on dot `n` (n < 0 → nothing drawn).
  // Used both ways: growing to a dot on scroll-down, retracting on scroll-up.
  const drawTo = (n, dur, ease) => {
    current = Math.max(0, n)
    gsap.to(path, {
      strokeDashoffset: n < 0 ? total : Math.max(0, total - path._dotLengths[current]),
      duration: dur, ease,
    })
  }

  document.querySelectorAll('.tl-item').forEach((item, i) => {
    gsap.set(item, { opacity: 0 })
    // reveal the card on the way down, fade it back out on the way up
    ScrollTrigger.create({
      trigger: item, start: 'top 82%',
      onEnter:     () => gsap.to(item, { opacity: 1, duration: 0.9, ease: 'expo.out' }),
      onLeaveBack: () => gsap.to(item, { opacity: 0, duration: 0.5, ease: 'power2.in' }),
    })
    // grow the line to this card's dot on the way down; retract it to the
    // previous dot on the way up — the line follows the scroll in both directions
    ScrollTrigger.create({
      trigger: item, start: 'top 48%',
      onEnter:     () => drawTo(i,     0.85, 'power2.out'),
      onLeaveBack: () => drawTo(i - 1, 0.6,  'power2.in'),
    })
  })

  // Rebuild the curve on resize; keep the line drawn to the same dot.
  let t
  window.addEventListener('resize', () => {
    clearTimeout(t)
    t = setTimeout(() => {
      const p = buildTimelinePath()
      if (!p) return
      path = p
      total = p._totalLen
      p.style.strokeDasharray = total
      p.style.strokeDashoffset = Math.max(0, total - p._dotLengths[current])
      ScrollTrigger.refresh()
    }, 200)
  })
}

/* --------------------------------------------------------------------------
   WORK — horizontal scroll, pinned
-------------------------------------------------------------------------- */
function initWorkScroll() {
  const track = document.querySelector('[data-work-track]')
  const pin = document.querySelector('[data-work-pin]')
  if (!track || !pin || window.innerWidth < 768) return

  const distance = () => track.scrollWidth - pin.clientWidth + window.innerWidth * 0.089
  gsap.to(track, {
    x: () => -distance(),
    ease: 'none',
    scrollTrigger: {
      trigger: '.work',
      start: 'top top',
      end: () => '+=' + distance(),
      pin: '[data-work-pin]',
      scrub: 1,
      invalidateOnRefresh: true,
      refreshPriority: 1,
    },
  })
}

/* --------------------------------------------------------------------------
   TEXT REVEAL — per-character scrub (What You Get heading)
-------------------------------------------------------------------------- */
function initTextReveal() {
  document.querySelectorAll('[data-text-reveal]').forEach((target) => {
    // Split text into word spans but KEEP inline chips (icon cards) intact.
    const nodes = [...target.childNodes]
    target.innerHTML = ''
    const items = []
    nodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent.split(/(\s+)/).forEach((tok) => {
          if (!tok.trim()) { target.appendChild(document.createTextNode(tok)) }
          else { const s = document.createElement('span'); s.className = 'rv-w'; s.textContent = tok; target.appendChild(s); items.push(s) }
        })
      } else {
        target.appendChild(node)      // chip element — keep as-is
        items.push(node)
      }
    })
    const words = items.filter((el) => el.classList && el.classList.contains('rv-w'))
    // reveal across the readable zone (until the block's bottom passes centre) so
    // the words visibly fill in as you read, instead of finishing off-screen high.
    const st = { trigger: target, start: 'top 78%', end: 'bottom 52%', scrub: 1, invalidateOnRefresh: true }
    gsap.fromTo(items, { opacity: 0.14 }, { opacity: 1, ease: 'none', stagger: 0.06, scrollTrigger: st })
    gsap.fromTo(words, { color: '#CBC8B6' }, { color: '#111111', ease: 'none', stagger: 0.06, scrollTrigger: st })
  })
}

/* --------------------------------------------------------------------------
   TESTIMONIALS — draggable Swiper slider with a drag indicator
-------------------------------------------------------------------------- */
function initReviews() {
  const el = document.querySelector('.tst-swiper')
  if (!el) return
  new Swiper(el, {
    modules: [Pagination],
    slidesPerView: 1.1,
    spaceBetween: 20,
    grabCursor: false,
    pagination: { el: '.tst-pagination', clickable: true },
    breakpoints: { 768: { slidesPerView: 2.2 }, 1200: { slidesPerView: 2.6 } },
  })

  // Yellow "DRAG" cursor that follows the pointer inside the slider
  const cur = document.querySelector('[data-drag-cursor]')
  const zone = document.querySelector('[data-drag-zone]')
  if (!cur || !zone || window.matchMedia('(hover: none)').matches) return
  const move = (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px' }
  zone.addEventListener('mouseenter', () => { cur.classList.add('show'); window.addEventListener('mousemove', move) })
  zone.addEventListener('mouseleave', () => { cur.classList.remove('show'); window.removeEventListener('mousemove', move) })
}

/* --------------------------------------------------------------------------
   ACTIVE NAV — highlight the sidebar pill for the section in view (yellow)
-------------------------------------------------------------------------- */
function initActiveNav() {
  const map = { top: 'home', about: 'about', work: 'projects', overview: 'what',
                services: 'services', testimonials: 'clients', faq: 'faq' }
  Object.entries(map).forEach(([id, side]) => {
    const sec = document.getElementById(id)
    const pill = document.querySelector(`[data-side="${side}"]`)
    if (!sec || !pill) return
    ScrollTrigger.create({
      trigger: sec, start: 'top 45%', end: 'bottom 45%',
      onToggle: (self) => pill.classList.toggle('is-active', self.isActive),
    })
  })
}

/* --------------------------------------------------------------------------
   NESH® NAME BAND — the giant wordmark fills with a filmstrip of project images
   (masked to the letters) as it scrolls through; base stays yellow underneath.
-------------------------------------------------------------------------- */
function initNameBand() {
  const strip = document.querySelector('[data-nb-strip]')
  if (!strip) return
  // Images stay hidden (letters read yellow) and reveal on HOVER via CSS; the
  // filmstrip inside just drifts slowly with scroll for life.
  gsap.fromTo(strip, { xPercent: 0 }, {
    xPercent: -20, ease: 'none',
    scrollTrigger: { trigger: '.nameband', start: 'top bottom', end: 'bottom top', scrub: 1 },
  })

  // Torch reveal: images show only in a small circle around the cursor.
  const band = document.querySelector('[data-nameband]')
  const fill = document.querySelector('[data-nb-fill]')
  if (band && fill) {
    const R = 90   // spotlight radius (px) — tune here
    band.addEventListener('pointermove', (e) => {
      const r = fill.getBoundingClientRect()
      fill.style.setProperty('--nbx', (e.clientX - r.left) + 'px')
      fill.style.setProperty('--nby', (e.clientY - r.top) + 'px')
      fill.style.setProperty('--nbspot', R + 'px')
    })
    band.addEventListener('pointerleave', () => fill.style.setProperty('--nbspot', '0px'))
  }
}

/* --------------------------------------------------------------------------
   SIDEBAR ON DARK — the persistent glass rail sits over dark sections (work,
   marquee, contact). There the glass must flip to a dark-frosted look with
   light text, like the reference. A counter handles adjacent dark sections.
-------------------------------------------------------------------------- */
function initSidebarOnDark() {
  const darkSections = ['.work', '.marquee-band', '.contact']
  let darkCount = 0
  const apply = () => document.body.classList.toggle('over-dark', darkCount > 0)
  darkSections.forEach((sel) => {
    const el = document.querySelector(sel)
    if (!el) return
    ScrollTrigger.create({
      trigger: el, start: 'top 55%', end: 'bottom 45%',
      onEnter: () => { darkCount++; apply() },
      onLeave: () => { darkCount = Math.max(0, darkCount - 1); apply() },
      onEnterBack: () => { darkCount++; apply() },
      onLeaveBack: () => { darkCount = Math.max(0, darkCount - 1); apply() },
    })
  })
}

/* --------------------------------------------------------------------------
   TYPING EFFECT — chat bubble types out, message lands, repeats
-------------------------------------------------------------------------- */
function initTyping() {
  const el = document.querySelector('[data-typing]')
  if (!el) return
  const lines = JSON.parse(el.dataset.typing)
  const dots = el.querySelector('.typing-dots')
  const out = el.querySelector('.typing-out')
  const cta = el.querySelector('.typing-cta')
  const ctaText = cta ? (cta.dataset.text || "Let's Talk") : ''
  let token = 0   // bump to cancel any in-flight run (e.g. on scroll-away)

  const wait = (ms, run, fn) => { el._t = setTimeout(() => { if (run === token) fn() }, ms) }
  function typeInto(node, text, speed, run, done) {
    let i = 0
    const step = () => {
      if (run !== token) return
      node.textContent = text.slice(0, i)
      if (i++ <= text.length) el._t = setTimeout(step, speed)
      else done()
    }
    step()
  }

  // A tiny two-message conversation that STAYS: the prospect's message types in
  // (with a person avatar), then the agency "types again", then the reply lands
  // as the CTA button. Nothing is erased; a fresh message rotates on re-entry.
  let runCount = 0
  function run() {
    const my = ++token
    out.textContent = ''
    if (cta) cta.textContent = ''
    dots.classList.remove('show')
    const line = lines[runCount % lines.length]
    runCount++
    // 1) dots, then 2) the message types and stays
    dots.classList.add('show')
    wait(1000, my, () => {
      dots.classList.remove('show')
      typeInto(out, line, 45, my, () => {
        // 3) short pause, then "typing again"
        wait(1000, my, () => {
          dots.classList.add('show')
          wait(1300, my, () => {
            // 4) the reply lands as the CTA button
            dots.classList.remove('show')
            if (cta) typeInto(cta, ctaText, 65, my, () => {})
          })
        })
      })
    })
  }
  function stop() {
    token++; clearTimeout(el._t)
    dots.classList.remove('show'); out.textContent = ''
    if (cta) cta.textContent = ''
  }

  ScrollTrigger.create({
    trigger: el, start: 'top 85%', end: 'bottom 15%',
    onToggle: (self) => { if (self.isActive) run(); else stop() },
  })
}

/* --------------------------------------------------------------------------
   FAQ — accordion
-------------------------------------------------------------------------- */
function initFaq() {
  document.querySelectorAll('.faq-item').forEach((item) => {
    const q = item.querySelector('.faq-q')
    const a = item.querySelector('.faq-a')
    q.addEventListener('click', () => {
      const open = item.classList.contains('open')
      item.classList.toggle('open')
      gsap.to(a, { height: open ? 0 : 'auto', duration: 0.45, ease: 'power2.inOut',
        onComplete: () => ScrollTrigger.refresh() })
    })
  })
}

/* --------------------------------------------------------------------------
   PRELOADER — sand overlay with a counter; wipes up to reveal the hero.
   IMPORTANT: it locks scroll while loading, so NO ScrollTrigger may be built
   until it resolves — otherwise `once:true` reveals fire at scroll 0 and never
   animate. `preloaderDone` gates boot() for exactly this reason.
-------------------------------------------------------------------------- */
let resolvePreloader
const preloaderDone = new Promise((res) => { resolvePreloader = res })

function initPreloader() {
  const pl = document.querySelector('[data-preloader]')
  if (!pl) { resolvePreloader(); return }
  const countEl = pl.querySelector('[data-pl-count]')
  const fillEl = pl.querySelector('[data-pl-fill]')
  document.documentElement.style.overflow = 'hidden'   // lock scroll while loading

  const state = { v: 0 }
  gsap.timeline({
    onComplete: () => {
      gsap.to(pl, {
        yPercent: -100, duration: 0.9, ease: 'expo.inOut', delay: 0.15,
        onStart: () => { document.documentElement.style.overflow = '' },
        onComplete: () => { pl.remove(); resolvePreloader() },   // layout is now stable
      })
    },
  }).to(state, {
    v: 100, duration: 1.25, ease: 'power2.inOut',
    onUpdate: () => {
      const n = Math.round(state.v)
      if (countEl) countEl.textContent = n
      if (fillEl) fillEl.style.width = n + '%'
    },
  })
}

/* --------------------------------------------------------------------------
   MAGNETIC — buttons/arrows drift toward the cursor, spring back on leave.
-------------------------------------------------------------------------- */
function initMagnetic() {
  if (window.matchMedia('(hover: none)').matches) return
  const els = document.querySelectorAll('.services .btn, .contact-actions .btn, .cta-band .btn, .side-cta, .work-arrow, [data-magnetic]')
  els.forEach((el) => {
    const strength = el.classList.contains('work-arrow') ? 0.5 : 0.32
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect()
      gsap.to(el, {
        x: (e.clientX - (r.left + r.width / 2)) * strength,
        y: (e.clientY - (r.top + r.height / 2)) * strength,
        duration: 0.5, ease: 'power3.out',
      })
    })
    el.addEventListener('mouseleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' })
    })
  })
}

/* --------------------------------------------------------------------------
   THEME SWITCHER — flips a [data-theme] flag on <html>; CSS remaps tokens.
-------------------------------------------------------------------------- */
function initTheme() {
  const btn = document.querySelector('[data-theme-toggle]')
  if (!btn) return
  const saved = localStorage.getItem('eshtyhar-theme')
  if (saved) document.documentElement.dataset.theme = saved
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    localStorage.setItem('eshtyhar-theme', next)
  })
}

initPreloader()

/* --------------------------------------------------------------------------
   BOOT — wait for fonts (text metrics) and the portrait image (its height
   drives the hero geometry) before measuring anything.
-------------------------------------------------------------------------- */
async function boot() {
  await document.fonts.ready.catch(() => {})
  const img = document.querySelector('[data-portrait] img')
  if (img && !img.complete) {
    await new Promise((res) => { img.onload = res; img.onerror = res })
  }
  // Wait for the preloader to finish + scroll to be unlocked BEFORE building any
  // ScrollTrigger, so scrub/reveal start positions are measured against the real
  // (scrollable) layout — this is what makes the reveals actually animate.
  await preloaderDone
  // Create PINS first (hero, work). Their pinSpacing shifts everything below, so
  // any reveal/scrub trigger built afterwards measures the correct positions.
  // Building scrubs before the work pin was making them fire far too early.
  initHeroTimeline()
  initWorkScroll()
  initTimeline()
  initReveals()
  initHeadingReveal()
  initTextReveal()
  initNameBand()
  initReviews()
  initActiveNav()
  initSidebarOnDark()
  initTyping()
  initFaq()
  initMagnetic()
  initTheme()
  ScrollTrigger.refresh()
}

boot()
