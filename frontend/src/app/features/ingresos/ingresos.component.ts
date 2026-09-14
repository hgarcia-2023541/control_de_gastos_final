import { CommonModule } from "@angular/common";
import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { SidebarComponent } from "../../shared/components/sidebar/sidebar.component";
import { DonutChartComponent } from "../../shared/components/donut-chart/donut-chart.component";
import { AuthService } from "../../core/services/auth.service";
import { IngresosService } from "../../core/services/ingresos.service";
import { PeriodoService } from '../../core/services/periodo.service';
import {
  CATEGORIAS_INGRESO,
  FiltrosIngreso,
  Ingreso,
  IngresoFormulario,
  TipoMovimiento,
} from "../../shared/models/ingreso.model";
import { CategoriaGasto } from "../../shared/models/dashboard.model";
import { fechaEnPeriodo, parsearPeriodo, ultimosPeriodos } from "../../shared/utils/periodo.util";

// Fuentes sugeridas para el datalist del formulario (el usuario puede
// escribir cualquier otra, esto solo ayuda con autocompletado)
const FUENTES_SUGERIDAS = ["Trabajo", "Ventas", "Servicios", "Familiar", "Otros"];

// Colores para el donut de "fuentes de ingresos". Se asignan por
// posición (no por nombre fijo) porque la fuente la escribe el
// usuario libremente.
const PALETA_FUENTES = ["#1f3327", "#3f5c46", "#6f8f74", "#8b7355", "#c4a882", "#d9c9b8"];

@Component({
  selector: "app-ingresos",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SidebarComponent, DonutChartComponent],
  templateUrl: "./ingresos.component.html",
  styleUrl: "./ingresos.component.css",
})
export class IngresosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private ingresosService = inject(IngresosService);
  private periodoService = inject(PeriodoService);

  usuario = this.authService.obtenerUsuario();
  inicialUsuario = (this.usuario?.nombre?.charAt(0) ?? "?").toUpperCase();
  categoriasSugeridas = CATEGORIAS_INGRESO;
  fuentesSugeridas = FUENTES_SUGERIDAS;

  // Selector de período: se genera dinámicamente con el mes actual y los
  // anteriores (nunca meses futuros; el backend rechaza fechas futuras).
  periodos = ultimosPeriodos(6);
  periodoSeleccionado = this.periodoService.periodo;
  mostrarSelectorPeriodo = signal(false);

  // --- Datos ---
  // Tabla visible: solo el período seleccionado (comportamiento actual).
  ingresos = signal<Ingreso[]>([]);
  // Lista COMPLETA que devuelve el backend con los filtros: alimenta las
  // tarjetas de "mes" y "año" sin depender del período del selector.
  ingresosCompletos = signal<Ingreso[]>([]);
  cargando = signal(true);
  errorCarga = signal<string | null>(null);

  // --- Filtros ---
  busqueda = signal("");
  fechaInicio = signal("");
  fechaFin = signal("");
  categoriaFiltro = signal("");
  mostrarFiltroFecha = signal(false);
  mostrarFiltroCategoria = signal(false);

  // --- Modal de formulario (crear/editar) ---
  mostrarFormulario = signal(false);
  ingresoEnEdicion = signal<Ingreso | null>(null);
  guardando = signal(false);
  errorFormulario = signal<string | null>(null);

  // Fechas futuras: se bloquean en el input (max) y también aquí como UX;
  // el backend las rechaza además contra la fecha real del servidor.
  fechaMaxima = new Date().toISOString().slice(0, 10);

  formulario = this.fb.group({
    descripcion: ["", [Validators.required, Validators.maxLength(200)]],
    fuente: ["", [Validators.required, Validators.maxLength(100)]],
    categoria: ["", [Validators.required, Validators.maxLength(100)]],
    // Fijo/variable es SOLO una clasificación (sin recurrencia automática).
    tipo: ["variable" as TipoMovimiento, [Validators.required]],
    monto: [null as number | null, [Validators.required, Validators.min(0.01)]],
    fecha: ["", [Validators.required]],
  });

  // --- Confirmación de borrado ---
  ingresoAEliminar = signal<Ingreso | null>(null);
  eliminando = signal(false);

  // --- Mensajes de éxito/error de operaciones ---
  mensajeExito = signal<string | null>(null);
  errorOperacion = signal<string | null>(null);

  // ---------- Datos derivados (cards, tabla, gráfico) ----------

  // La tabla siempre refleja lo último que devolvió el backend con los
  // filtros activos (búsqueda/fecha/categoría ya se mandan al servidor).
  ingresosFiltrados = computed(() => this.ingresos());

  totalFiltrado = computed(() =>
    this.ingresosFiltrados().reduce((suma, i) => suma + i.monto, 0)
  );

  anioSeleccionado = computed(() => parsearPeriodo(this.periodoSeleccionado()).anio);

  ingresosDelMes = computed(() =>
    this.ingresosCompletos()
      .filter((i) => fechaEnPeriodo(i.fecha, this.periodoSeleccionado()))
      .reduce((suma, i) => suma + i.monto, 0)
  );

  ingresosDelAnio = computed(() =>
    this.ingresosCompletos()
      .filter((i) => i.fecha.startsWith(String(this.anioSeleccionado())))
      .reduce((suma, i) => suma + i.monto, 0)
  );

  promedioIngresos = computed(() => {
    const lista = this.ingresosFiltrados();
    return lista.length ? this.totalFiltrado() / lista.length : 0;
  });

  fuentesIngreso = computed<CategoriaGasto[]>(() => {
    const lista = this.ingresos();
    const total = lista.reduce((suma, i) => suma + i.monto, 0);
    if (!total) return [];

    const porFuente = new Map<string, number>();
    for (const ingreso of lista) {
      porFuente.set(ingreso.fuente, (porFuente.get(ingreso.fuente) ?? 0) + ingreso.monto);
    }

    return Array.from(porFuente.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([nombre, monto], i) => ({
        nombre,
        porcentaje: Math.round((monto / total) * 100),
        color: PALETA_FUENTES[i % PALETA_FUENTES.length],
      }));
  });

  ngOnInit(): void {
    this.cargarIngresos();
  }

  private cargarIngresos(): void {
    this.cargando.set(true);
    this.errorCarga.set(null);

    const filtros: FiltrosIngreso = {
      busqueda: this.busqueda() || undefined,
      fechaInicio: this.fechaInicio() || undefined,
      fechaFin: this.fechaFin() || undefined,
      categoria: this.categoriaFiltro() || undefined,
      // NO envíes periodo al backend
    };

    this.ingresosService.obtenerIngresos(filtros).subscribe({
      next: (lista) => {
        // Guardamos la lista completa para las tarjetas de mes/año...
        this.ingresosCompletos.set(lista);
        // ...y la del período para la tabla.
        const periodoActual = this.periodoSeleccionado();
        this.ingresos.set(lista.filter((i) => fechaEnPeriodo(i.fecha, periodoActual)));
        this.cargando.set(false);
      },
      error: () => {
        this.errorCarga.set("No se pudieron cargar tus ingresos.");
        this.cargando.set(false);
      },
    });
  }

  // ---------- Período ----------
  alternarSelectorPeriodo(): void {
    this.mostrarSelectorPeriodo.update((v) => !v);
  }

  seleccionarPeriodo(periodo: string): void {
    this.periodoService.setPeriodo(periodo);
    this.mostrarSelectorPeriodo.set(false);
    this.cargarIngresos();
  }

  // ---------- Filtros ----------
  onBusquedaCambiada(valor: string): void {
    this.busqueda.set(valor);
    this.cargarIngresos();
  }

  alternarFiltroFecha(): void {
    this.mostrarFiltroFecha.update((v) => !v);
    this.mostrarFiltroCategoria.set(false);
  }

  alternarFiltroCategoria(): void {
    this.mostrarFiltroCategoria.update((v) => !v);
    this.mostrarFiltroFecha.set(false);
  }

  aplicarFiltroFecha(inicio: string, fin: string): void {
    this.fechaInicio.set(inicio);
    this.fechaFin.set(fin);
    this.mostrarFiltroFecha.set(false);
    this.cargarIngresos();
  }

  limpiarFiltroFecha(): void {
    this.fechaInicio.set("");
    this.fechaFin.set("");
    this.mostrarFiltroFecha.set(false);
    this.cargarIngresos();
  }

  seleccionarCategoriaFiltro(categoria: string): void {
    this.categoriaFiltro.set(categoria);
    this.mostrarFiltroCategoria.set(false);
    this.cargarIngresos();
  }

  limpiarFiltroCategoria(): void {
    this.categoriaFiltro.set("");
    this.mostrarFiltroCategoria.set(false);
    this.cargarIngresos();
  }

  get hayFiltroFechaActivo(): boolean {
    return !!(this.fechaInicio() || this.fechaFin());
  }

  // ---------- Formulario: crear / editar ----------
  abrirFormularioNuevo(): void {
    this.ingresoEnEdicion.set(null);
    this.errorFormulario.set(null);
    this.formulario.reset({
      descripcion: "",
      fuente: "",
      categoria: "",
      tipo: "variable",
      monto: null,
      fecha: new Date().toISOString().slice(0, 10),
    });
    this.mostrarFormulario.set(true);
  }

  abrirFormularioEdicion(ingreso: Ingreso): void {
    this.ingresoEnEdicion.set(ingreso);
    this.errorFormulario.set(null);
    this.formulario.reset({
      descripcion: ingreso.descripcion,
      fuente: ingreso.fuente,
      categoria: ingreso.categoria,
      tipo: (ingreso.tipo as TipoMovimiento) ?? "variable",
      monto: ingreso.monto,
      fecha: ingreso.fecha,
    });
    this.mostrarFormulario.set(true);
  }

  cerrarFormulario(): void {
    if (this.guardando()) return;
    this.mostrarFormulario.set(false);
  }

  guardarIngreso(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const valores = this.formulario.value;
    const fecha = valores.fecha!;

    // Fecha futura: mismo mensaje que envía el backend (consistencia UX).
    if (fecha > this.fechaMaxima) {
      this.errorFormulario.set(
        "No se permiten fechas futuras. La fecha debe ser hoy o anterior."
      );
      return;
    }

    this.guardando.set(true);
    this.errorFormulario.set(null);

    const datos: IngresoFormulario = {
      descripcion: valores.descripcion!.trim(),
      fuente: valores.fuente!.trim(),
      categoria: valores.categoria!.trim(),
      tipo: (valores.tipo as TipoMovimiento) ?? "variable",
      monto: Number(valores.monto),
      fecha,
    };

    const enEdicion = this.ingresoEnEdicion();
    const peticion = enEdicion
      ? this.ingresosService.actualizarIngreso(enEdicion.id, datos)
      : this.ingresosService.crearIngreso(datos);

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.mostrarFormulario.set(false);
        this.mostrarMensajeExito(enEdicion ? "Ingreso actualizado correctamente." : "Ingreso registrado correctamente.");
        this.cargarIngresos();
      },
      error: (err) => {
        this.guardando.set(false);
        this.errorFormulario.set(
          err.error?.mensaje || "No se pudo guardar el ingreso. Verifica los datos e intenta de nuevo."
        );
      },
    });
  }

  // ---------- Eliminar ----------
  pedirConfirmacionEliminar(ingreso: Ingreso): void {
    this.ingresoAEliminar.set(ingreso);
  }

  cancelarEliminacion(): void {
    if (this.eliminando()) return;
    this.ingresoAEliminar.set(null);
  }

  confirmarEliminacion(): void {
    const ingreso = this.ingresoAEliminar();
    if (!ingreso) return;

    this.eliminando.set(true);
    this.ingresosService.eliminarIngreso(ingreso.id).subscribe({
      next: () => {
        this.eliminando.set(false);
        this.ingresoAEliminar.set(null);
        this.mostrarMensajeExito("Ingreso eliminado correctamente.");
        this.cargarIngresos();
      },
      error: (err) => {
        this.eliminando.set(false);
        this.errorOperacion.set(err.error?.mensaje || "No se pudo eliminar el ingreso.");
        this.ingresoAEliminar.set(null);
      },
    });
  }

  private mostrarMensajeExito(texto: string): void {
    this.mensajeExito.set(texto);
    setTimeout(() => this.mensajeExito.set(null), 3500);
  }

  // ---------- Formato ----------
  formatoQuetzales(valor: number): string {
    return valor.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatoFecha(fechaIso: string): string {
    const fecha = new Date(fechaIso + "T00:00:00");
    return fecha.toLocaleDateString("es-GT", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
}