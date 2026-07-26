/**
 * VISUAL DIFF HARNESS
 * ---------------------------------------------------------------------------
 * Screenshots heynesh.com and the local build at matched scroll positions,
 * then pixel-diffs them and writes a report.
 *
 *   node compare.js
 *
 * Output lands in ./diff/ :
 *   ref-<n>.png    reference (heynesh.com)
 *   mine-<n>.png   local build
 *   diff-<n>.png   red overlay of mismatched pixels
 *   report.json    machine-readable scores
 *
 * IMPORTANT: a low mismatch % here does NOT mean "identical". The tool is
 * blind to timing, easing, and anything that moves. It compares still frames.
 * ---------------------------------------------------------------------------
 */

import { chromium } from 'playwright'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import fs from 'fs'
import path from 'path'

const REF_URL = 'https://heynesh.com/'
const MINE_URL = process.env.MINE_URL || 'http://localhost:5173/'
const OUT = path.resolve('diff')
const VIEWPORT = { width: 1440, height: 900 }

// Scroll offsets to sample, in px. 0 = hero, 900 = end of the ghost morph.
const STOPS = [0, 450, 900, 1800, 3000]

// Settle time after scrolling before the shot, ms. Scrubbed animation needs
// this or you capture mid-tween and every run scores differently.
const SETTLE = 1200

fs.mkdirSync(OUT, { recursive: true })

async function shoot(page, url, label) {
  const shots = []
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2500) // fonts + preloader

  for (const y of STOPS) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)
    await page.waitForTimeout(SETTLE)
    const file = path.join(OUT, `${label}-${y}.png`)
    await page.screenshot({ path: file })
    shots.push({ y, file })
  }
  return shots
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })

console.log('shooting reference (heynesh.com)...')
const refPage = await ctx.newPage()
const refShots = await shoot(refPage, REF_URL, 'ref')

console.log('shooting local build...')
const minePage = await ctx.newPage()
const mineShots = await shoot(minePage, MINE_URL, 'mine')

await browser.close()

const report = []

for (let i = 0; i < STOPS.length; i++) {
  const y = STOPS[i]
  const a = PNG.sync.read(fs.readFileSync(refShots[i].file))
  const b = PNG.sync.read(fs.readFileSync(mineShots[i].file))

  const w = Math.min(a.width, b.width)
  const h = Math.min(a.height, b.height)
  const diff = new PNG({ width: w, height: h })

  const mismatched = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.12 })
  const pct = ((mismatched / (w * h)) * 100).toFixed(2)

  fs.writeFileSync(path.join(OUT, `diff-${y}.png`), PNG.sync.write(diff))
  report.push({ scrollY: y, mismatchPercent: Number(pct), mismatchedPixels: mismatched })

  console.log(`  scrollY ${String(y).padStart(4)}  ->  ${String(pct).padStart(6)}% different`)
}

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))

const avg = (report.reduce((s, r) => s + r.mismatchPercent, 0) / report.length).toFixed(2)
console.log(`\naverage mismatch: ${avg}%`)
console.log(`artifacts in ${OUT}`)
console.log('\nNOTE: still-frame comparison only. Blind to easing, timing, and motion feel.')
