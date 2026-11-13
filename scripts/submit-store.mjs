#!/usr/bin/env node
// scripts/submit-store.mjs
//
// Store submission check for the Chrome Web Store (CWS), Mozilla Add-ons (AMO)
// and Edge Add-ons. It does not upload anything: the upload is done by hand in
// each store's dashboard, from STORE_SUBMISSION.md. The script:
//
//   1. Verifies the version-sync guard passes
//   2. Verifies the zip + xpi artifacts exist
//   3. Verifies the manifest fields the stores require
//   4. Verifies no retired address is in a manifest, the Firefox data
//      declaration is present, and the five screenshots exist at 1280x800
//   5. Prints where the manual submission steps are
//
// When CWS and AMO API credentials are available, the manual steps at the
// bottom can be replaced with HTTP calls to the publish endpoints.
//
// Usage:
//   node scripts/submit-store.mjs --target=chrome
//   node scripts/submit-store.mjs --target=firefox
//   node scripts/submit-store.mjs --target=both

import { readFile, stat, open } from 'node:fs/promises'
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
  console.log(`Glassy Capture — store submission check (target: ${target})\n`)

  // 1. Version sync
  const pkg = await readJson(join(ROOT, 'package.json'))
  const manifest = await readJson(join(ROOT, 'manifest.json'))
  const manifestFf = await readJson(join(ROOT, 'manifest.firefox.json'))
  const distManifest = await readJson(join(ROOT, 'dist', 'manifest.json'))
  const distFfManifest = await readJson(join(ROOT, 'dist-firefox', 'manifest.json'))

  const wantChrome = target === 'chrome' || target === 'both'
  const wantFirefox = target === 'firefox' || target === 'both'
  if (!wantChrome) {
    // Firefox-only run: the Chrome build is not required
  } else if (pkg && manifest && distManifest) {
    check('Chrome manifest version matches package.json', manifest.version === pkg.version, `${manifest.version} === ${pkg.version}`)
    check('Chrome dist manifest version matches package.json', distManifest.version === pkg.version, `${distManifest.version} === ${pkg.version}`)
  } else {
    check('Chrome source + dist manifests exist', false, 'one or more missing — run `npm run build`')
  }

  if (!wantFirefox) {
    // Chrome-only run: the Firefox build is not required
  } else if (pkg && manifestFf && distFfManifest) {
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
  if (manifestFf && wantFirefox) {
    check('AMO: gecko.id present', !!manifestFf.browser_specific_settings?.gecko?.id, manifestFf.browser_specific_settings?.gecko?.id || '(missing)')
    check('AMO: gecko.strict_min_version present', !!manifestFf.browser_specific_settings?.gecko?.strict_min_version, manifestFf.browser_specific_settings?.gecko?.strict_min_version || '(missing)')
    check('AMO: CSP present (required for review)', !!manifestFf.content_security_policy, manifestFf.content_security_policy ? 'present' : '(missing)')
  }

  // 3b. Nothing retired, nothing undeclared
  const RETIRED = ['dash.0rel.com', 'glassy.stanz.info']
  for (const [label, m] of [['Chrome', manifest], ['Firefox', manifestFf], ['Chrome build', distManifest], ['Firefox build', distFfManifest]]) {
    if (!m) continue
    const hosts = [...(m.host_permissions || []), ...(m.optional_host_permissions || [])]
    const found = hosts.filter((h) => RETIRED.some((r) => h.includes(r)))
    check(`${label}: no retired address in host access`, found.length === 0, found.join(', '))
  }
  const DCP_ALLOWED = ['none', 'personallyIdentifyingInfo', 'healthInfo', 'financialAndPaymentInfo', 'authenticationInfo', 'personalCommunications', 'locationInfo', 'browsingActivity', 'websiteContent', 'websiteActivity', 'searchTerms', 'bookmarksInfo']
  for (const [label, m] of [['AMO', manifestFf], ['AMO build', distFfManifest]]) {
    if (!m || !wantFirefox) continue
    const gecko = m.browser_specific_settings?.gecko
    const req = gecko?.data_collection_permissions?.required
    check(`${label}: data_collection_permissions.required present`, Array.isArray(req) && req.length > 0, req?.join(', ') || '(missing)')
    const bad = (req || []).filter((v) => !DCP_ALLOWED.includes(v))
    check(`${label}: data_collection_permissions values are ones Firefox accepts`, bad.length === 0 && !((req || []).includes('none') && req.length > 1), bad.join(', '))
    check(`${label}: strict_min_version is 140 or later (the built-in data prompt)`, parseInt(gecko?.strict_min_version, 10) >= 140, gecko?.strict_min_version || '(missing)')
  }

  // 3c. Screenshots: five PNGs, 1280x800
  const SHOTS = ['01-save.png', '02-search.png', '03-note.png', '04-side-panel.png', '05-sign-in.png']
  for (const name of SHOTS) {
    const p = join(ROOT, 'store', 'screenshots', name)
    let size = '(missing)'
    if (await fileExists(p)) {
      const fh = await open(p, 'r')
      const buf = Buffer.alloc(24)
      await fh.read(buf, 0, 24, 0)
      await fh.close()
      const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      size = isPng ? `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}` : '(not a PNG)'
    }
    check(`Screenshot ${name} is 1280x800`, size === '1280x800', size)
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

  console.log(`\nNext: follow STORE_SUBMISSION.md. It has every field to paste for each store.`)
  console.log(`The upload itself is done by the owner in each store's dashboard.`)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(2)
})
