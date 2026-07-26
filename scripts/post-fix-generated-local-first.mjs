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
    if (nextGuard >= 0 && !content.slice(markerIndex, nextGuard).includes('if (!u) return;')) {
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

function patchLocalFirstTests() {
  const file = 'src/shared/lib/localFirst.test.ts'
  let content = fs.readFileSync(file, 'utf8')

  content = content.replace(
    `it("valida licencia offline con ventana de 6 horas", () => {`,
    `it("mantiene la última autorización activa durante una caída de nube", () => {`,
  )
  content = content.replace(
    `    expect(isLicenseValidOffline(expiredCache)).toBe(false);`,
    `    expect(isLicenseValidOffline(expiredCache)).toBe(true);`,
  )
  content = content.replace(
    `it("rechaza write offline desktop con licencia expirada", async () => {`,
    `it("permite write offline con autorización activa aunque la fecha cache haya pasado", async () => {`,
  )
  content = content.replace(
    `    await expect(assertCanWriteOffline("tenant-1", expiredCache)).resolves.toMatchObject({\n      valid: false,\n    });`,
    `    await expect(assertCanWriteOffline("tenant-1", expiredCache)).resolves.toEqual({ valid: true });`,
  )

  fs.writeFileSync(file, content, 'utf8')
}

patchUseAuth()
patchBootstrapInterval()
patchLocalFirstTests()
console.info('Correcciones TypeScript y pruebas post-migración aplicadas.')
