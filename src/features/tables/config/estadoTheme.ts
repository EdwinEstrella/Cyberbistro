export type MesaEstadoVisual = "libre" | "ocupada" | "limpieza";

export const estadoColors: Record<
  MesaEstadoVisual,
  { border: string; bg: string; text: string; dot: string }
> = {
  libre: {
    border: "rgba(89,238,80,0.5)",
    bg: "rgba(89,238,80,0.06)",
    text: "#59ee50",
    dot: "#59ee50",
  },
  ocupada: {
    border: "rgba(255,113,108,0.5)",
    bg: "rgba(255,113,108,0.06)",
    text: "#ff716c",
    dot: "#ff716c",
  },
  limpieza: {
    border: "rgba(255,144,109,0.5)",
    bg: "rgba(255,144,109,0.06)",
    text: "#ff906d",
    dot: "#ff906d",
  },
};

export const estadoLabels: Record<MesaEstadoVisual, string> = {
  libre: "Libre",
  ocupada: "Ocupada",
  limpieza: "Limpieza",
};
