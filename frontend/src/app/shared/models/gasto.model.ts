export type TipoMovimiento = "fijo" | "variable";

export interface Gasto {
  id: number;
  descripcion: string;
  categoria: string;
  tipo: TipoMovimiento;
  monto: number;
  fecha: string; // "yyyy-mm-dd"
}

export interface GastoFormulario {
  descripcion: string;
  categoria: string;
  tipo: TipoMovimiento;
  monto: number;
  fecha: string;
}

export interface FiltrosGasto {
  busqueda?: string;
  fechaInicio?: string;
  fechaFin?: string;
  categoria?: string;
}

// Categorías sugeridas para el formulario y el filtro. La columna
// "categoria" de gastos/ingresos sigue siendo texto libre: cuando se
// use el módulo real de Categorías, estas listas se pueden reemplazar
// por datos de la API sin tocar el modelo de Gasto.
export const CATEGORIAS_GASTO = [
  "Alimentación",
  "Transporte",
  "Educación",
  "Entretenimiento",
  "Hogar",
  "Salud",
  "Otros",
];