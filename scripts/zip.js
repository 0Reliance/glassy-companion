/**
 * scripts/zip.js — Package the built extension into a distributable zip.
 *
 * Usage: node scripts/zip.js
 *        npm run zip  (runs `vite build` first via package.json prezip hook)
 *
 * Output: glassy-companion-v{version}.zip  (placed in the project root)
 */

import { createWriteStream, existsSync, readdirSync, statSync, readFileSync } from 'fs'
import { resolve, join, relative } from 'path'
import { createGzip } from 'zlib'

const __dirname = new URL('.', import.meta.url).pathname

// Read version from manifest
const manifestPath = resolve(__dirname, '../manifest.json')
const manifest     = JSON.parse(readFileSync(manifestPath, 'utf8'))
const version      = manifest.version
const distDir      = resolve(__dirname, '../dist')
const outFile      = resolve(__dirname, `../glassy-companion-v${version}.zip`)

// Verify dist exists
if (!existsSync(distDir)) {
  console.error('[zip] dist/ not found. Run `npm run build` first.')
  process.exit(1)
}

/**
 * Minimal zip writer (no external deps — uses only Node.js builtins).
 * Implements ZIP local file headers + central directory for compatibility.
 */

const entries = collectFiles(distDir)

console.log(`[zip] Packaging ${entries.length} files → glassy-companion-v${version}.zip`)

const chunks      = []
const centralDir  = []
let   offset      = 0

for (const { absPath, zipPath } of entries) {
  const data       = readFileSync(absPath)
  const crc        = crc32(data)
  const compressed = data  // store mode (no compression for simplicity)

  const localHeader = buildLocalHeader(zipPath, data.length, compressed.length, crc)
  chunks.push(localHeader, compressed)

  centralDir.push(buildCentralDirEntry(zipPath, data.length, compressed.length, crc, offset))
  offset += localHeader.length + compressed.length
}

const centralDirBuf  = Buffer.concat(centralDir)
const eocd           = buildEOCD(centralDir.length, centralDirBuf.length, offset)
const zip            = Buffer.concat([...chunks, centralDirBuf, eocd])

import { writeFileSync } from 'fs'
writeFileSync(outFile, zip)

const kb = (zip.length / 1024).toFixed(1)
console.log(`[zip] ✓ Created glassy-companion-v${version}.zip (${kb} KB, ${entries.length} files)`)

// ── Helpers ────────────────────────────────────────────────────────────────────

function collectFiles(dir) {
  const results = []
  function walk(current) {
    for (const name of readdirSync(current)) {
      const abs  = join(current, name)
      const stat = statSync(abs)
      if (stat.isDirectory()) {
        walk(abs)
      } else {
        results.push({ absPath: abs, zipPath: relative(distDir, abs) })
      }
    }
  }
  walk(dir)
  return results
}

function buildLocalHeader(name, size, compSize, crc) {
  const nameBuf = Buffer.from(name, 'utf8')
  const buf     = Buffer.alloc(30 + nameBuf.length)
  buf.writeUInt32LE(0x04034b50, 0)  // signature
  buf.writeUInt16LE(20,     4)      // version needed
  buf.writeUInt16LE(0x0800, 6)      // flags (UTF-8)
  buf.writeUInt16LE(0,      8)      // compression (stored)
  buf.writeUInt16LE(0,     10)      // mod time
  buf.writeUInt16LE(0,     12)      // mod date
  buf.writeUInt32LE(crc,   14)
  buf.writeUInt32LE(compSize, 18)
  buf.writeUInt32LE(size,  22)
  buf.writeUInt16LE(nameBuf.length, 26)
  buf.writeUInt16LE(0,     28)      // extra field length
  nameBuf.copy(buf, 30)
  return buf
}

function buildCentralDirEntry(name, size, compSize, crc, offset) {
  const nameBuf = Buffer.from(name, 'utf8')
  const buf     = Buffer.alloc(46 + nameBuf.length)
  buf.writeUInt32LE(0x02014b50, 0)  // signature
  buf.writeUInt16LE(20,  4)         // version made by
  buf.writeUInt16LE(20,  6)         // version needed
  buf.writeUInt16LE(0x0800, 8)      // flags
  buf.writeUInt16LE(0,  10)         // compression
  buf.writeUInt16LE(0,  12)         // mod time
  buf.writeUInt16LE(0,  14)         // mod date
  buf.writeUInt32LE(crc, 16)
  buf.writeUInt32LE(compSize, 20)
  buf.writeUInt32LE(size, 24)
  buf.writeUInt16LE(nameBuf.length, 28)
  buf.writeUInt16LE(0,  30)         // extra field length
  buf.writeUInt16LE(0,  32)         // comment length
  buf.writeUInt16LE(0,  34)         // disk number start
  buf.writeUInt16LE(0,  36)         // internal attributes
  buf.writeUInt32LE(0,  38)         // external attributes
  buf.writeUInt32LE(offset, 42)
  nameBuf.copy(buf, 46)
  return buf
}

function buildEOCD(numEntries, cdSize, cdOffset) {
  const buf = Buffer.alloc(22)
  buf.writeUInt32LE(0x06054b50, 0)   // signature
  buf.writeUInt16LE(0,  4)           // disk number
  buf.writeUInt16LE(0,  6)           // start disk
  buf.writeUInt16LE(numEntries,  8)
  buf.writeUInt16LE(numEntries, 10)
  buf.writeUInt32LE(cdSize,  12)
  buf.writeUInt32LE(cdOffset, 16)
  buf.writeUInt16LE(0,  20)          // comment length
  return buf
}

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
