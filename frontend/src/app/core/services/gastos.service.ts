import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, map } from "rxjs";
import { environment } from "../../../environments/environment";
import { ApiResponse } from "../models/api-response.model";
import { FiltrosGasto, Gasto, GastoFormulario } from "../../shared/models/gasto.model";

@Injectable({ providedIn: "root" })
export class GastosService {
  private readonly baseUrl = `${environment.apiUrl}/expenses`;

  constructor(private http: HttpClient) {}

  obtenerGastos(filtros: FiltrosGasto = {}): Observable<Gasto[]> {
    let params = new HttpParams();
    if (filtros.busqueda) params = params.set("busqueda", filtros.busqueda);
    if (filtros.fechaInicio) params = params.set("fechaInicio", filtros.fechaInicio);
    if (filtros.fechaFin) params = params.set("fechaFin", filtros.fechaFin);
    if (filtros.categoria) params = params.set("categoria", filtros.categoria);

    return this.http
      .get<ApiResponse<Gasto[]>>(this.baseUrl, { params })
      .pipe(map((res) => this.normalizarLista(res.data ?? [])));
  }

  crearGasto(datos: GastoFormulario): Observable<Gasto> {
    return this.http
      .post<ApiResponse<Gasto>>(this.baseUrl, datos)
      .pipe(map((res) => this.normalizar(res.data!)));
  }

  actualizarGasto(id: number, datos: GastoFormulario): Observable<Gasto> {
    return this.http
      .put<ApiResponse<Gasto>>(`${this.baseUrl}/${id}`, datos)
      .pipe(map((res) => this.normalizar(res.data!)));
  }

  eliminarGasto(id: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.baseUrl}/${id}`).pipe(map(() => undefined));
  }

  private normalizar(gasto: Gasto): Gasto {
    return {
      ...gasto,
      monto: Number(gasto.monto),
      fecha: String(gasto.fecha).slice(0, 10),
    };
  }

  private normalizarLista(gastos: Gasto[]): Gasto[] {
    return gastos.map((g) => this.normalizar(g));
  }
}
