import { describe, expect, it } from "vitest"
import { ThermalPrintQueue } from "../electron/thermalPrintQueue"

describe("ThermalPrintQueue", () => {
  it("does not start the next receipt until the active job completes", async () => {
    const queue = new ThermalPrintQueue()
    const events: string[] = []
    let finishFirst: (() => void) | undefined

    const first = queue.enqueue(async () => {
      events.push("first:start")
      await new Promise<void>((resolve) => {
        finishFirst = resolve
      })
      events.push("first:complete")
    })
    const second = queue.enqueue(async () => {
      events.push("second:start")
    })

    await Promise.resolve()
    expect(events).toEqual(["first:start"])

    finishFirst?.()
    await Promise.all([first, second])
    expect(events).toEqual(["first:start", "first:complete", "second:start"])
  })

  it("continues with the next receipt after a failed job", async () => {
    const queue = new ThermalPrintQueue()
    const second = queue.enqueue(async () => {
      throw new Error("printer unavailable")
    })
    const third = queue.enqueue(async () => "printed")

    await expect(second).rejects.toThrow("printer unavailable")
    await expect(third).resolves.toBe("printed")
  })
})
