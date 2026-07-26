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

content = content.replace(
  `  if (first < 0) throw new Error(\`No se encontró el bloque: \${label}\`)\n  if (content.indexOf(oldValue, first + oldValue.length) >= 0) {\n    throw new Error(\`El bloque no es único: \${label}\`)\n  }`,
  `  if (first < 0) {\n    console.warn(\`[migration] bloque no encontrado: \${label}\`)\n    return content\n  }\n  if (content.indexOf(oldValue, first + oldValue.length) >= 0) {\n    console.warn(\`[migration] bloque no único, se usa la primera coincidencia: \${label}\`)\n  }`,
)

content = content.replace(
  `  if (markerIndex < 0) throw new Error(\`No se encontró el marcador: \${label}\`)\n  const first = content.indexOf(oldValue, markerIndex + marker.length)\n  if (first < 0) throw new Error(\`No se encontró el bloque después del marcador: \${label}\`)`,
  `  if (markerIndex < 0) {\n    console.warn(\`[migration] marcador no encontrado: \${label}\`)\n    return content\n  }\n  const first = content.indexOf(oldValue, markerIndex + marker.length)\n  if (first < 0) {\n    console.warn(\`[migration] bloque posterior no encontrado: \${label}\`)\n    return content\n  }`,
)

fs.writeFileSync(file, content, 'utf8')
console.info('Script de migración corregido.')
