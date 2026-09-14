import { CommonModule } from "@angular/common";
import { Component, inject, OnDestroy, OnInit } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from "@angular/forms";
import { SidebarComponent } from "../../shared/components/sidebar/sidebar.component";
import { AuthService } from "../../core/services/auth.service";
import { Router } from "@angular/router";
import { finalize, Subscription } from "rxjs";
import { Usuario } from "../../core/models/usuario.model";

@Component({
  selector: "app-configuracion",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, SidebarComponent],
  templateUrl: "./configuracion.component.html",
  styleUrl: "./configuracion.component.css",
})
export class ConfiguracionComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private subscription?: Subscription;

  usuario: Usuario | null = null;
  inicialUsuario = "?";
  guardando = false;
  errorMensaje = "";
  mensajeExito = "";

  // Preferencia sencilla guardada en usuarios.preferencias (JSONB).
  mostrarMonedaConSimbolo = false;

  formulario = this.fb.group({
    nombre: ["", [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
    fotoUrl: [""],
  });

  ngOnInit(): void {
    if (!this.authService.estaAutenticado()) {
      this.router.navigate(["/login"]);
      return;
    }

    this.usuario = this.authService.obtenerUsuario();
    this.inicialUsuario = (this.usuario?.nombre?.charAt(0) ?? "?").toUpperCase();

    this.formulario.patchValue({
      nombre: this.usuario?.nombre ?? "",
      fotoUrl: this.usuario?.fotoUrl ?? "",
    });

    const prefs = this.usuario?.preferencias as { monedaSimbolo?: boolean } | null | undefined;
    this.mostrarMonedaConSimbolo = prefs?.monedaSimbolo ?? false;
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  guardar(): void {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid) {
      this.errorMensaje = "El nombre es obligatorio (mínimo 2 caracteres).";
      return;
    }

    const nombre = this.formulario.value.nombre?.trim() ?? "";
    const foto = (this.formulario.value.fotoUrl ?? "").trim() || null;

    if (!nombre) {
      this.errorMensaje = "El nombre es obligatorio.";
      return;
    }

    // La foto se guarda como URL (http/https) o data URL; NO hay upload.
    if (foto && !/^(https?:\/\/|data:image\/)/i.test(foto)) {
      this.errorMensaje =
        "La foto debe ser una URL (https://...) o una imagen en formato data URL (data:image/...).";
      return;
    }

    // Evita dobles envíos mientras la petición está en curso.
    if (this.guardando) return;

    this.guardando = true;
    this.errorMensaje = "";
    this.mensajeExito = "";

    this.subscription = this.authService
      .actualizarPerfil({
        nombre,
        fotoUrl: foto,
        preferencias: { monedaSimbolo: this.mostrarMonedaConSimbolo },
      })
      .pipe(
        // finalize garantiza que el botón nunca se quede en "Guardando...":
        // se ejecuta con éxito, con error o incluso si un handler lanza.
        finalize(() => {
          this.guardando = false;
        })
      )
      .subscribe({
        next: (res) => {
          if (res.ok && res.data) {
            // Refresca la vista con lo que devolvió el servidor (fuente
            // de verdad), para que el cambio se vea en la misma pantalla
            // sin tener que cambiar de sección.
            this.usuario = {
              ...(this.usuario ?? {}),
              id: res.data.id,
              nombre: res.data.nombre,
              correo: res.data.correo,
              rol: res.data.rol,
              proveedor: res.data.proveedor,
              fotoUrl: res.data.fotoUrl,
              preferencias: res.data.preferencias,
            };
            this.inicialUsuario = (res.data.nombre.charAt(0) ?? "?").toUpperCase();
            this.formulario.patchValue({
              nombre: res.data.nombre,
              fotoUrl: res.data.fotoUrl ?? "",
            });
            this.mostrarMonedaConSimbolo =
              (res.data.preferencias as { monedaSimbolo?: boolean } | null)
                ?.monedaSimbolo ?? false;
            this.mensajeExito = "Cambios guardados correctamente.";
          } else {
            this.errorMensaje = res.mensaje || "No se pudo actualizar el perfil";
          }
        },
        error: (err) => {
          this.errorMensaje =
            err.error?.mensaje || "No se pudo actualizar el perfil. Inténtalo de nuevo.";
        },
      });
  }
}