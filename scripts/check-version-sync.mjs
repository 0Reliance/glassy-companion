#!/usr/bin/env node
// scripts/check-version-sync.mjs
//
// Pre-build guard: ensures that the version in package.json matches the
// version in both source manifests (manifest.json and manifest.firefox.json)
// and in the previously-built dist/ manifests (if they exist).
//
// Fails non-zero if any of these drift out of sync. This prevents the
// "manifests say v2.9.0 but package.json says v2.11.0" class of bug that
// caused v2.10.0 and v2.11.0 to never ship to the Chrome Web Store or AMO.
//
// Usage:
//   node scripts/check-version-sync.mjs           # checks all 5 sources
//   node scripts/check-version-sync.mjs --strict # fails if any dist manifest is missing or stale
//
// Exit codes:
//   0  all sources agree on the same version
//   1  version drift detected
//   2  file missing or unreadable

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const SOURCES = [
  { name: 'package.json',        path: join(ROOT, 'package.json'),        jsonKey: 'version' },
  { name: 'manifest.json',       path: join(ROOT, 'manifest.json'),       jsonKey: 'version' },
  { name: 'manifest.firefox.json', path: join(ROOT, 'manifest.firefox.json'), jsonKey: 'version' },
  { name: 'dist/manifest.json',  path: join(ROOT, 'dist', 'manifest.json'),  jsonKey: 'version', optional: true },
  { name: 'dist-firefox/manifest.json', path: join(ROOT, 'dist-firefox', 'manifest.json'), jsonKey: 'version', optional: true },
]

const args = process.argv.slice(2)
const strict = args.includes('--strict')

async function readVersion(source) {
  if (!existsSync(source.path)) {
    if (source.optional && !strict) return { version: null, missing: true }
    console.error(`✗ ${source.name} is missing at ${source.path}`)
    process.exit(2)
  }
  try {
    const raw = await readFile(source.path, 'utf8')
    const parsed = JSON.parse(raw)
    const version = parsed[source.jsonKey]
    if (typeof version !== 'string' || version.length === 0) {
      console.error(`✗ ${source.name} has no "${source.jsonKey}" field or it's empty`)
      process.exit(2)
    }
    return { version, missing: false }
  } catch (err) {
    console.error(`✗ ${source.name} is not readable as JSON: ${err.message}`)
    process.exit(2)
  }
}

async function main() {
  const readings = await Promise.all(
    SOURCES.map(async (s) => ({
      name: s.name,
      optional: !!s.optional,
      ...(await readVersion(s)),
    })),
  )

  // Print a table
  console.log('Source                          Version')
  console.log('------------------------------- -------')
  for (const r of readings) {
    const display = r.missing ? '(missing)' : r.version
    console.log(`${r.name.padEnd(31)} ${display}`)
  }

  // Filter out optional-missing entries for drift comparison
  const present = readings.filter((r) => !r.missing)
  if (present.length < 2) {
    console.error('✗ Fewer than 2 present sources — nothing to compare')
    process.exit(2)
  }

  const canonical = present[0].version
  const drift = present.filter((r) => r.version !== canonical)

  if (drift.length === 0) {
    console.log(`\n✓ All sources agree on version ${canonical}`)
    process.exit(0)
  }

  console.error(`\n✗ Version drift detected.`)
  console.error(`  Canonical (${present[0].name}): ${canonical}`)
  for (const d of drift) {
    console.error(`  Drift    (${d.name}):         ${d.version}`)
  }
  console.error(`\nFix:`)
  console.error(`  1. Edit both source manifests: "version": "${canonical}"`)
  console.error(`  2. Run: npm run build && npm run build:firefox`)
  console.error(`  3. Re-run: node scripts/check-version-sync.mjs`)
  process.exit(1)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(2)
})
