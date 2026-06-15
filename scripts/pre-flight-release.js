/**
 * pre-flight-release.js — Run before every companion release to verify
 * all version sources are in sync and release assets are ready.
 *
 * Usage: node scripts/pre-flight-release.js X.Y.Z
 */
import { readFileSync, existsSync } from 'fs'

const version = process.argv[2]
if (!version) {
  console.error('Usage: node scripts/pre-flight-release.js X.Y.Z')
  process.exit(1)
}

const errors = []

// 1. Manifests match
const chrome = JSON.parse(readFileSync('manifest.json', 'utf8'))
const firefox = JSON.parse(readFileSync('manifest.firefox.json', 'utf8'))
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

if (chrome.version !== version) {
  errors.push(`manifest.json is ${chrome.version}, expected ${version}`)
}
if (firefox.version !== version) {
  errors.push(`manifest.firefox.json is ${firefox.version}, expected ${version}`)
}
if (pkg.version !== version) {
  errors.push(`package.json is ${pkg.version}, expected ${version}`)
}

// 2. README badge and filenames
const readme = readFileSync('README.md', 'utf8')
if (!readme.includes(`version-${version}`)) {
  errors.push(`README.md badge missing version ${version}`)
}
if (!readme.includes(`glassy-companion-v${version}.zip`)) {
  errors.push(`README.md missing zip filename`)
}
if (!readme.includes(`glassy-companion-v${version}-firefox.xpi`)) {
  errors.push(`README.md missing xpi filename`)
}

// 3. CHANGELOG entry exists
const changelog = readFileSync('CHANGELOG.md', 'utf8')
if (!changelog.includes(`[${version}]`)) {
  errors.push(`CHANGELOG.md missing [${version}] entry`)
}

// 4. Built assets exist
if (!existsSync(`glassy-companion-v${version}.zip`)) {
  errors.push(`Missing build artifact: glassy-companion-v${version}.zip (run npm run zip)`)
}
if (!existsSync(`glassy-companion-v${version}-firefox.xpi`)) {
  errors.push(`Missing build artifact: glassy-companion-v${version}-firefox.xpi (run npm run zip:firefox)`)
}

if (errors.length) {
  console.error('[pre-flight] FAILED — fix before releasing:')
  errors.forEach(e => console.error('  -', e))
  process.exit(1)
}

console.log(`[pre-flight] All checks passed for v${version}. Ready to tag and release.`)
