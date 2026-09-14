import { CommonModule } from "@angular/common";
import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { SidebarComponent } from "../../shared/components/sidebar/sidebar.component";
import { LineChartComponent } from "../../shared/components/line-chart/line-chart.component";
import { DonutChartComponent } from "../../shared/components/donut-chart/donut-chart.component";
import { forkJoin } from "rxjs";
import { AuthService } from "../../core/services/auth.service";
import { GastosService } from "../../core/services/gastos.service";
import { IngresosService } from "../../core/services/ingresos.service";
import { PeriodoService } from "../../core/services/periodo.service";
import { Gasto } from "../../shared/models/gasto.model";
import { Ingreso } from "../../shared/models/ingreso.model";
import { CategoriaGasto, PuntoSerieMensual } from "../../shared/models/dashboard.model";
import { parsearPeriodo, ultimosPeriodos } from "../../shared/utils/periodo.util";

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const COLOR_POR_CATEGORIA_GASTO: Record<string, string> = {
  Alimentación: "#1f3327",
  Transporte: "#8b7355",
  Entretenimiento: "#c4a882",
  Hogar: "#6f8f74",
  Educación: "#a05a3a",
  Salud: "#7a5c3e",
  Otros: "#d9c9b8",
};
const PALETA_RESPALDO = ["#1f3327", "#3f5c46", "#6f8f74", "#8b7355", "#c4a882", "#a05a3a"];

@Component({
  selector: "app-reportes",
  standalone: true,
  imports: [CommonModule, SidebarComponent, LineChartComponent, DonutChartComponent],
  templateUrl: "./reportes.component.html",
  styleUrl: "./reportes.component.css",
})
export class ReportesComponent implements OnInit {
  private authService = inject(AuthService);
  private gastosService = inject(GastosService);
  private ingresosService = inject(IngresosService);
  private periodoService = inject(PeriodoService);

  usuario = this.authService.obtenerUsuario();
  inicialUsuario = (this.usuario?.nombre?.charAt(0) ?? "?").toUpperCase();

  periodos = ultimosPeriodos(6);
  periodoSeleccionado = this.periodoService.periodo;
  mostrarSelectorPeriodo = signal(false);

  gastos = signal<Gasto[]>([]);
  ingresos = signal<Ingreso[]>([]);
  cargando = signal(true);
  errorCarga = signal<string | null>(null);

  // El reporte analiza el AÑO del período seleccionado (serie de 12 meses).
  anioSeleccionado = computed(() => parsearPeriodo(this.periodoSeleccionado()).anio);

  gastosDelAnio = computed(() =>
    this.gastos().filter((g) => g.fecha.startsWith(String(this.anioSeleccionado())))
  );

  ingresosDelAnio = computed(() =>
    this.ingresos().filter((i) => i.fecha.startsWith(String(this.anioSeleccionado())))
  );

  // 12 puntos (uno por mes) para el LineChart del año seleccionado.
  serieAnual = computed<PuntoSerieMensual[]>(() => {
    const anio = this.anioSeleccionado();
    return MESES.map((nombreMes, m) => {
      const prefijo = `${anio}-${String(m + 1).padStart(2, "0")}`;
      const ingresos = this.ingresosDelAnio()
        .filter((i) => i.fecha.startsWith(prefijo))
        .reduce((suma, i) => suma + i.monto, 0);
      const gastos = this.gastosDelAnio()
        .filter((g) => g.fecha.startsWith(prefijo))
        .reduce((suma, g) => suma + g.monto, 0);
      return { etiqueta: nombreMes, ingresos, gastos };
    });
  });

  totalesAnuales = computed(() => {
    const serie = this.serieAnual();
    const ingresos = serie.reduce((suma, p) => suma + p.ingresos, 0);
    const gastos = serie.reduce((suma, p) => suma + p.gastos, 0);
    return { ingresos, gastos, disponible: ingresos - gastos };
  });

  tablaMensual = computed(() =>
    this.serieAnual().map((p) => ({
      mes: p.etiqueta,
      ingresos: p.ingresos,
      gastos: p.gastos,
      disponible: p.ingresos - p.gastos,
    }))
  );

  gastosPorCategoria = computed<CategoriaGasto[]>(() => {
    const lista = this.gastosDelAnio();
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
        color: COLOR_POR_CATEGORIA_GASTO[nombre] ?? PALETA_RESPALDO[i % PALETA_RESPALDO.length],
      }));
  });

  ingresosPorFuente = computed<CategoriaGasto[]>(() => {
    const lista = this.ingresosDelAnio();
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
        color: PALETA_RESPALDO[i % PALETA_RESPALDO.length],
      }));
  });

  ngOnInit(): void {
    this.cargarDatos();
  }

  private cargarDatos(): void {
    this.cargando.set(true);
    this.errorCarga.set(null);

    forkJoin({
      gastos: this.gastosService.obtenerGastos(),
      ingresos: this.ingresosService.obtenerIngresos(),
    }).subscribe({
      next: ({ gastos, ingresos }) => {
        this.gastos.set(gastos);
        this.ingresos.set(ingresos);
        this.cargando.set(false);
      },
      error: () => {
        this.errorCarga.set("No se pudieron cargar los reportes.");
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
    // Los datos ya están cargados; los computeds se recalculan solos con el
    // nuevo período. Se relanza la carga solo por consistencia con el resto.
    this.cargarDatos();
  }

  formatoQuetzales(valor: number): string {
    return valor.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}