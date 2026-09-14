import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, map } from "rxjs";
import { environment } from "../../../environments/environment";
import { ApiResponse } from "../models/api-response.model";
import {
  Categoria,
  CategoriaFormulario,
  TipoCategoria,
} from "../../shared/models/categoria.model";

@Injectable({ providedIn: "root" })
export class CategoriasService {
  private readonly baseUrl = `${environment.apiUrl}/categorias`;

  constructor(private http: HttpClient) {}

  // Lista las categorías del sistema + las del usuario autenticado.
  obtenerCategorias(tipo?: TipoCategoria): Observable<Categoria[]> {
    let params = new HttpParams();
    if (tipo) params = params.set("tipo", tipo);

    return this.http
      .get<ApiResponse<Categoria[]>>(this.baseUrl, { params })
      .pipe(map((res) => this.normalizarLista(res.data ?? [])));
  }

  crearCategoria(datos: CategoriaFormulario): Observable<Categoria> {
    return this.http
      .post<ApiResponse<Categoria>>(this.baseUrl, datos)
      .pipe(map((res) => this.normalizar(res.data!)));
  }

  actualizarCategoria(id: number, datos: CategoriaFormulario): Observable<Categoria> {
    return this.http
      .put<ApiResponse<Categoria>>(`${this.baseUrl}/${id}`, datos)
      .pipe(map((res) => this.normalizar(res.data!)));
  }

  eliminarCategoria(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<void>>(`${this.baseUrl}/${id}`)
      .pipe(map(() => undefined));
  }

  // El backend devuelve "usuario_id" (snake_case); lo normalizamos a
  // "usuarioId" como hace el resto del frontend.
  private normalizar(datos: Categoria): Categoria {
    const bruto = datos as unknown as {
      id: number;
      nombre: string;
      tipo: TipoCategoria;
      color: string | null;
      usuario_id?: number | null;
    };
    return {
      id: bruto.id,
      nombre: bruto.nombre,
      tipo: bruto.tipo,
      color: bruto.color ?? null,
      usuarioId: bruto.usuario_id ?? null,
    };
  }

  private normalizarLista(categorias: Categoria[]): Categoria[] {
    return categorias.map((c) => this.normalizar(c));
  }
}