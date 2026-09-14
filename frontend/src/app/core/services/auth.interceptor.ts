import { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { AuthService } from "./auth.service";
import { catchError, throwError } from "rxjs";

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.obtenerToken();

  let request = req;

  if (token) {
    request = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(request).pipe(
    catchError((error) => {
      // Solo manejar errores 401 que NO sean del endpoint de login ni
      // del de Google (en /auth/google un 401 significa "token inválido",
      // no "sesión expirada", y el usuario debe ver el error en pantalla).
      if (
        error.status === 401 &&
        !req.url.includes('/auth/login') &&
        !req.url.includes('/auth/google')
      ) {
        const mensaje = error.error?.mensaje || "Su sesión ha expirado. Por favor, inicie sesión nuevamente.";
        console.log(`🔴 ${mensaje}`);
        authService.logout(mensaje);
      }
      return throwError(() => error);
    })
  );
};