export type TipoCategoria = "ingreso" | "gasto";

export interface Categoria {
  id: number;
  nombre: string;
  tipo: TipoCategoria;
  color: string | null;
  // null = categoría del sistema (no se puede editar/eliminar);
  // con valor = categoría creada por el propio usuario.
  usuarioId: number | null;
}

export interface CategoriaFormulario {
  nombre: string;
  tipo: TipoCategoria;
  color?: string | null;
}