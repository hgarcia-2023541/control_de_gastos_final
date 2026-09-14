import { CommonModule } from "@angular/common";
import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { SidebarComponent } from "../../shared/components/sidebar/sidebar.component";
import { LineChartComponent } from "../../shared/components/line-chart/line-chart.component";
import { DonutChartComponent } from "../../shared/components/donut-chart/donut-chart.component";
import { AuthService } from "../../core/services/auth.service";
import { DashboardService } from "../../core/services/dashboard.service";
import { PeriodoService } from '../../core/services/periodo.service';
import { ultimosPeriodos } from "../../shared/utils/periodo.util"; 
import {
  CategoriaGasto,
  GastoReciente,
  PuntoSerieMensual,
  ResumenFinanciero,
} from "../../shared/models/dashboard.model";

@Component({
  selector: "app-inicio",
  standalone: true,
  imports: [
    CommonModule,
    SidebarComponent,
    LineChartComponent,
    DonutChartComponent,
  ],
  templateUrl: "./inicio.component.html",
  styleUrl: "./inicio.component.css",
})
export class InicioComponent implements OnInit {
  private authService = inject(AuthService);
  private dashboardService = inject(DashboardService);
  private router = inject(Router);

  usuario = this.authService.obtenerUsuario();
  primerNombre = this.usuario?.nombre?.split(" ")[0] ?? "de nuevo";
  inicialUsuario = (this.usuario?.nombre?.charAt(0) ?? "?").toUpperCase();

  // Selector de período: se genera dinámicamente con el mes actual y los
  // anteriores (nunca meses futuros; el backend rechaza fechas futuras).
  periodos = ultimosPeriodos(6);
  private periodoService = inject(PeriodoService); // <-- Inyectar el servicio
  periodoSeleccionado = this.periodoService.periodo; // <-- Usar el signal del servicio
  mostrarSelectorPeriodo = signal(false);

  resumen = signal<ResumenFinanciero>({ ingresos: 0, gastos: 0 });
  serieMensual = signal<PuntoSerieMensual[]>([]);
  categorias = signal<CategoriaGasto[]>([]);
  ultimosGastos = signal<GastoReciente[]>([]);
  cargando = signal(true);

  // "Dinero disponible": ingresos del período - gastos del período.
  disponible = computed(() => this.resumen().ingresos - this.resumen().gastos);

  // "Quick financial insight": % de los ingresos que ya se gastó.
  // Se calcula a partir de los mismos datos del resumen, no es un
  // texto fijo.
  porcentajeUtilizado = computed(() => {
    const { ingresos, gastos } = this.resumen();
    if (!ingresos) return 0;
    return Math.round((gastos / ingresos) * 100);
  });

  categoriaConMayorGasto = computed(() => {
    const lista = this.categorias();
    if (!lista.length) return null;
    return lista.reduce((mayor, actual) =>
      actual.porcentaje > mayor.porcentaje ? actual : mayor
    );
  });

  ngOnInit(): void {
    if (!this.authService.estaAutenticado()) {
      this.router.navigate(["/login"]);
      return;
    }
    this.cargarDatos();
  }

  private cargarDatos(): void {
    this.cargando.set(true);
    const periodo = this.periodoSeleccionado();

    this.dashboardService.obtenerResumen(periodo).subscribe((r) => this.resumen.set(r));
    this.dashboardService
      .obtenerSerieMensual(periodo)
      .subscribe((s) => this.serieMensual.set(s));
    this.dashboardService
      .obtenerGastosPorCategoria(periodo)
      .subscribe((c) => this.categorias.set(c));
    this.dashboardService.obtenerUltimosGastos(periodo).subscribe((g) => {
      this.ultimosGastos.set(g);
      this.cargando.set(false);
    });
  }

  alternarSelectorPeriodo(): void {
    this.mostrarSelectorPeriodo.update((v) => !v);
  }

  seleccionarPeriodo(periodo: string): void {
  this.periodoService.setPeriodo(periodo); // <-- Usar el servicio
  this.mostrarSelectorPeriodo.set(false);
  this.cargarDatos(); // <-- Recargar datos con el nuevo período
}

  formatoQuetzales(valor: number): string {
    return valor.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatoFecha(fechaIso: string): string {
    const fecha = new Date(fechaIso + "T00:00:00");
    return fecha.toLocaleDateString("es-GT", { day: "2-digit", month: "short" });
  }
}
