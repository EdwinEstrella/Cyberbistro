// Configuración dinámica de las mesas

export interface MesaConfig {
  id: number;
  numero: number;
  fila: number;    // base 1 (igual que CSS grid)
  columna: number; // base 1 (igual que CSS grid)
  capacidad: number;
}

export function generateMesasConfig(cantidad: number): MesaConfig[] {
  return Array.from({ length: Math.max(1, cantidad) }, (_, i) => {
    const numero = i + 1;
    return {
      id: numero,
      numero: numero,
      fila: Math.ceil(numero / 5), // 5 columnas fijas por fila para mantener la estética
      columna: ((numero - 1) % 5) + 1,
      capacidad: 4, // Capacidad base
    };
  });
}