import { Injectable, inject } from "@angular/core";
import { Observable, forkJoin, map } from "rxjs";
import {
  CategoriaGasto,
  GastoReciente,
  PuntoSerieMensual,
  ResumenFinanciero,
} from "../../shared/models/dashboard.model";
import { IngresosService } from "./ingresos.service";
import { GastosService } from "./gastos.service";
import { Ingreso } from "../../shared/models/ingreso.model";
import { Gasto } from "../../shared/models/gasto.model";
import { fechaEnPeriodo } from "../../shared/utils/periodo.util";

// Colores por categoría de gasto (mismo criterio que gastos.component.ts):
// las categorías sugeridas tienen un color fijo para que el donut se
// vea consistente entre pantallas; cualquier categoría distinta que el
// usuario haya escrito usa la paleta de respaldo por posición.
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

// Días usados como puntos del gráfico de línea "Resumen de ingresos y
// gastos". No son datos: son solo las posiciones del eje X (matching
// el diseño aprobado del Dashboard, que no debía cambiar visualmente).
const DIAS_SERIE = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];

@Injectable({ providedIn: "root" })
export class DashboardService {
  private ingresosService = inject(IngresosService);
  private gastosService = inject(GastosService);

  // Ingresos y gastos: ambos reales (PostgreSQL), filtrados por el
  // usuario autenticado (vía interceptor + JWT) y por el período
  // seleccionado en el Dashboard.
  obtenerResumen(periodo: string): Observable<ResumenFinanciero> {
    return forkJoin({
      ingresos: this.ingresosService.obtenerIngresos(),
      gastos: this.gastosService.obtenerGastos(),
    }).pipe(
      map(({ ingresos, gastos }) => ({
        ingresos: this.sumarDelPeriodo(ingresos, periodo),
        gastos: this.sumarDelPeriodo(gastos, periodo),
      }))
    );
  }

  obtenerSerieMensual(periodo: string): Observable<PuntoSerieMensual[]> {
    return forkJoin({
      ingresos: this.ingresosService.obtenerIngresos(),
      gastos: this.gastosService.obtenerGastos(),
    }).pipe(
      map(({ ingresos, gastos }) => {
        const ingresosDelPeriodo = ingresos.filter((i) => fechaEnPeriodo(i.fecha, periodo));
        const gastosDelPeriodo = gastos.filter((g) => fechaEnPeriodo(g.fecha, periodo));

        // Suma acumulada de cada lista hasta cada día del período
        // seleccionado (misma lógica que ya existía para ingresos,
        // ahora aplicada también a gastos reales).
        return DIAS_SERIE.map((dia) => ({
          etiqueta: String(dia),
          ingresos: ingresosDelPeriodo
            .filter((i) => new Date(i.fecha + "T00:00:00").getDate() <= dia)
            .reduce((suma, i) => suma + i.monto, 0),
          gastos: gastosDelPeriodo
            .filter((g) => new Date(g.fecha + "T00:00:00").getDate() <= dia)
            .reduce((suma, g) => suma + g.monto, 0),
        }));
      })
    );
  }

  obtenerGastosPorCategoria(periodo: string): Observable<CategoriaGasto[]> {
    return this.gastosService.obtenerGastos().pipe(
      map((gastos) => {
        const gastosDelPeriodo = gastos.filter((g) => fechaEnPeriodo(g.fecha, periodo));
        const total = gastosDelPeriodo.reduce((suma, g) => suma + g.monto, 0);
        if (!total) return [];

        const porCategoria = new Map<string, number>();
        for (const gasto of gastosDelPeriodo) {
          porCategoria.set(gasto.categoria, (porCategoria.get(gasto.categoria) ?? 0) + gasto.monto);
        }

        return Array.from(porCategoria.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([nombre, monto], i) => ({
            nombre,
            porcentaje: Math.round((monto / total) * 100),
            color: COLOR_POR_CATEGORIA[nombre] ?? PALETA_RESPALDO[i % PALETA_RESPALDO.length],
          }));
      })
    );
  }

  obtenerUltimosGastos(periodo: string): Observable<GastoReciente[]> {
    return this.gastosService.obtenerGastos().pipe(
      map((gastos) =>
        gastos
          .filter((g) => fechaEnPeriodo(g.fecha, periodo))
          .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
          .slice(0, 5)
          .map((g) => this.aGastoReciente(g))
      )
    );
  }

  private aGastoReciente(gasto: Gasto): GastoReciente {
    return {
      id: gasto.id,
      descripcion: gasto.descripcion,
      categoria: gasto.categoria,
      icono: "", // el ícono se elige en la plantilla según "categoria", no se usa este campo
      fecha: gasto.fecha,
      monto: gasto.monto,
    };
  }

  private sumarDelPeriodo(lista: Array<Ingreso | Gasto>, periodo: string): number {
    return lista
      .filter((item) => fechaEnPeriodo(item.fecha, periodo))
      .reduce((suma, item) => suma + item.monto, 0);
  }
}
