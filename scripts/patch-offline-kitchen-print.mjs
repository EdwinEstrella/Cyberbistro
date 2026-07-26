import fs from 'node:fs';

function replaceOnce(filePath, oldText, newText) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (!source.includes(oldText)) {
    throw new Error(`No se encontró el bloque esperado en ${filePath}`);
  }
  fs.writeFileSync(filePath, source.replace(oldText, newText));
}

const dashboardPath = 'src/features/dashboard/components/Dashboard.tsx';
const oldDashboardBlock = `        if (tenantRow) {
          const paperWidthMm = getThermalPrintSettings().paperWidthMm;
          const tr = tenantRow as {
            nombre_negocio: string | null;
            rnc: string | null;
            direccion: string | null;
            telefono: string | null;
            logo_url: string | null;
            moneda?: string | null;
            logo_size_px?: number;
            logo_offset_x?: number;
            logo_offset_y?: number;
          };
          const comandaHtml = buildComandaReceiptHtml(
            {
              nombre_negocio: tr.nombre_negocio,
              rnc: tr.rnc,
              direccion: tr.direccion,
              telefono: tr.telefono,
              logo_url: tr.logo_url,
              moneda: tr.moneda ?? null,
              logo_size_px: tr.logo_size_px,
              logo_offset_x: tr.logo_offset_x,
              logo_offset_y: tr.logo_offset_y,
            },
              {
                id: data.id,
                numero_comanda: (data as { numero_comanda?: number }).numero_comanda,
                mesa_numero: data.mesa_numero,
                items:
                  ((data as any).items as Array<{
                    nombre: string;
                    cantidad: number;
                    precio?: number;
                    categoria?: string;
                    notas?: string;
                  }>) || [],
                notas: (data as any).notas || null,
                created_at: data.created_at,
              } as any,
            paperWidthMm
          );
          const printSettings = getThermalPrintSettings();
          if (printSettings.printComandas !== false) {
            const printRes = await printThermalHtml(comandaHtml, { printType: "kitchen" });
            if (!printRes.ok && printRes.error) {
              console.warn("Impresión comanda:", printRes.error);
            }
          }
        }`;

const newDashboardBlock = `        if (!tenantRow) {
          console.warn(
            "Impresión comanda: datos del negocio no disponibles offline; usando encabezado mínimo."
          );
        }

        const paperWidthMm = getThermalPrintSettings().paperWidthMm;
        const tr = (tenantRow ?? {
          nombre_negocio: "Comanda de cocina",
          rnc: null,
          direccion: null,
          telefono: null,
          logo_url: null,
          moneda: "DOP",
        }) as {
          nombre_negocio: string | null;
          rnc: string | null;
          direccion: string | null;
          telefono: string | null;
          logo_url: string | null;
          moneda?: string | null;
          logo_size_px?: number;
          logo_offset_x?: number;
          logo_offset_y?: number;
        };
        const comandaHtml = buildComandaReceiptHtml(
          {
            nombre_negocio: tr.nombre_negocio,
            rnc: tr.rnc,
            direccion: tr.direccion,
            telefono: tr.telefono,
            logo_url: tr.logo_url,
            moneda: tr.moneda ?? null,
            logo_size_px: tr.logo_size_px,
            logo_offset_x: tr.logo_offset_x,
            logo_offset_y: tr.logo_offset_y,
          },
          {
            id: data.id,
            numero_comanda: (data as { numero_comanda?: number }).numero_comanda,
            mesa_numero: data.mesa_numero,
            items:
              ((data as any).items as Array<{
                nombre: string;
                cantidad: number;
                precio?: number;
                categoria?: string;
                notas?: string;
              }>) || [],
            notas: (data as any).notas || null,
            created_at: data.created_at,
          } as any,
          paperWidthMm
        );
        const printSettings = getThermalPrintSettings();
        if (printSettings.printComandas !== false) {
          const printRes = await printThermalHtml(comandaHtml, { printType: "kitchen" });
          if (!printRes.ok) {
            const printError = printRes.error || "Windows no confirmó la impresión.";
            console.warn("Impresión comanda:", printError);
            alert(
              \`La comanda fue guardada correctamente, pero no pudo imprimirse en la impresora de cocina.\n\n\${printError}\n\nRevisá que esté encendida, conectada por cable y sin trabajos pausados.\`
            );
          }
        }`;
replaceOnce(dashboardPath, oldDashboardBlock, newDashboardBlock);

const thermalPrintPath = 'src/shared/lib/thermalPrint.ts';
const oldThermalRouting = `  const shouldBeSilent = options?.silent ?? Boolean(targetPrinter);

  if (api?.printThermal) {`;
const newThermalRouting = `  const shouldBeSilent = options?.silent ?? Boolean(targetPrinter);

  // La configuración guarda el nombre exacto de Windows. Antes de imprimir en
  // silencio verificamos que el dispositivo siga instalado y disponible para
  // evitar que un fallo de la segunda impresora pase inadvertido.
  if (api?.printThermal && targetPrinter && api.listPrinters) {
    try {
      const installedPrinters = await api.listPrinters();
      const targetExists = installedPrinters.some((printer) => printer.name === targetPrinter);
      if (!targetExists) {
        return {
          ok: false,
          error: \`La impresora "\${targetPrinter}" no está disponible en Windows. Volvé a seleccionarla en Cloudix.\`,
        };
      }
    } catch (error) {
      // Si Windows no permite enumerar impresoras, mantenemos el intento real de
      // impresión: la enumeración es diagnóstica y no debe bloquear el ticket.
      console.warn("thermalPrint: no se pudo validar la impresora configurada", error);
    }
  }

  if (api?.printThermal) {`;
replaceOnce(thermalPrintPath, oldThermalRouting, newThermalRouting);

const thermalTestPath = 'src/shared/lib/thermal.test.ts';
let thermalTest = fs.readFileSync(thermalTestPath, 'utf8');
const oldPrinterMock = `        printThermal: vi.fn().mockResolvedValue({ ok: true }),
        minimize: vi.fn(),`;
const newPrinterMock = `        printThermal: vi.fn().mockResolvedValue({ ok: true }),
        listPrinters: vi.fn().mockResolvedValue([
          { name: "GenPrinter", displayName: "GenPrinter", description: "", isDefault: true },
          { name: "KitchPrinter", displayName: "KitchPrinter", description: "", isDefault: false },
          { name: "SalesPrinter", displayName: "SalesPrinter", description: "", isDefault: false },
        ]),
        minimize: vi.fn(),`;
if (!thermalTest.includes(oldPrinterMock)) {
  throw new Error(`No se encontró el mock esperado en ${thermalTestPath}`);
}
thermalTest = thermalTest.replace(oldPrinterMock, newPrinterMock);

const closing = '\n});\n';
const closingIndex = thermalTest.lastIndexOf(closing);
if (closingIndex === -1) throw new Error(`No se encontró el cierre de ${thermalTestPath}`);
const newTest = `

  it("should explain when the configured kitchen printer is missing in Windows", async () => {
    saveThermalPrintSettings({
      paperWidthMm: 80,
      printerName: "GenPrinter",
      kitchenPrinterName: "MissingKitchenPrinter",
      salesPrinterName: "SalesPrinter",
      printComandas: true
    });

    const result = await printThermalHtml("test", { printType: "kitchen" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("MissingKitchenPrinter");
    expect(result.error).toContain("no está disponible en Windows");
    expect((global.window as any).electronAPI.printThermal).not.toHaveBeenCalled();
  });`;
thermalTest = thermalTest.slice(0, closingIndex) + newTest + thermalTest.slice(closingIndex);
fs.writeFileSync(thermalTestPath, thermalTest);

// Estos archivos son únicamente el mecanismo de aplicación remota del parche.
fs.rmSync('scripts/patch-offline-kitchen-print.mjs');
fs.rmSync('.github/workflows/apply-offline-kitchen-print.yml');
