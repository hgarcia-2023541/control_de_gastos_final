import { CommonModule } from "@angular/common";
import { Component, inject, OnDestroy, OnInit } from "@angular/core";
import { FinancialBackground } from '../../shared/components/financial-background/financial-background';
import { Router, RouterLink } from "@angular/router";
import { FormBuilder, ReactiveFormsModule, Validators, ValidatorFn } from "@angular/forms";
import { AuthService } from "../../core/services/auth.service";
import { Subscription } from "rxjs";

@Component({
  selector: "app-registro",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, FinancialBackground],
  templateUrl: "./registro.component.html",
  styleUrl: "./registro.component.css",
})
export class RegistroComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private subscription?: Subscription;

  cargando = false;
  errorMensaje = "";

  // Validación de grupo: las contraseñas deben coincidir.
  private contraseñasCoinciden: ValidatorFn = (grupo) => {
    const pass = grupo.get("password")?.value as string | null;
    const conf = grupo.get("confirmar")?.value as string | null;
    if (pass && conf && pass !== conf) {
      return { noCoinciden: true };
    }
    return null;
  };

  formulario = this.fb.group(
    {
      nombre: ["", [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
      correo: ["", [Validators.required, Validators.email]],
      password: ["", [Validators.required, Validators.minLength(6), Validators.maxLength(100)]],
      confirmar: ["", [Validators.required]],
    },
    { validators: this.contraseñasCoinciden }
  );

  get nombre() {
    return this.formulario.get("nombre")!;
  }
  get correo() {
    return this.formulario.get("correo")!;
  }
  get password() {
    return this.formulario.get("password")!;
  }
  get confirmar() {
    return this.formulario.get("confirmar")!;
  }

  ngOnInit(): void {
    // Si ya hay sesión, no tiene sentido mostrar el registro.
    if (this.authService.estaAutenticado()) {
      this.router.navigate(["/inicio"]);
    }
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  enviar(): void {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid) {
      if (this.formulario.errors?.["noCoinciden"]) {
        this.errorMensaje = "Las contraseñas no coinciden.";
      }
      return;
    }

    const { nombre, correo, password, confirmar } = this.formulario.value;

    if (!nombre || !correo || !password || !confirmar) {
      this.errorMensaje = "Por favor, complete todos los campos";
      return;
    }

    if (password !== confirmar) {
      this.errorMensaje = "Las contraseñas no coinciden.";
      return;
    }

    this.cargando = true;
    this.errorMensaje = "";

    // El rol SIEMPRE es "user": el formulario ni siquiera lo pide y el
    // backend lo fuerza.
    this.subscription = this.authService
      .registro({
        nombre: nombre.trim(),
        correo: correo.trim().toLowerCase(),
        password,
      })
      .subscribe({
        next: (response) => {
          this.cargando = false;
          if (response.ok) {
            // No inicia sesión automáticamente: se manda al login a
            // presentar sus credenciales (como pide el flujo).
            this.router.navigate(["/login"], {
              state: {
                mensajeRegistro:
                  response.mensaje ||
                  "Cuenta creada exitosamente. Ya puede iniciar sesión.",
              },
            });
          } else {
            this.errorMensaje = response.mensaje || "No se pudo crear la cuenta";
          }
        },
        error: (err) => {
          this.cargando = false;
          this.errorMensaje =
            err.error?.mensaje ||
            "No se pudo crear la cuenta. Verifique los datos e intente de nuevo.";
        },
      });
  }
}