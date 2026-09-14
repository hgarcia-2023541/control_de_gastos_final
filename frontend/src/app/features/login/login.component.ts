import { CommonModule } from "@angular/common";
import { Component, AfterViewInit, inject, OnDestroy, OnInit } from "@angular/core";
import { FinancialBackground } from '../../shared/components/financial-background/financial-background';
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { AuthService, MENSAJE_LOGOUT } from "../../core/services/auth.service";
import { Subscription } from "rxjs";
import { environment } from "../../../environments/environment";

// Tipo mínimo de la API de Google Identity Services (GIS) que usamos.
interface GsiWindow extends Window {
  google?: {
    accounts?: {
      id?: {
        initialize: (config: {
          client_id: string;
          callback: (respuesta: { credential?: string }) => void;
        }) => void;
        renderButton: (element: HTMLElement, opciones: Record<string, unknown>) => void;
      };
    };
  };
}

@Component({
  selector: "app-login",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, FinancialBackground],
  templateUrl: "./login.component.html",
  styleUrl: "./login.component.css",
})
export class LoginComponent implements OnInit, AfterViewInit, OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private subscription?: Subscription;

  cargando = false;
  cargandoGoogle = false;
  errorMensaje = "";
  mensajeExpiracion: string | null = null;
  mensajeRegistro: string | null = null;
  // Confirmación de cierre de sesión manual (viene del sidebar).
  mensajeLogout: string | null = null;

  // Si el environment no trae client_id, no se muestra el bloque Google.
  // El client_id es público (no un secreto); el backend lo verifica igual.
  googleConfigurado = !!environment.googleClientId;

  formulario = this.fb.group({
    correo: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required]],
  });

  get correo() {
    return this.formulario.get("correo")!;
  }
  get password() {
    return this.formulario.get("password")!;
  }

  ngOnInit(): void {
    // State traído de login: mensaje de expiración (existente), de cierre
    // de sesión manual (logout del sidebar) o de cuenta recién creada en
    // /registro.
    const state = history.state as { mensajeExpiracion?: string; mensajeRegistro?: string };
    if (state?.mensajeExpiracion) {
      // El logout manual usa el mismo canal de navegación que la
      // expiración, pero se distingue por su mensaje para mostrarse como
      // confirmación de éxito (no como sesión caducada).
      if (state.mensajeExpiracion === MENSAJE_LOGOUT) {
        this.mensajeLogout = state.mensajeExpiracion;
      } else {
        this.mensajeExpiracion = state.mensajeExpiracion;
      }
    }
    if (state?.mensajeRegistro) {
      this.mensajeRegistro = state.mensajeRegistro;
    }
  }

  ngAfterViewInit(): void {
    this.inicializarBotonGoogle();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  // El usuario cierra el aviso de sesión expirada a propósito (con un
  // clic) y de ahí lo mandamos a la página de bienvenida.
  aceptarMensajeExpiracion(): void {
    this.mensajeExpiracion = null;
    this.router.navigate(["/landing"]);
  }

  aceptarMensajeRegistro(): void {
    this.mensajeRegistro = null;
  }

  // El aviso de cierre de sesión se descarta sin navegar: el usuario ya
  // está en /login (a diferencia de la expiración, que sí tenía que
  // volver a la bienvenida).
  aceptarMensajeLogout(): void {
    this.mensajeLogout = null;
  }

  // Renderiza el botón oficial de Google (GIS) dentro del contenedor
  // #boton-google. Luego, el callback recibe el credential (id_token)
  // que se envía al backend para verificarlo.
  private inicializarBotonGoogle(): void {
    if (!this.googleConfigurado) return;

    const gsi = (window as GsiWindow).google;
    const contenedor = document.getElementById("boton-google");
    if (!gsi?.accounts?.id || !contenedor) return;

    gsi.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (respuesta: { credential?: string }) => {
        if (respuesta?.credential) {
          this.entrarConGoogle(respuesta.credential);
        }
      },
    });

    gsi.accounts.id.renderButton(contenedor, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "rectangular",
      width: 320,
      text: "continue_with",
      locale: "es",
    });
  }

  private entrarConGoogle(credential: string): void {
    this.cargandoGoogle = true;
    this.errorMensaje = "";
    this.subscription = this.authService.loginConGoogle(credential).subscribe({
      next: (response) => {
        this.cargandoGoogle = false;
        if (response.ok) {
          this.router.navigate(["/inicio"]);
        } else {
          this.errorMensaje = response.mensaje || "No se pudo iniciar sesión con Google";
        }
      },
      error: (err) => {
        this.cargandoGoogle = false;
        this.errorMensaje =
          err.error?.mensaje ||
          "No se pudo iniciar sesión con Google. Inténtalo de nuevo.";
      },
    });
  }

  enviar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    this.cargando = true;
    this.errorMensaje = "";
    this.mensajeExpiracion = null;
    this.mensajeLogout = null;
    const { correo, password } = this.formulario.value;

    // Verificar que los valores no sean null o undefined
    if (!correo || !password) {
      this.cargando = false;
      this.errorMensaje = "Por favor, complete todos los campos";
      return;
    }

    this.subscription = this.authService.login(correo, password).subscribe({
      next: (response) => {
        this.cargando = false;
        if (response.ok) {
          console.log('✅ Redirigiendo a inicio...');
          this.router.navigate(["/inicio"]);
        } else {
          this.errorMensaje = response.mensaje || "Error al iniciar sesión";
        }
      },
      error: (err) => {
        this.cargando = false;
        console.error('❌ Error en login:', err);
        this.errorMensaje = err.error?.mensaje || "No se pudo iniciar sesión. Verifique sus credenciales.";
      },
    });
  }
}