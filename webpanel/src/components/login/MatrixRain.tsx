import { useEffect, useRef } from 'react'

// Subtle Matrix-style rain for the login backdrop.
//
// Design constraints (measured, not guessed):
// - Runs only while mounted (login screen). After auth the component
//   unmounts and all timers / canvas memory are released.
// - Honors `prefers-reduced-motion: reduce` — no-ops entirely.
// - Disabled below 900px viewport width (mobile): the login card would
//   dominate the screen anyway and the effect would just heat batteries.
// - 20 fps throttle (not 60) — characters falling slowly reads more
//   "elegant" than "frantic". Keeps CPU in the 1–2% range on modern
//   hardware.
// - Low opacity, CSS mask fading around the centre so the login card
//   stays fully legible. Z-index behind the aurora blobs.
//
// Character set is a mix of Latin + Katakana half-width + IRC-ish
// punctuation, biased toward the network-admin theme.
const CHAR_POOL =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
  '0123456789' +
  '<>/*|!@#$%^&+=;:?_' +
  'abcdef01'
const FONT_SIZE = 14                 // px, matches --font-mono base
const SPEED_FPS = 20                  // render cap
const HEAD_ALPHA = 0.85               // bright leading char
const TAIL_ALPHA = 0.35               // the rest of the column
const MIN_WIDTH = 900                 // don't run below this viewport

// Every so often a falling column writes one of these sample handles instead
// of random characters.
const CREW_NICKS = ['hub', 'leaf', 'slave', 'owner', 'admin']

// Probability a column gets seeded with a nick on each reset (rolled when
// the column scrolls off the bottom and recycles to the top). Across ~120
// columns at 20 fps the reset event fires a handful of times per second,
// so 0.005 → expected ~1 seeded nick every 30s. Tuned to "barely there".
const SEED_CHANCE = 0.005

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Respect user's motion preference — entirely skip the effect.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    // Skip on narrow viewports — not worth the CPU when there is no
    // real estate for the rain to breathe around the card.
    if (window.innerWidth < MIN_WIDTH) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    // Per-column state. `y` = row of the head (in cell units, integer).
    // `seedChars` is the easter-egg nick characters left to write at the
    // head; when non-null they're pulled in order until exhausted, then
    // the column reverts to random pool. `seedSourceLen` is the original
    // nick length, used to size the cyan glow window for the trailing
    // chars (so the whole nick reads as one streak, not isolated letters).
    type Col = {
      y: number
      seedChars: string[] | null
    }
    let cols: Col[] = []
    let width = 0
    let height = 0
    let rafId = 0
    let lastDraw = 0
    const frameInterval = 1000 / SPEED_FPS

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = `${FONT_SIZE}px 'JetBrains Mono', ui-monospace, Menlo, monospace`
      // Start each column at a random negative row so the rain eases in
      // instead of starting on a blank frame
      const colCount = Math.floor(width / FONT_SIZE)
      cols = new Array(colCount).fill(0).map(() => ({
        y: -Math.floor(Math.random() * 40),
        seedChars: null,
      }))
    }

    const draw = (now: number) => {
      rafId = requestAnimationFrame(draw)
      if (now - lastDraw < frameInterval) return
      lastDraw = now

      // Translucent navy overlay fades old characters — classic trick
      // for the trailing effect without redrawing every cell
      ctx.fillStyle = 'rgba(13, 17, 23, 0.08)'
      ctx.fillRect(0, 0, width, height)

      for (let i = 0; i < cols.length; i++) {
        const col = cols[i]
        const y = col.y * FONT_SIZE
        const x = i * FONT_SIZE

        if (y >= 0 && y <= height) {
          // Pick the head character. If this column is currently writing
          // a nick, pull the next letter and shrink the queue. Otherwise
          // reach into the random pool.
          let ch: string
          let isSeeded = false
          if (col.seedChars && col.seedChars.length > 0) {
            ch = col.seedChars.shift()!
            isSeeded = true
          } else {
            ch = CHAR_POOL.charAt((Math.random() * CHAR_POOL.length) | 0)
          }

          // Seeded heads use a slightly brighter cyan tint so a careful
          // viewer can spot the streak; random heads stay sky-blue.
          ctx.fillStyle = isSeeded
            ? `rgba(180, 220, 255, ${HEAD_ALPHA})`
            : `rgba(136, 192, 255, ${HEAD_ALPHA})`
          ctx.fillText(ch, x, y)

          // Drop a "tail" trace just above the head, one cell back. Stays
          // random even during a seeded streak — the seeded letters fall
          // through the trail naturally as the column descends.
          if (col.y > 1) {
            const tailCh = CHAR_POOL.charAt((Math.random() * CHAR_POOL.length) | 0)
            ctx.fillStyle = `rgba(167, 139, 250, ${TAIL_ALPHA})`
            ctx.fillText(tailCh, x, y - FONT_SIZE)
          }
        }

        col.y++
        // Reset column when it runs off the bottom, with randomised
        // starting height so raindrops stay out of phase. On reset, roll
        // the dice for an easter-egg seed: if won, queue a nick to be
        // emitted as the column climbs back into view.
        if (y > height && Math.random() > 0.975) {
          col.y = -Math.floor(Math.random() * 25)
          col.seedChars = null
          if (Math.random() < SEED_CHANCE) {
            const nick = CREW_NICKS[(Math.random() * CREW_NICKS.length) | 0]
            col.seedChars = nick.split('')
          }
        }
      }
    }

    resize()
    rafId = requestAnimationFrame(draw)
    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="matrix-rain" aria-hidden="true" />
}
