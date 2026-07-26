import fs from 'node:fs'

const file = 'scripts/apply-true-local-first.mjs'
let content = fs.readFileSync(file, 'utf8')

content = content.replace(
  `content = content.replaceAll('if (Boolean((window as any).electronAPI)) {', 'if (localFirstRuntime) {')`,
  `content = content.replaceAll('if (Boolean((window as any).electronAPI)) {', 'if (isLocalFirstEnabled()) {')`,
)

content = content.replace(
  `  content = replaceAfter(\n    content,\n    \`        if (!u) {\\n          return;\\n        }\`,\n    \`        if (!u) {\\n          return;\\n        }\`,\n    \`        if (!u) {\\n          const restored = await hydrateLocalFallback();\\n          if (!restored) return;\\n        }\`,\n    'fallback tras reintentos auth',\n  )`,
  `  content = replaceOnce(\n    content,\n    \`        if (!u) {\\n          return;\\n        }\`,\n    \`        if (!u) {\\n          const restored = await hydrateLocalFallback();\\n          if (!restored) return;\\n        }\`,\n    'fallback tras reintentos auth',\n  )`,
)

content = content.replace(
  `  content = content.replace(\n    \`      args.onTableDone?.(tableName, rowCount);\\n    }\`,`,
  `  content = content.replaceAll(\n    \`      args.onTableDone?.(tableName, rowCount);\\n    }\`,`,
)

fs.writeFileSync(file, content, 'utf8')
console.info('Script de migración corregido.')
