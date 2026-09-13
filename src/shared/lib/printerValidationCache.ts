const PRINTER_VALIDATION_TTL_MS = 30_000

type PrinterLookup = () => Promise<Array<{ name: string }>>

export class PrinterValidationCache {
  private result: { names: Set<string>; checkedAt: number } | null = null
  private pending: { generation: number } | null = null
  private generation = 0

  constructor(
    private readonly ttlMs = PRINTER_VALIDATION_TTL_MS,
    private readonly now = () => Date.now()
  ) {}

  observe(printerName: string, listPrinters: PrinterLookup): boolean | undefined {
    const cached = this.result
    if (cached && this.now() - cached.checkedAt < this.ttlMs) {
      return cached.names.has(printerName)
    }

    if (!this.pending) {
      const generation = this.generation
      this.pending = { generation }
      void listPrinters()
        .then((printers) => {
          if (this.generation === generation) {
            this.result = {
              names: new Set(printers.map((printer) => printer.name)),
              checkedAt: this.now(),
            }
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (this.pending?.generation === generation) this.pending = null
        })
    }

    return undefined
  }

  invalidate(): void {
    this.generation += 1
    this.result = null
    this.pending = null
  }
}

const printerValidationCache = new PrinterValidationCache()

export function observePrinterValidation(printerName: string, listPrinters: PrinterLookup): boolean | undefined {
  return printerValidationCache.observe(printerName, listPrinters)
}

export function invalidatePrinterValidation(): void {
  printerValidationCache.invalidate()
}
