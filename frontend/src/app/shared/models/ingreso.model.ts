export type TipoMovimiento = "fijo" | "variable";

export interface Ingreso {
  id: number;
  descripcion: string;
  fuente: string;
  categoria: string;
  tipo: TipoMovimiento;
  monto: number;
  fecha: string; // "yyyy-mm-dd"
}

// Lo que se manda al backend al crear/editar (sin id, sin usuario:
// el usuario lo pone el backend a partir del token)
export interface IngresoFormulario {
  descripcion: string;
  fuente: string;
  categoria: string;
  tipo: TipoMovimiento;
  monto: number;
  fecha: string;
}

export interface FiltrosIngreso {
  busqueda?: string;
  fechaInicio?: string;
  fechaFin?: string;
  categoria?: string;
}

// Categorías/fuentes sugeridas para el formulario y el filtro. No es
// una tabla aparte en la base de datos (el prompt no lo pidió así);
// el usuario puede escribir la que quiera, esto solo ayuda con
// sugerencias consistentes.
export const CATEGORIAS_INGRESO = ["Salario", "Ventas", "Servicios", "Mesada", "Otros"];