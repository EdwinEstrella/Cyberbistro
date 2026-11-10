import { useMemo, useState } from "react";
import {
  buildMonthOptions,
  executeFormato607Export,
  previousMonthValue,
} from "../../contabilidad/lib/formato607Export";
import type { ConsumoSummaryResult } from "../../contabilidad/lib/formato607";
import { ExportFormato607View } from "./ExportFormato607View";

export interface ExportFormato607Props {
  tenantId?: string | null;
}

export function ExportFormato607({ tenantId }: ExportFormato607Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => previousMonthValue());
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<ConsumoSummaryResult | null>(null);

  const monthOptions = useMemo(() => buildMonthOptions(), []);

  async function handleExport(format: "txt" | "csv") {
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { successMessage: msg, dataResult } = await executeFormato607Export(
        tenantId,
        selectedMonth,
        format
      );
      setSummary(dataResult.summary);
      setSuccessMessage(msg);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Error al generar el Formato 607."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ExportFormato607View
      selectedMonth={selectedMonth}
      monthOptions={monthOptions}
      loading={loading}
      errorMessage={errorMessage}
      successMessage={successMessage}
      summary={summary}
      onMonthChange={setSelectedMonth}
      onExport={handleExport}
    />
  );
}
