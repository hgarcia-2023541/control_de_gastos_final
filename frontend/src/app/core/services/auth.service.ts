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

// Mensaje de confirmación al cerrar sesión manualmente (sidebar). Se
// exporta para que Login lo distinga del mensaje de expiración.
export const MENSAJE_LOGOUT = "Se ha cerrado correctamente la sesión.";

// Eventos que cuentan como "actividad real" del usuario.
const EVENTOS_ACTIVIDAD = [
  "mousemove",
  "keydown",
  "click",
  "scroll",
  "touchstart",
] as const;

// Distancia mínima (px) que debe recorrer el puntero para que un evento
// "mousemove" cuente como actividad real. El sensor del mouse/trackpad
// emite micro-movimientos continuos (~1-3 px) aunque el usuario no lo
// toque (jitter); sin este filtro, cada uno de esos eventos reiniciaría
// el contador de inactividad y el setTimeout de logout jamás vencería.
// 10 px (~el ancho del cursor) separa claramente el ruido del sensor de
// un movimiento real del usuario, sin depender de ningún temporizador.
const DISTANCIA_MINIMA_MOVIMIENTO_PX = 10;

@Injectable({ providedIn: "root" })
export class AuthService implements OnDestroy {
  private readonly TOKEN_KEY = "cdg_token";
  private readonly USUARIO_KEY = "cdg_usuario";
  // Guarda el momento (epoch ms) hasta el que el usuario puede estar sin
  // actividad antes de que la sesión se cierre por inactividad.
  private readonly INACTIVIDAD_FIN_KEY = "cdg_inactividad_fin";
  private router = inject(Router);

  // Timer de INACTIVIDAD: se reinicia con CADA actividad del usuario.
  private timerInactividad: ReturnType<typeof setTimeout> | null = null;

  // JWT_EXPIRES_IN en milisegundos, derivado del propio JWT (exp - iat).
  // Es el tiempo máximo que el usuario puede permanecer sin actividad.
  private duracionInactividadMs = 0;

  private detenerActividad!: () => void;

  constructor(private http: HttpClient) {
    // Al recargar la página con una sesión previa, derivamos la duración
    // de inactividad desde el JWT y retomamos el contador con el tiempo
    // restante persistido (no se regala tiempo de más).
    this.derivarDuracionInactividad();
    this.reanudarTemporizadorInactividad();

    // Vigilancia de inactividad real: arranca una sola vez y se
    // reinicia sola en cada evento de actividad.
    this.vigilarActividad();
  }

  ngOnDestroy(): void {
    // Limpiamos listeners y timer correctamente.
    this.detenerActividad?.();
    if (this.timerInactividad) clearTimeout(this.timerInactividad);
  }

  // ---------------------------------------------------------------
  // Login tradicional (NO reemplazado: sigue funcionando igual).
  // ---------------------------------------------------------------
  login(correo: string, password: string): Observable<ApiResponse<LoginResponse>> {
    return this.http
      .post<ApiResponse<LoginResponse>>(`${environment.apiUrl}/auth/login`, {
        correo,
        password,
      })
      .pipe(
        tap((res) => this.guardarSesion(res)),
        catchError((error) => throwError(() => error))
      );
  }

  // ---------------------------------------------------------------
  // Login con Google (GIS): el frontend envía el credential/id_token y
  // el backend lo verifica (GOOGLE_CLIENT_ID vive solo en el backend).
  // ---------------------------------------------------------------
  loginConGoogle(credential: string): Observable<ApiResponse<LoginResponse>> {
    return this.http
      .post<ApiResponse<LoginResponse>>(`${environment.apiUrl}/auth/google`, {
        credential,
      })
      .pipe(
        tap((res) => this.guardarSesion(res)),
        catchError((error) => throwError(() => error))
      );
  }

  // ---------------------------------------------------------------
  // Registro público: crea la cuenta y NO inicia sesión (redirige a
  // login), porque el backend solo devuelve el usuario creado.
  // ---------------------------------------------------------------
  registro(datos: RegistroFormulario): Observable<ApiResponse<Usuario>> {
    return this.http
      .post<ApiResponse<Usuario>>(`${environment.apiUrl}/auth/registro-publico`, datos)
      .pipe(catchError((error) => throwError(() => error)));
  }

  // ---------------------------------------------------------------
  // Perfil propio: PATCH /auth/perfil. Solo puede modificar sus propios
  // datos; tras guardar, actualiza el usuario en localStorage para que
  // toda la app vea los cambios sin volver a iniciar sesión.
  // ---------------------------------------------------------------
  actualizarPerfil(datos: PerfilFormulario): Observable<ApiResponse<PerfilResponse>> {
    const body: Record<string, unknown> = {};
    if (datos.nombre !== undefined) body["nombre"] = datos.nombre;
    if (datos.fotoUrl !== undefined) body["foto_url"] = datos.fotoUrl || null;
    if (datos.preferencias !== undefined) body["preferencias"] = datos.preferencias;

    return this.http
      .patch<ApiResponse<PerfilResponse>>(`${environment.apiUrl}/auth/perfil`, body)
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
  // Cierre de sesión: limpia sesión/token y redirige a login. Si se
  // pasa un mensaje (expiración o inactividad), el login lo muestra.
  // ---------------------------------------------------------------
  logout(mensaje?: string): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USUARIO_KEY);
    localStorage.removeItem(this.INACTIVIDAD_FIN_KEY);

    if (this.timerInactividad) {
      clearTimeout(this.timerInactividad);
      this.timerInactividad = null;
    }

    this.router.navigate(["/login"], {
      state: { mensajeExpiracion: mensaje },
    });
  }

  obtenerToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  obtenerUsuario(): Usuario | null {
    const datos = localStorage.getItem(this.USUARIO_KEY);
    return datos ? (JSON.parse(datos) as Usuario) : null;
  }

  // Consulta pura: solo revisa si hay una sesión vigente, sin cerrar
  // sesión ni navegar. Quien llame a este método decide qué hacer si
  // devuelve false (ver auth.guard.ts).
  estaAutenticado(): boolean {
    const token = this.obtenerToken();
    if (!token) return false;

    // La sesión deja de considerarse vigente si ya venció el plazo de
    // inactividad permitido (JWT_EXPIRES_IN sin actividad).
    return !this.plazoInactividadVencido();
  }

  tieneRol(rol: RolUsuario): boolean {
    return this.obtenerUsuario()?.rol === rol;
  }

  // ---------------------------------------------------------------
  // Privados
  // ---------------------------------------------------------------

  // Guarda la sesión devuelta por /auth/login o /auth/google y arranca
  // el temporizador de inactividad (JWT_EXPIRES_IN desde este momento).
  private guardarSesion(res: ApiResponse<LoginResponse>): void {
    if (!res.ok || !res.data) return;

    localStorage.setItem(this.TOKEN_KEY, res.data.token);
    localStorage.setItem(this.USUARIO_KEY, JSON.stringify(res.data.usuario));

    // JWT_EXPIRES_IN = tiempo máximo de inactividad. Se deriva del propio
    // JWT (exp - iat) para que funcione igual con 2m, 5m, 30m o 1h, sin
    // duplicar el valor en el frontend.
    this.duracionInactividadMs = this.duracionInactividadDesdeToken(
      res.data.token
    );

    // Arranca el contador de inactividad completo desde el inicio de sesión.
    this.reiniciarTimerInactividad();
  }

  // Deriva JWT_EXPIRES_IN (tiempo máximo de inactividad) desde el propio
  // JWT: "exp" - "iat". Así el frontend usa exactamente el mismo valor
  // que configuró el backend, sea 2m, 5m, 30m o 1h. No hay ningún otro
  // temporizador ni valor fijo: JWT_EXPIRES_IN es la única fuente.
  private duracionInactividadDesdeToken(token: string): number {
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
    // Sin exp/iat legibles no se inventa una duración. Con los tokens del
    // propio backend (jsonwebtoken + expiresIn) esto nunca ocurre.
    return 0;
  }

  // Decodifica el "payload" del JWT (la parte de en medio) sin necesidad
  // de ninguna librería extra.
  private leerPayload(token: string): { exp?: number; iat?: number } | null {
    try {
      const payloadBase64 = token.split(".")[1];
      const payloadJson = atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(payloadJson) as { exp?: number; iat?: number };
    } catch {
      return null;
    }
  }

  // Retoma el contador de inactividad al recargar la página: usa el
  // tiempo restante persistido. Si el plazo ya venció, cierra la sesión.
  private reanudarTemporizadorInactividad(): void {
    if (!this.obtenerToken()) return;

    const finInactividad = localStorage.getItem(this.INACTIVIDAD_FIN_KEY);
    if (!finInactividad) {
      // Sesión válida sin contador previo: se arranca uno completo.
      this.reiniciarTimerInactividad();
      return;
    }

    const tiempoRestante = parseInt(finInactividad, 10) - Date.now();

    if (tiempoRestante <= 0) {
      this.logout(MENSAJE_INACTIVIDAD);
      return;
    }

    if (this.timerInactividad) clearTimeout(this.timerInactividad);
    this.timerInactividad = setTimeout(() => {
      this.logout(MENSAJE_INACTIVIDAD);
    }, tiempoRestante);
  }

  // En recargas, deriva la duración de inactividad desde el token guardado.
  private derivarDuracionInactividad(): void {
    const token = this.obtenerToken();
    if (!token) return;
    this.duracionInactividadMs = this.duracionInactividadDesdeToken(token);
  }

  // Escucha los eventos de actividad real del usuario. Un solo handler
  // compartido: primero verifica si el plazo de inactividad ya venció (por
  // si el setTimeout se retrasó, p. ej. por estar la pestaña en segundo
  // plano); si venció, cierra la sesión. Si no, reinicia el contador.
  // Los "mousemove" se filtran por distancia para que el jitter del sensor
  // (micro-movimientos involuntarios del puntero) no reinicie el contador.
  private vigilarActividad(): void {
    // Última posición del puntero aceptada, para medir el desplazamiento.
    let ultimaPosicion: { x: number; y: number } | null = null;

    const manejarActividad = (evento: Event): void => {
      // Antes que nada: si el plazo de inactividad ya venció (por ejemplo
      // porque el timer se retrasó al estar la pestaña en segundo plano),
      // cualquier evento dispara el cierre de sesión.
      if (this.plazoInactividadVencido()) {
        this.logout(MENSAJE_INACTIVIDAD);
        return;
      }

      // El sensor del mouse emite "mousemove" continuos aunque el usuario
      // no lo toque. Solo cuenta como actividad un desplazamiento real.
      if (evento.type === "mousemove") {
        const ev = evento as MouseEvent;
        if (ultimaPosicion) {
          const distancia = Math.hypot(
            ev.clientX - ultimaPosicion.x,
            ev.clientY - ultimaPosicion.y
          );
          if (distancia < DISTANCIA_MINIMA_MOVIMIENTO_PX) {
            // Ruido del sensor: se actualiza la referencia pero NO se
            // reinicia el contador ni se arma un nuevo setTimeout.
            ultimaPosicion = { x: ev.clientX, y: ev.clientY };
            return;
          }
        }
        ultimaPosicion = { x: ev.clientX, y: ev.clientY };
      }

      this.reiniciarTimerInactividad();
    };

    for (const evento of EVENTOS_ACTIVIDAD) {
      window.addEventListener(evento, manejarActividad, { passive: true });
    }
    this.detenerActividad = () => {
      for (const evento of EVENTOS_ACTIVIDAD) {
        window.removeEventListener(evento, manejarActividad);
      }
    };
  }

  // true si el tiempo máximo de inactividad (JWT_EXPIRES_IN) ya venció.
  private plazoInactividadVencido(): boolean {
    const finInactividad = localStorage.getItem(this.INACTIVIDAD_FIN_KEY);
    if (!finInactividad) return false;
    return Date.now() > parseInt(finInactividad, 10);
  }

  // Reinicia el contador de inactividad a JWT_EXPIRES_IN completo desde
  // este momento y persiste el nuevo límite. Sin sesión no hay nada que
  // vigilar (y así no se dispara solo en la pantalla de login).
  private reiniciarTimerInactividad(): void {
    if (this.timerInactividad) {
      clearTimeout(this.timerInactividad);
      this.timerInactividad = null;
    }

    if (!this.obtenerToken() || !this.duracionInactividadMs) return;

    const finInactividad = Date.now() + this.duracionInactividadMs;
    localStorage.setItem(this.INACTIVIDAD_FIN_KEY, finInactividad.toString());

    this.timerInactividad = setTimeout(() => {
      this.logout(MENSAJE_INACTIVIDAD);
    }, this.duracionInactividadMs);
  }
}