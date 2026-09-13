import { describe, expect, it } from "vitest"
import { PrinterValidationCache } from "./printerValidationCache"

describe("PrinterValidationCache", () => {
  it("refreshes asynchronously and reuses a fresh validation", async () => {
    let now = 0
    let resolveLookup: ((printers: Array<{ name: string }>) => void) | undefined
    const lookup = () => new Promise<Array<{ name: string }>>((resolve) => {
      resolveLookup = resolve
    })
    const cache = new PrinterValidationCache(30_000, () => now)

    expect(cache.observe("Thermal", lookup)).toBeUndefined()
    resolveLookup?.([{ name: "Thermal" }])
    await Promise.resolve()
    await Promise.resolve()

    expect(cache.observe("Thermal", lookup)).toBe(true)
    expect(cache.observe("Kitchen", lookup)).toBe(false)
    now = 30_001
    expect(cache.observe("Thermal", lookup)).toBeUndefined()
  })

  it("discards an in-flight result after invalidation", async () => {
    let resolveLookup: ((printers: Array<{ name: string }>) => void) | undefined
    const cache = new PrinterValidationCache()

    expect(cache.observe("Old thermal", () => new Promise((resolve) => {
      resolveLookup = resolve
    }))).toBeUndefined()
    cache.invalidate()
    resolveLookup?.([{ name: "Old thermal" }])
    await Promise.resolve()
    await Promise.resolve()

    expect(cache.observe("New thermal", async () => [{ name: "New thermal" }])).toBeUndefined()
    await Promise.resolve()
    expect(cache.observe("New thermal", async () => [])).toBe(true)
  })
})
