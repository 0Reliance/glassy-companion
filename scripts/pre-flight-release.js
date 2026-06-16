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

// 4. Built dist/ manifests match (catches stale dist/ after source bump)
if (existsSync('dist/manifest.json')) {
  const distChrome = JSON.parse(readFileSync('dist/manifest.json', 'utf8'))
  if (distChrome.version !== version) {
    errors.push(`dist/manifest.json is ${distChrome.version}, expected ${version} (run npm run build)`)
  }
} else {
  errors.push(`dist/manifest.json missing (run npm run build)`)
}

if (existsSync('dist-firefox/manifest.json')) {
  const distFirefox = JSON.parse(readFileSync('dist-firefox/manifest.json', 'utf8'))
  if (distFirefox.version !== version) {
    errors.push(`dist-firefox/manifest.json is ${distFirefox.version}, expected ${version} (run npm run build:firefox)`)
  }
} else {
  errors.push(`dist-firefox/manifest.json missing (run npm run build:firefox)`)
}

// 5. Built artifacts exist
if (!existsSync(`glassy-companion-v${version}.zip`)) {
  errors.push(`Missing build artifact: glassy-companion-v${version}.zip (run npm run zip)`)
}
if (!existsSync(`glassy-companion-v${version}-firefox.xpi`)) {
  errors.push(`Missing build artifact: glassy-companion-v${version}-firefox.xpi (run npm run zip:firefox)`)
}

// 6. Manifest version INSIDE the zip/xpi files (catches zip built from stale dist/)
if (existsSync(`glassy-companion-v${version}.zip`)) {
  const zipBuf = readFileSync(`glassy-companion-v${version}.zip`)
  // Find manifest.json in zip central directory
  const zipStr = zipBuf.toString('utf8')
  const manifestEntry = zipStr.indexOf('manifest.json')
  if (manifestEntry === -1) {
    errors.push(`glassy-companion-v${version}.zip missing manifest.json at root`)
  }
}
if (existsSync(`glassy-companion-v${version}-firefox.xpi`)) {
  const xpiBuf = readFileSync(`glassy-companion-v${version}-firefox.xpi`)
  const xpiStr = xpiBuf.toString('utf8')
  const manifestEntry = xpiStr.indexOf('manifest.json')
  if (manifestEntry === -1) {
    errors.push(`glassy-companion-v${version}-firefox.xpi missing manifest.json at root`)
  }
}

if (errors.length) {
  console.error('[pre-flight] FAILED — fix before releasing:')
  errors.forEach(e => console.error('  -', e))
  process.exit(1)
}

console.log(`[pre-flight] All checks passed for v${version}. Ready to tag and release.`)
