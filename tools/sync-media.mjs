/**
 * Inline the theme's artwork - and, optionally, a font - into client.js.
 *
 * Why inline at all: a theme's host half never activates on the desktop build
 * this plugin targets, so a `/theme-p3r/media/li.gif` route would answer 404 and
 * the background would silently be empty. A data URI has no moving parts.
 *
 * Usage: npm run media           (or: node tools/sync-media.mjs)
 *        node tools/sync-media.mjs --check   → exit 1 if client.js is stale
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const MEDIA = join(ROOT, 'li.gif')
const TARGET = join(ROOT, 'client.js')

const START = '    /* ==== generated: li.gif ==== */'
const END = '    /* ==== end generated ==== */'

const FONT_START = '    /* ==== generated: font ==== */'
const FONT_END = '    /* ==== end font ==== */'

const MIME = {
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
}

/* Optional typeface. Naming it font.<ext> is the whole contract. */
const FONT_MIME = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

function pickFont() {
  for (const [ext, mime] of Object.entries(FONT_MIME)) {
    const path = join(ROOT, `font${ext}`)
    try {
      if (statSync(path).isFile()) return { path, mime, ext }
    } catch {
      /* try the next extension */
    }
  }
  return null
}

function pickMedia() {
  for (const [ext, mime] of Object.entries(MIME)) {
    const path = join(ROOT, `li${ext}`)
    try {
      if (statSync(path).isFile()) return { path, mime }
    } catch {
      /* try the next extension */
    }
  }
  return null
}

const media = pickMedia()
if (media === null) {
  console.error(`[p3r] no li.gif/li.webp/li.png in ${ROOT} — nothing to inline`)
  process.exit(1)
}

const bytes = readFileSync(media.path)
const uri = `data:${media.mime};base64,${bytes.toString('base64')}`
let source = readFileSync(TARGET, 'utf8')

/* Honour the file's own line endings: an editor on Windows may have rewritten
   client.js as CRLF, and regenerating with LF would make --check fail forever. */
const eol = source.includes('\r\n') ? '\r\n' : '\n'

function replaceBlock(text, start, end, lines) {
  const from = text.indexOf(start)
  const to = text.indexOf(end)
  if (from === -1 || to === -1 || to < from) return null
  return text.slice(0, from) + lines.join(eol) + text.slice(to + end.length)
}

const withArt = replaceBlock(source, START, END, [
  START,
  `    LI_GIF =`,
  `      '${uri}'`,
  END,
])
if (withArt === null) {
  console.error('[p3r] generated markers missing from client.js')
  process.exit(1)
}

const font = pickFont()
const withFont = replaceBlock(withArt, FONT_START, FONT_END, [
  FONT_START,
  `    P3R_FONT = ${font ? `'${`data:${font.mime};base64,${readFileSync(font.path).toString('base64')}'`}` : "''"}`,
  `    P3R_FONT_FORMAT = ${font ? `'${font.ext.slice(1)}'` : "''"}`,
  FONT_END,
])
if (withFont === null) {
  console.error('[p3r] font markers missing from client.js')
  process.exit(1)
}

const stale = withFont !== source

if (process.argv.includes('--check')) {
  if (stale) {
    console.error('[p3r] client.js is out of sync with li.gif / font.* — run: npm run media')
    process.exit(1)
  }
  console.log('[p3r] client.js is in sync with li.gif' + (font ? ' + font' : ''))
  process.exit(0)
}

if (!stale) {
  console.log('[p3r] already in sync')
  process.exit(0)
}

writeFileSync(TARGET, withFont)
const mb = (bytes.length / 1024 / 1024).toFixed(2)
const out = (withFont.length / 1024 / 1024).toFixed(2)
console.log(
  `[p3r] inlined ${media.path.split(/[\\/]/).pop()} (${mb} MB)` +
    (font ? ` + ${font.path.split(/[\\/]/).pop()}` : '') +
    ` → client.js is ${out} MB`,
)
