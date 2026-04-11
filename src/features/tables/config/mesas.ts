// Configuración estática de las 20 mesas del restaurante
// Las mesas son fijas y no dependen de la base de datos

export interface MesaConfig {
  id: number;
  numero: number;
  fila: number;    // base 1 (igual que CSS grid)
  columna: number; // base 1 (igual que CSS grid)
  capacidad: number;
}

// 20 mesas organizadas en 4 filas x 5 columnas
export const MESAS_CONFIG: MesaConfig[] = [
  // Fila 1: mesas 01 - 05
  { id: 1,  numero: 1,  fila: 1, columna: 1, capacidad: 4 },
  { id: 2,  numero: 2,  fila: 1, columna: 2, capacidad: 4 },
  { id: 3,  numero: 3,  fila: 1, columna: 3, capacidad: 4 },
  { id: 4,  numero: 4,  fila: 1, columna: 4, capacidad: 4 },
  { id: 5,  numero: 5,  fila: 1, columna: 5, capacidad: 4 },

  // Fila 2: mesas 06 - 10
  { id: 6,  numero: 6,  fila: 2, columna: 1, capacidad: 4 },
  { id: 7,  numero: 7,  fila: 2, columna: 2, capacidad: 4 },
  { id: 8,  numero: 8,  fila: 2, columna: 3, capacidad: 4 },
  { id: 9,  numero: 9,  fila: 2, columna: 4, capacidad: 4 },
  { id: 10, numero: 10, fila: 2, columna: 5, capacidad: 4 },

  // Fila 3: mesas 11 - 15
  { id: 11, numero: 11, fila: 3, columna: 1, capacidad: 4 },
  { id: 12, numero: 12, fila: 3, columna: 2, capacidad: 4 },
  { id: 13, numero: 13, fila: 3, columna: 3, capacidad: 4 },
  { id: 14, numero: 14, fila: 3, columna: 4, capacidad: 4 },
  { id: 15, numero: 15, fila: 3, columna: 5, capacidad: 4 },

  // Fila 4: mesas 16 - 20
  { id: 16, numero: 16, fila: 4, columna: 1, capacidad: 4 },
  { id: 17, numero: 17, fila: 4, columna: 2, capacidad: 4 },
  { id: 18, numero: 18, fila: 4, columna: 3, capacidad: 4 },
  { id: 19, numero: 19, fila: 4, columna: 4, capacidad: 4 },
  { id: 20, numero: 20, fila: 4, columna: 5, capacidad: 4 },
];