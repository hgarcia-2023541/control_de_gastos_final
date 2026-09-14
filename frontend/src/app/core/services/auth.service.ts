import { HttpClient } from "@angular/common/http";
import { Injectable, inject, OnDestroy } from "@angular/core";
import { Observable, tap, catchError, throwError } from "rxjs";
import { environment } from "../../../environments/environment";
import { ApiResponse } from "../models/api-response.model";
import {
  LoginResponse,
  PerfilFormulario,
  PerfilResponse,
  RegistroFormulario,
  RolUsuario,
  Usuario,
} from "../models/usuario.model";
import { Router } from "@angular/router";

const MENSAJE_INACTIVIDAD =
  "Su sesión se cerró por inactividad. Por favor, inicie sesión nuevamente.";

// Mensaje de confirmación al cerrar sesión manualmente (sidebar).
export const MENSAJE_LOGOUT = "Se ha cerrado correctamente la sesión.";

// Eventos que cuentan como actividad real del usuario.
const EVENTOS_ACTIVIDAD = [
  "mousemove",
  "keydown",
  "click",
  "scroll",
  "touchstart",
] as const;

// Distancia mínima que debe recorrer el puntero para que un
// "mousemove" cuente como actividad real.
const DISTANCIA_MINIMA_MOVIMIENTO_PX = 10;

@Injectable({ providedIn: "root" })
export class AuthService implements OnDestroy {
  private readonly TOKEN_KEY = "cdg_token";
  private readonly USUARIO_KEY = "cdg_usuario";

  // Guarda el momento hasta el que el usuario puede estar sin actividad.
  private readonly INACTIVIDAD_FIN_KEY = "cdg_inactividad_fin";

  private router = inject(Router);

  // Timer de inactividad.
  private timerInactividad: ReturnType<typeof setTimeout> | null = null;

  // Duración máxima de inactividad, obtenida directamente del JWT.
  private duracionInactividadMs = 0;

  // Último momento en que se pidió un token nuevo.
  // Evita llamar a /auth/refresh en cada evento de actividad.
  private ultimoRefresh = 0;

  private detenerActividad!: () => void;

  constructor(private http: HttpClient) {
    // Al recargar la página con una sesión previa, derivamos
    // la duración desde el JWT guardado.
    this.derivarDuracionInactividad();

    // Retomamos el contador con el tiempo restante persistido.
    this.reanudarTemporizadorInactividad();

    // Vigilamos la actividad real del usuario.
    this.vigilarActividad();
  }

  ngOnDestroy(): void {
    // Limpiamos listeners y timer correctamente.
    this.detenerActividad?.();

    if (this.timerInactividad) {
      clearTimeout(this.timerInactividad);
    }
  }

  // ---------------------------------------------------------------
  // Login tradicional
  // ---------------------------------------------------------------

  login(
    correo: string,
    password: string
  ): Observable<ApiResponse<LoginResponse>> {
    return this.http
      .post<ApiResponse<LoginResponse>>(
        `${environment.apiUrl}/auth/login`,
        {
          correo,
          password,
        }
      )
      .pipe(
        tap((res) => this.guardarSesion(res)),
        catchError((error) => throwError(() => error))
      );
  }

  // ---------------------------------------------------------------
  // Login con Google
  // ---------------------------------------------------------------

  loginConGoogle(
    credential: string
  ): Observable<ApiResponse<LoginResponse>> {
    return this.http
      .post<ApiResponse<LoginResponse>>(
        `${environment.apiUrl}/auth/google`,
        {
          credential,
        }
      )
      .pipe(
        tap((res) => this.guardarSesion(res)),
        catchError((error) => throwError(() => error))
      );
  }

  // ---------------------------------------------------------------
  // Registro público
  // ---------------------------------------------------------------

  registro(
    datos: RegistroFormulario
  ): Observable<ApiResponse<Usuario>> {
    return this.http
      .post<ApiResponse<Usuario>>(
        `${environment.apiUrl}/auth/registro-publico`,
        datos
      )
      .pipe(
        catchError((error) => throwError(() => error))
      );
  }

  // ---------------------------------------------------------------
  // Perfil propio
  // ---------------------------------------------------------------

  actualizarPerfil(
    datos: PerfilFormulario
  ): Observable<ApiResponse<PerfilResponse>> {
    const body: Record<string, unknown> = {};

    if (datos.nombre !== undefined) {
      body["nombre"] = datos.nombre;
    }

    if (datos.fotoUrl !== undefined) {
      body["foto_url"] = datos.fotoUrl || null;
    }

    if (datos.preferencias !== undefined) {
      body["preferencias"] = datos.preferencias;
    }

    return this.http
      .patch<ApiResponse<PerfilResponse>>(
        `${environment.apiUrl}/auth/perfil`,
        body
      )
      .pipe(
        tap((res) => {
          if (res.ok && res.data) {
            const actual = this.obtenerUsuario();

            localStorage.setItem(
              this.USUARIO_KEY,
              JSON.stringify({
                ...(actual ?? {}),
                id: res.data.id,
                nombre: res.data.nombre,
                correo: res.data.correo,
                rol: res.data.rol,
                proveedor: res.data.proveedor,
                fotoUrl: res.data.fotoUrl,
                preferencias: res.data.preferencias,
              })
            );
          }
        }),
        catchError((error) => throwError(() => error))
      );
  }

  // ---------------------------------------------------------------
  // Cierre de sesión
  // ---------------------------------------------------------------

  logout(mensaje?: string): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USUARIO_KEY);
    localStorage.removeItem(this.INACTIVIDAD_FIN_KEY);

    if (this.timerInactividad) {
      clearTimeout(this.timerInactividad);
      this.timerInactividad = null;
    }

    this.ultimoRefresh = 0;

    this.router.navigate(["/login"], {
      state: { mensajeExpiracion: mensaje },
    });
  }

  obtenerToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  obtenerUsuario(): Usuario | null {
    const datos = localStorage.getItem(this.USUARIO_KEY);

    return datos
      ? (JSON.parse(datos) as Usuario)
      : null;
  }

  // ---------------------------------------------------------------
  // Estado de autenticación
  // ---------------------------------------------------------------

  estaAutenticado(): boolean {
    const token = this.obtenerToken();

    if (!token) {
      return false;
    }

    return !this.plazoInactividadVencido();
  }

  tieneRol(rol: RolUsuario): boolean {
    return this.obtenerUsuario()?.rol === rol;
  }

  // ---------------------------------------------------------------
  // Renovación automática de sesión
  // ---------------------------------------------------------------

  // Pide un token nuevo mientras la sesión siga activa.
  //
  // La petición solamente se realiza cuando existe un token.
  // Si falla, no se cierra la sesión directamente aquí; el interceptor
  // o el temporizador de inactividad pueden encargarse de ello.
  refrescarSesion(): void {
    const token = this.obtenerToken();

    if (!token) {
      return;
    }

    this.http
      .post<ApiResponse<{ token: string }>>(
        `${environment.apiUrl}/auth/refresh`,
        {}
      )
      .subscribe({
        next: (res) => {
          if (res.ok && res.data) {
            // Guardamos el nuevo JWT.
            localStorage.setItem(
              this.TOKEN_KEY,
              res.data.token
            );

            // Volvemos a obtener la duración directamente
            // desde el nuevo JWT.
            this.duracionInactividadMs =
              this.duracionInactividadDesdeToken(
                res.data.token
              );

            // Registramos el momento exacto del refresh.
            this.ultimoRefresh = Date.now();
          }
        },
        error: () => {
          // No hacemos nada aquí.
          // El interceptor o el timer pueden encargarse
          // de cerrar la sesión si corresponde.
        },
      });
  }

  // ---------------------------------------------------------------
  // Privados
  // ---------------------------------------------------------------

  // Guarda la sesión devuelta por login o Google.
  private guardarSesion(
    res: ApiResponse<LoginResponse>
  ): void {
    if (!res.ok || !res.data) {
      return;
    }

    localStorage.setItem(
      this.TOKEN_KEY,
      res.data.token
    );

    localStorage.setItem(
      this.USUARIO_KEY,
      JSON.stringify(res.data.usuario)
    );

    // La duración de inactividad se obtiene del propio JWT.
    this.duracionInactividadMs =
      this.duracionInactividadDesdeToken(
        res.data.token
      );

    // El token acaba de ser obtenido, por lo que registramos
    // el momento como último refresh.
    this.ultimoRefresh = Date.now();

    // Arrancamos el contador de inactividad.
    this.reiniciarTimerInactividad();
  }

  // ---------------------------------------------------------------
  // Duración de inactividad desde JWT
  // ---------------------------------------------------------------

  private duracionInactividadDesdeToken(
    token: string
  ): number {
    const payload = this.leerPayload(token);

    const expira = payload?.exp;
    const emitido = payload?.iat;

    if (
      typeof expira === "number" &&
      typeof emitido === "number" &&
      expira > emitido
    ) {
      return (expira - emitido) * 1000;
    }

    return 0;
  }

  // ---------------------------------------------------------------
  // Lectura del payload del JWT
  // ---------------------------------------------------------------

  private leerPayload(
    token: string
  ): {
    exp?: number;
    iat?: number;
  } | null {
    try {
      const payloadBase64 = token.split(".")[1];

      const payloadJson = atob(
        payloadBase64
          .replace(/-/g, "+")
          .replace(/_/g, "/")
      );

      return JSON.parse(payloadJson) as {
        exp?: number;
        iat?: number;
      };
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------
  // Retomar temporizador después de recargar
  // ---------------------------------------------------------------

  private reanudarTemporizadorInactividad(): void {
    if (!this.obtenerToken()) {
      return;
    }

    const finInactividad = localStorage.getItem(
      this.INACTIVIDAD_FIN_KEY
    );

    if (!finInactividad) {
      // Sesión válida sin contador previo.
      this.reiniciarTimerInactividad();
      return;
    }

    const tiempoRestante =
      parseInt(finInactividad, 10) - Date.now();

    if (tiempoRestante <= 0) {
      this.logout(MENSAJE_INACTIVIDAD);
      return;
    }

    if (this.timerInactividad) {
      clearTimeout(this.timerInactividad);
    }

    this.timerInactividad = setTimeout(() => {
      this.logout(MENSAJE_INACTIVIDAD);
    }, tiempoRestante);
  }

  // ---------------------------------------------------------------
  // Derivar duración desde token guardado
  // ---------------------------------------------------------------

  private derivarDuracionInactividad(): void {
    const token = this.obtenerToken();

    if (!token) {
      return;
    }

    this.duracionInactividadMs =
      this.duracionInactividadDesdeToken(token);
  }

  // ---------------------------------------------------------------
  // Vigilancia de actividad
  // ---------------------------------------------------------------

  private vigilarActividad(): void {
    // Última posición del puntero aceptada.
    let ultimaPosicion: {
      x: number;
      y: number;
    } | null = null;

    const manejarActividad = (evento: Event): void => {
      // Si el plazo ya venció, cerramos la sesión.
      if (this.plazoInactividadVencido()) {
        this.logout(MENSAJE_INACTIVIDAD);
        return;
      }

      // Filtrado de movimientos pequeños del mouse.
      if (evento.type === "mousemove") {
        const ev = evento as MouseEvent;

        if (ultimaPosicion) {
          const distancia = Math.hypot(
            ev.clientX - ultimaPosicion.x,
            ev.clientY - ultimaPosicion.y
          );

          if (
            distancia <
            DISTANCIA_MINIMA_MOVIMIENTO_PX
          ) {
            // Movimiento pequeño producido por el sensor.
            ultimaPosicion = {
              x: ev.clientX,
              y: ev.clientY,
            };

            return;
          }
        }

        ultimaPosicion = {
          x: ev.clientX,
          y: ev.clientY,
        };
      }

      // Reiniciamos el temporizador porque hubo actividad real.
      this.reiniciarTimerInactividad();

      // -----------------------------------------------------------
      // Renovación del JWT
      // -----------------------------------------------------------
      //
      // Solo renovamos cuando:
      // 1. Existe una duración válida.
      // 2. Ya pasó la mitad del tiempo desde el último refresh.
      //
      // Esto evita enviar una petición /auth/refresh con cada click,
      // movimiento o tecla.
      if (
        this.duracionInactividadMs > 0 &&
        Date.now() - this.ultimoRefresh >
          this.duracionInactividadMs / 2
      ) {
        this.refrescarSesion();
      }
    };

    for (const evento of EVENTOS_ACTIVIDAD) {
      window.addEventListener(
        evento,
        manejarActividad,
        { passive: true }
      );
    }

    this.detenerActividad = () => {
      for (const evento of EVENTOS_ACTIVIDAD) {
        window.removeEventListener(
          evento,
          manejarActividad
        );
      }
    };
  }

  // ---------------------------------------------------------------
  // Verificar vencimiento de inactividad
  // ---------------------------------------------------------------

  private plazoInactividadVencido(): boolean {
    const finInactividad = localStorage.getItem(
      this.INACTIVIDAD_FIN_KEY
    );

    if (!finInactividad) {
      return false;
    }

    return (
      Date.now() >
      parseInt(finInactividad, 10)
    );
  }

  // ---------------------------------------------------------------
  // Reiniciar temporizador de inactividad
  // ---------------------------------------------------------------

  private reiniciarTimerInactividad(): void {
    if (this.timerInactividad) {
      clearTimeout(this.timerInactividad);
      this.timerInactividad = null;
    }

    if (
      !this.obtenerToken() ||
      !this.duracionInactividadMs
    ) {
      return;
    }

    const finInactividad =
      Date.now() + this.duracionInactividadMs;

    localStorage.setItem(
      this.INACTIVIDAD_FIN_KEY,
      finInactividad.toString()
    );

    this.timerInactividad = setTimeout(() => {
      this.logout(MENSAJE_INACTIVIDAD);
    }, this.duracionInactividadMs);
  }
}