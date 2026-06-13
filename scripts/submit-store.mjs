#!/usr/bin/env node
// scripts/submit-store.mjs
//
// Store submission stub for the Chrome Web Store (CWS) and Mozilla Add-ons
// (AMO) distribution pipeline. NOT YET WIRED TO A REAL SUBMISSION API — this
// is a P0 follow-up to the v2.11.0 work. The script currently:
//
//   1. Verifies the version-sync guard passes
//   2. Verifies the zip + xpi artifacts exist
//   3. Verifies the manifest fields the stores require
//   4. Prints a checklist of manual submission steps
//
// When CWS and AMO API credentials are available, the manual steps at the
// bottom can be replaced with HTTP calls to the publish endpoints.
//
// Usage:
//   node scripts/submit-store.mjs --target=chrome
//   node scripts/submit-store.mjs --target=firefox
//   node scripts/submit-store.mjs --target=both

import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const args = process.argv.slice(2)
const targetArg = args.find((a) => a.startsWith('--target='))
const target = targetArg ? targetArg.split('=')[1] : 'both'

if (!['chrome', 'firefox', 'both'].includes(target)) {
  console.error(`Invalid --target value: ${target}. Use chrome, firefox, or both.`)
  process.exit(2)
}

const checks = []
function check(name, pass, detail) {
  checks.push({ name, pass, detail })
  const mark = pass ? '✓' : '✗'
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function readJson(path) {
  if (!existsSync(path)) return null
  return JSON.parse(await readFile(path, 'utf8'))
}

async function fileExists(path) {
  try {
    const s = await stat(path)
    return s.isFile()
  } catch {
    return false
  }
}

async function main() {
  console.log(`Glassy Companion — Store Submission Check (target: ${target})\n`)

  // 1. Version sync
  const pkg = await readJson(join(ROOT, 'package.json'))
  const manifest = await readJson(join(ROOT, 'manifest.json'))
  const manifestFf = await readJson(join(ROOT, 'manifest.firefox.json'))
  const distManifest = await readJson(join(ROOT, 'dist', 'manifest.json'))
  const distFfManifest = await readJson(join(ROOT, 'dist-firefox', 'manifest.json'))

  if (pkg && manifest && distManifest) {
    check('Chrome manifest version matches package.json', manifest.version === pkg.version, `${manifest.version} === ${pkg.version}`)
    check('Chrome dist manifest version matches package.json', distManifest.version === pkg.version, `${distManifest.version} === ${pkg.version}`)
  } else {
    check('Chrome source + dist manifests exist', false, 'one or more missing — run `npm run build`')
  }

  if (pkg && manifestFf && distFfManifest) {
    check('Firefox manifest version matches package.json', manifestFf.version === pkg.version, `${manifestFf.version} === ${pkg.version}`)
    check('Firefox dist manifest version matches package.json', distFfManifest.version === pkg.version, `${distFfManifest.version} === ${pkg.version}`)
  } else {
    check('Firefox source + dist manifests exist', false, 'one or more missing — run `npm run build:firefox`')
  }

  // 2. Required manifest fields for CWS
  if (manifest) {
    check('CWS: manifest has name', !!manifest.name, manifest.name || '(missing)')
    check('CWS: manifest has version', !!manifest.version, manifest.version || '(missing)')
    check('CWS: manifest has description', !!manifest.description && manifest.description.length >= 40, `${manifest.description?.length || 0} chars (min 40)`)
    check('CWS: manifest_version is 3', manifest.manifest_version === 3, `manifest_version: ${manifest.manifest_version}`)
    check('CWS: icons present', !!manifest.icons && Object.keys(manifest.icons).length >= 1, manifest.icons ? `${Object.keys(manifest.icons).length} icons` : '(none)')
  }

  // 3. Required manifest fields for AMO
  if (manifestFf) {
    check('AMO: gecko.id present', !!manifestFf.browser_specific_settings?.gecko?.id, manifestFf.browser_specific_settings?.gecko?.id || '(missing)')
    check('AMO: gecko.strict_min_version present', !!manifestFf.browser_specific_settings?.gecko?.strict_min_version, manifestFf.browser_specific_settings?.gecko?.strict_min_version || '(missing)')
    check('AMO: CSP present (required for review)', !!manifestFf.content_security_policy, manifestFf.content_security_policy ? 'present' : '(missing)')
  }

  // 4. Artifacts
  if (target === 'chrome' || target === 'both') {
    const version = pkg?.version || 'unknown'
    const zipName = `glassy-companion-v${version}.zip`
    const zipPath = join(ROOT, zipName)
    check(`Chrome zip exists: ${zipName}`, await fileExists(zipPath), existsSync(zipPath) ? '' : `run \`npm run zip\``)
  }
  if (target === 'firefox' || target === 'both') {
    const version = pkg?.version || 'unknown'
    const xpiName = `glassy-companion-v${version}-firefox.xpi`
    const xpiPath = join(ROOT, xpiName)
    check(`Firefox xpi exists: ${xpiName}`, await fileExists(xpiPath), existsSync(xpiPath) ? '' : `run \`npm run zip:firefox\``)
  }

  // 5. Privacy policy
  const ppPath = join(ROOT, 'PRIVACY_POLICY.md')
  if (existsSync(ppPath)) {
    const ppRaw = await readFile(ppPath, 'utf8')
    const lastUpdated = ppRaw.match(/Last Updated:\*\*\s*(\S+\s+\d+,\s+\d{4})/i)
    check('Privacy policy exists', true, `Last updated: ${lastUpdated?.[1] || 'unknown'}`)
  } else {
    check('Privacy policy exists', false, 'PRIVACY_POLICY.md not found')
  }

  // Summary
  const failed = checks.filter((c) => !c.pass)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`)
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed. Fix and re-run.`)
    process.exit(1)
  }

  // Manual submission steps
  console.log(`\n─── Manual submission steps (not yet automated) ───`)
  if (target === 'chrome' || target === 'both') {
    console.log(`\nChrome Web Store (CWS):`)
    console.log(`  1. Go to https://chrome.google.com/webstore/devconsole/`)
    console.log(`  2. Select the Glassy Companion item (or create a new one)`)
    console.log(`  3. Click "Package" → upload glassy-companion-v${pkg?.version}.zip`)
    console.log(`  4. Click "Store listing" → paste the contents of STORE_LISTING.md`)
    console.log(`  5. Click "Privacy" → paste the contents of PRIVACY_POLICY.md`)
    console.log(`  6. Click "Save draft" → review → click "Submit for review"`)
    console.log(`  7. Pay the one-time $5 developer fee (if first submission)`)
  }
  if (target === 'firefox' || target === 'both') {
    console.log(`\nMozilla Add-ons (AMO):`)
    console.log(`  1. Go to https://addons.mozilla.org/en-US/developers/addon/submit/`)
    console.log(`  2. Select the Glassy Companion item (or create a new one)`)
    console.log(`  3. Click "Upload New Version" → upload glassy-companion-v${pkg?.version}-firefox.xpi`)
    console.log(`  4. Fill in source-code notes (the package includes src/ but not dist/ unless explicitly zipped)`)
    console.log(`  5. Click "Submit Version"`)
  }
  console.log(`\nWhen the AMO and CWS API submission is wired, the steps above`)
  console.log(`will be replaced by HTTP calls to the publish endpoints.`)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(2)
})
