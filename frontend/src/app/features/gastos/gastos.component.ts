import { CommonModule } from "@angular/common";
import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { SidebarComponent } from "../../shared/components/sidebar/sidebar.component";
import { DonutChartComponent } from "../../shared/components/donut-chart/donut-chart.component";
import { forkJoin } from "rxjs";
import { AuthService } from "../../core/services/auth.service";
import { GastosService } from "../../core/services/gastos.service";
import { IngresosService } from "../../core/services/ingresos.service";
import { PeriodoService } from "../../core/services/periodo.service";
import {
  CATEGORIAS_GASTO,
  FiltrosGasto,
  Gasto,
  GastoFormulario,
  TipoMovimiento,
} from "../../shared/models/gasto.model";
import { Ingreso } from "../../shared/models/ingreso.model";
import { CategoriaGasto } from "../../shared/models/dashboard.model";
import { fechaEnPeriodo, parsearPeriodo, ultimosPeriodos } from "../../shared/utils/periodo.util";

const COLOR_POR_CATEGORIA: Record<string, string> = {
  Alimentación: "#1f3327",
  Transporte: "#8b7355",
  Entretenimiento: "#c4a882",
  Hogar: "#6f8f74",
  Educación: "#a05a3a",
  Salud: "#7a5c3e",
  Otros: "#d9c9b8",
};
const PALETA_RESPALDO = ["#1f3327", "#3f5c46", "#6f8f74", "#8b7355", "#c4a882", "#d9c9b8"];

@Component({
  selector: "app-gastos",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SidebarComponent, DonutChartComponent],
  templateUrl: "./gastos.component.html",
  styleUrl: "./gastos.component.css",
})
export class GastosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private gastosService = inject(GastosService);
  private ingresosService = inject(IngresosService);
  private periodoService = inject(PeriodoService);

  usuario = this.authService.obtenerUsuario();
  inicialUsuario = (this.usuario?.nombre?.charAt(0) ?? "?").toUpperCase();
  categoriasSugeridas = CATEGORIAS_GASTO;

  // Selector de período: se genera dinámicamente con el mes actual y los
  // anteriores (nunca meses futuros; el backend rechaza fechas futuras).
  periodos = ultimosPeriodos(6);
  periodoSeleccionado = this.periodoService.periodo;
  mostrarSelectorPeriodo = signal(false);

  // Tabla visible: solo el período seleccionado (comportamiento actual).
  gastos = signal<Gasto[]>([]);
  // Lista COMPLETA que devuelve el backend: alimenta las tarjetas de mes/año.
  gastosCompletos = signal<Gasto[]>([]);
  // Ingresos del usuario (todas las fechas): alimentan la tarjeta
  // "Dinero disponible" = ingresos del mes − gastos del mes.
  ingresos = signal<Ingreso[]>([]);
  cargando = signal(true);
  errorCarga = signal<string | null>(null);

  busqueda = signal("");
  fechaInicio = signal("");
  fechaFin = signal("");
  categoriaFiltro = signal("");
  mostrarFiltroFecha = signal(false);
  mostrarFiltroCategoria = signal(false);

  mostrarFormulario = signal(false);
  gastoEnEdicion = signal<Gasto | null>(null);
  guardando = signal(false);
  errorFormulario = signal<string | null>(null);

  // Fechas futuras: se bloquean en el input (max) y también aquí como UX;
  // el backend las rechaza además contra la fecha real del servidor.
  fechaMaxima = new Date().toISOString().slice(0, 10);

  formulario = this.fb.group({
    descripcion: ["", [Validators.required, Validators.maxLength(200)]],
    categoria: ["", [Validators.required, Validators.maxLength(100)]],
    // Fijo/variable es SOLO una clasificación (sin recurrencia automática).
    tipo: ["variable" as TipoMovimiento, [Validators.required]],
    monto: [null as number | null, [Validators.required, Validators.min(0.01)]],
    fecha: ["", [Validators.required]],
  });

  gastoAEliminar = signal<Gasto | null>(null);
  eliminando = signal(false);

  mensajeExito = signal<string | null>(null);
  errorOperacion = signal<string | null>(null);

  gastosFiltrados = computed(() => this.gastos());

  anioSeleccionado = computed(() => parsearPeriodo(this.periodoSeleccionado()).anio);

  gastosDelMes = computed(() =>
    this.gastosCompletos()
      .filter((g) => fechaEnPeriodo(g.fecha, this.periodoSeleccionado()))
      .reduce((suma, g) => suma + g.monto, 0)
  );

  gastosDelAnio = computed(() =>
    this.gastosCompletos()
      .filter((g) => g.fecha.startsWith(String(this.anioSeleccionado())))
      .reduce((suma, g) => suma + g.monto, 0)
  );

  ingresosDelMes = computed(() =>
    this.ingresos()
      .filter((i) => fechaEnPeriodo(i.fecha, this.periodoSeleccionado()))
      .reduce((suma, i) => suma + i.monto, 0)
  );

  // Regla de negocio: dinero disponible = ingresos del mes − gastos del mes.
  dineroDisponible = computed(() => this.ingresosDelMes() - this.gastosDelMes());
  disponibleNegativo = computed(() => this.dineroDisponible() < 0);

  gastosPorCategoria = computed<CategoriaGasto[]>(() => {
    const lista = this.gastos();
    const total = lista.reduce((suma, g) => suma + g.monto, 0);
    if (!total) return [];

    const porCategoria = new Map<string, number>();
    for (const gasto of lista) {
      porCategoria.set(gasto.categoria, (porCategoria.get(gasto.categoria) ?? 0) + gasto.monto);
    }

    return Array.from(porCategoria.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([nombre, monto], i) => ({
        nombre,
        porcentaje: Math.round((monto / total) * 100),
        color: COLOR_POR_CATEGORIA[nombre] ?? PALETA_RESPALDO[i % PALETA_RESPALDO.length],
      }));
  });

  ngOnInit(): void {
    this.cargarGastos();
  }

  private cargarGastos(): void {
    this.cargando.set(true);
    this.errorCarga.set(null);

    const filtros: FiltrosGasto = {
      busqueda: this.busqueda() || undefined,
      fechaInicio: this.fechaInicio() || undefined,
      fechaFin: this.fechaFin() || undefined,
      categoria: this.categoriaFiltro() || undefined,
    };

    // Se piden también los ingresos (todas las fechas) para poder
    // calcular la tarjeta "Dinero disponible" del mes seleccionado.
    forkJoin({
      gastos: this.gastosService.obtenerGastos(filtros),
      ingresos: this.ingresosService.obtenerIngresos(),
    }).subscribe({
      next: ({ gastos, ingresos }) => {
        this.gastosCompletos.set(gastos);
        this.ingresos.set(ingresos);

        const periodo = this.periodoSeleccionado();
        this.gastos.set(gastos.filter((g) => fechaEnPeriodo(g.fecha, periodo)));
        this.cargando.set(false);
      },
      error: () => {
        this.errorCarga.set("No se pudieron cargar los gastos.");
        this.cargando.set(false);
      },
    });
  }

  alternarSelectorPeriodo(): void {
    this.mostrarSelectorPeriodo.update((v) => !v);
  }

  seleccionarPeriodo(periodo: string): void {
    this.periodoService.setPeriodo(periodo);
    this.mostrarSelectorPeriodo.set(false);
    this.cargarGastos();
  }

  onBusquedaCambiada(valor: string): void {
    this.busqueda.set(valor);
    this.cargarGastos();
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
    this.cargarGastos();
  }

  limpiarFiltroFecha(): void {
    this.fechaInicio.set("");
    this.fechaFin.set("");
    this.mostrarFiltroFecha.set(false);
    this.cargarGastos();
  }

  seleccionarCategoriaFiltro(categoria: string): void {
    this.categoriaFiltro.set(categoria);
    this.mostrarFiltroCategoria.set(false);
    this.cargarGastos();
  }

  limpiarFiltroCategoria(): void {
    this.categoriaFiltro.set("");
    this.mostrarFiltroCategoria.set(false);
    this.cargarGastos();
  }

  get hayFiltroFechaActivo(): boolean {
    return !!(this.fechaInicio() || this.fechaFin());
  }

  // Distingue el mensaje de "no hay nada todavía" (primer uso, sin
  // filtros) del de "no hay nada que coincida" (el usuario buscó o
  // filtró y no hubo resultados) — mensajes previstos en el maquetado.
  get hayAlgunFiltroActivo(): boolean {
    return !!(this.busqueda() || this.fechaInicio() || this.fechaFin() || this.categoriaFiltro());
  }

  abrirFormularioNuevo(): void {
    this.gastoEnEdicion.set(null);
    this.errorFormulario.set(null);
    this.formulario.reset({
      descripcion: "",
      categoria: "",
      tipo: "variable",
      monto: null,
      fecha: new Date().toISOString().slice(0, 10),
    });
    this.mostrarFormulario.set(true);
  }

  abrirFormularioEdicion(gasto: Gasto): void {
    this.gastoEnEdicion.set(gasto);
    this.errorFormulario.set(null);
    this.formulario.reset({
      descripcion: gasto.descripcion,
      categoria: gasto.categoria,
      tipo: (gasto.tipo as TipoMovimiento) ?? "variable",
      monto: gasto.monto,
      fecha: gasto.fecha,
    });
    this.mostrarFormulario.set(true);
  }

  cerrarFormulario(): void {
    if (this.guardando()) return;
    this.mostrarFormulario.set(false);
  }

  guardarGasto(): void {
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

    const datos: GastoFormulario = {
      descripcion: valores.descripcion!.trim(),
      categoria: valores.categoria!.trim(),
      tipo: (valores.tipo as TipoMovimiento) ?? "variable",
      monto: Number(valores.monto),
      fecha,
    };

    const enEdicion = this.gastoEnEdicion();
    const peticion = enEdicion
      ? this.gastosService.actualizarGasto(enEdicion.id, datos)
      : this.gastosService.crearGasto(datos);

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.mostrarFormulario.set(false);
        this.mostrarMensajeExito(enEdicion ? "Gasto actualizado correctamente." : "Gasto registrado correctamente.");
        this.cargarGastos();
      },
      error: (err) => {
        this.guardando.set(false);
        // Un 409 trae el mensaje claro de fondos insuficientes del
        // backend ("No tienes fondos suficientes. Tu dinero disponible
        // para este mes es Q X."), nunca un 500.
        this.errorFormulario.set(
          err.error?.mensaje || "No se pudo guardar el gasto. Verifica los datos e intenta de nuevo."
        );
      },
    });
  }

  pedirConfirmacionEliminar(gasto: Gasto): void {
    this.gastoAEliminar.set(gasto);
  }

  cancelarEliminacion(): void {
    if (this.eliminando()) return;
    this.gastoAEliminar.set(null);
  }

  confirmarEliminacion(): void {
    const gasto = this.gastoAEliminar();
    if (!gasto) return;

    this.eliminando.set(true);
    this.gastosService.eliminarGasto(gasto.id).subscribe({
      next: () => {
        this.eliminando.set(false);
        this.gastoAEliminar.set(null);
        this.mostrarMensajeExito("Gasto eliminado correctamente.");
        this.cargarGastos();
      },
      error: (err) => {
        this.eliminando.set(false);
        this.errorOperacion.set(err.error?.mensaje || "No se pudo eliminar el gasto.");
        this.gastoAEliminar.set(null);
      },
    });
  }

  private mostrarMensajeExito(texto: string): void {
    this.mensajeExito.set(texto);
    setTimeout(() => this.mensajeExito.set(null), 3500);
  }

  formatoQuetzales(valor: number): string {
    return valor.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatoFecha(fechaIso: string): string {
    const fecha = new Date(fechaIso + "T00:00:00");
    return fecha.toLocaleDateString("es-GT", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
}