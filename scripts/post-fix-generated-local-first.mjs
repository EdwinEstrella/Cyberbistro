import fs from 'node:fs'

function patchUseAuth() {
  const file = 'src/shared/hooks/useAuth.ts'
  let content = fs.readFileSync(file, 'utf8')
  const marker = `          const restored = await hydrateLocalFallback();\n          if (!restored) return;`
  const markerIndex = content.indexOf(marker)
  if (markerIndex >= 0) {
    const nextGuard = content.indexOf(
      `      if (hydratedFromLocalSession && !validatedOnlineSession) {`,
      markerIndex + marker.length,
    )
    if (nextGuard >= 0) {
      content = `${content.slice(0, nextGuard)}      if (!u) return;\n\n${content.slice(nextGuard)}`
    }
  } else {
    console.warn('[post-fix] no se encontró el narrowing de useAuth')
  }
  fs.writeFileSync(file, content, 'utf8')
}

function patchBootstrapInterval() {
  const file = 'src/shared/hooks/useLocalFirstBootstrap.ts'
  let content = fs.readFileSync(file, 'utf8')
  if (!content.includes('const lanIntervalId = window.setInterval')) {
    const target = `    const intervalId = window.setInterval(() => {\n      void syncOnlineState(false);\n    }, 15000);`
    const replacement = `${target}\n    const lanIntervalId = window.setInterval(() => {\n      void syncLanEdge(validatedTenantId).catch((error) => {\n        console.warn("Sincronización LAN pendiente:", error);\n      });\n    }, 2000);`
    if (content.includes(target)) content = content.replace(target, replacement)
    else console.warn('[post-fix] no se encontró el intervalo principal')
  }
  fs.writeFileSync(file, content, 'utf8')
}

patchUseAuth()
patchBootstrapInterval()
console.info('Correcciones TypeScript post-migración aplicadas.')
