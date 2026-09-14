import { CommonModule } from "@angular/common";
import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { SidebarComponent } from "../../shared/components/sidebar/sidebar.component";
import { AuthService } from "../../core/services/auth.service";
import { CategoriasService } from "../../core/services/categorias.service";
import { Categoria, TipoCategoria } from "../../shared/models/categoria.model";

// Colores sugeridos para las categorías nuevas (el usuario también puede
// elegir cualquier otro con el selector de color del formulario).
const COLORES_SUGERIDOS = [
  "#1f3327",
  "#3f5c46",
  "#6f8f74",
  "#8b7355",
  "#c4a882",
  "#a05a3a",
  "#7a5c3e",
  "#d9c9b8",
];

@Component({
  selector: "app-categorias",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SidebarComponent],
  templateUrl: "./categorias.component.html",
  styleUrl: "./categorias.component.css",
})
export class CategoriasComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private categoriasService = inject(CategoriasService);

  usuario = this.authService.obtenerUsuario();
  inicialUsuario = (this.usuario?.nombre?.charAt(0) ?? "?").toUpperCase();

  cargando = signal(true);
  errorCarga = signal<string | null>(null);
  categorias = signal<Categoria[]>([]);

  // Pestaña activa: categorías de gasto (por defecto) o de ingreso.
  tipoActivo: TipoCategoria = "gasto";

  mostrarFormulario = signal(false);
  categoriaEnEdicion = signal<Categoria | null>(null);
  guardando = signal(false);
  errorFormulario = signal<string | null>(null);

  categoriaAEliminar = signal<Categoria | null>(null);
  eliminando = signal(false);

  mensajeExito = signal<string | null>(null);
  errorOperacion = signal<string | null>(null);

  formulario = this.fb.group({
    nombre: ["", [Validators.required, Validators.maxLength(60)]],
    color: ["#c4a882"],
  });

  categoriasDelTipo = computed(() =>
    this.categorias().filter((c) => c.tipo === this.tipoActivo)
  );

  ngOnInit(): void {
    this.cargarCategorias();
  }

  private cargarCategorias(): void {
    this.cargando.set(true);
    this.errorCarga.set(null);
    this.categoriasService.obtenerCategorias().subscribe({
      next: (lista) => {
        this.categorias.set(lista);
        this.cargando.set(false);
      },
      error: () => {
        this.errorCarga.set("No se pudieron cargar las categorías.");
        this.cargando.set(false);
      },
    });
  }

  seleccionarTipo(tipo: TipoCategoria): void {
    this.tipoActivo = tipo;
  }

  abrirFormularioNuevo(): void {
    this.categoriaEnEdicion.set(null);
    this.errorFormulario.set(null);
    this.formulario.reset({
      nombre: "",
      color: COLORES_SUGERIDOS[this.categoriasDelTipo().length % COLORES_SUGERIDOS.length],
    });
    this.mostrarFormulario.set(true);
  }

  abrirFormularioEdicion(categoria: Categoria): void {
    // Las categorías del sistema (usuarioId === null) no se editan.
    if (categoria.usuarioId === null) return;

    this.categoriaEnEdicion.set(categoria);
    this.errorFormulario.set(null);
    this.formulario.reset({
      nombre: categoria.nombre,
      color: categoria.color ?? "#c4a882",
    });
    this.mostrarFormulario.set(true);
  }

  cerrarFormulario(): void {
    if (this.guardando()) return;
    this.mostrarFormulario.set(false);
  }

  guardar(): void {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid) return;

    const nombre = this.formulario.value.nombre?.trim() ?? "";
    if (!nombre) {
      this.errorFormulario.set("El nombre de la categoría es obligatorio.");
      return;
    }

    const color = (this.formulario.value.color ?? "").trim() || null;
    this.guardando.set(true);
    this.errorFormulario.set(null);

    const enEdicion = this.categoriaEnEdicion();
    const peticion = enEdicion
      ? this.categoriasService.actualizarCategoria(enEdicion.id, {
          nombre,
          tipo: enEdicion.tipo,
          color,
        })
      : this.categoriasService.crearCategoria({
          nombre,
          tipo: this.tipoActivo,
          color,
        });

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.mostrarFormulario.set(false);
        this.mostrarMensajeExito(
          enEdicion
            ? "Categoría actualizada correctamente."
            : "Categoría creada correctamente."
        );
        this.cargarCategorias();
      },
      error: (err) => {
        this.guardando.set(false);
        this.errorFormulario.set(
          err.error?.mensaje || "No se pudo guardar la categoría."
        );
      },
    });
  }

  pedirConfirmacionEliminar(categoria: Categoria): void {
    // Las categorías del sistema no se eliminan.
    if (categoria.usuarioId === null) return;
    this.categoriaAEliminar.set(categoria);
  }

  cancelarEliminacion(): void {
    if (this.eliminando()) return;
    this.categoriaAEliminar.set(null);
  }

  confirmarEliminacion(): void {
    const categoria = this.categoriaAEliminar();
    if (!categoria) return;

    this.eliminando.set(true);
    this.categoriasService.eliminarCategoria(categoria.id).subscribe({
      next: () => {
        this.eliminando.set(false);
        this.categoriaAEliminar.set(null);
        this.mostrarMensajeExito("Categoría eliminada correctamente.");
        this.cargarCategorias();
      },
      error: (err) => {
        this.eliminando.set(false);
        this.errorOperacion.set(
          err.error?.mensaje || "No se pudo eliminar la categoría."
        );
        this.categoriaAEliminar.set(null);
      },
    });
  }

  private mostrarMensajeExito(texto: string): void {
    this.mensajeExito.set(texto);
    setTimeout(() => this.mensajeExito.set(null), 3500);
  }
}