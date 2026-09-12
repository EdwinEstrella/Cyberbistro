const fs = require('node:fs')
const path = require('node:path')

const mainPath = path.resolve(__dirname, '..', 'dist-electron', 'main.js')

if (!fs.existsSync(mainPath)) {
  console.error(`Missing Electron main bundle: ${mainPath}`)
  process.exit(1)
}

const source = fs.readFileSync(mainPath, 'utf8')
const failures = []

const forbiddenPatterns = [
  {
    pattern: /@insforge\/sdk/,
    message: 'Found an InsForge SDK reference in Electron main output.',
  },
  {
    pattern: /require\(["']bufferutil["']\)/,
    message: 'Found unresolved optional native dependency require("bufferutil") in Electron main output.',
  },
  {
    pattern: /require\(["']utf-8-validate["']\)/,
    message: 'Found unresolved optional native dependency require("utf-8-validate") in Electron main output.',
  },
]

for (const check of forbiddenPatterns) {
  if (check.pattern.test(source)) {
    failures.push(check.message)
  }
}

if (failures.length > 0) {
  console.error('Electron main externalization regression detected:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Electron main output verified: InsForge and optional ws native references are absent.')
