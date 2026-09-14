import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";
import { AuthService, MENSAJE_LOGOUT } from "../../../core/services/auth.service";

interface ItemMenu {
  etiqueta: string;
  ruta: string;
  icono: "inicio" | "gastos" | "ingresos" | "reportes" | "categorias" | "configuracion";
}

@Component({
  selector: "app-sidebar",
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: "./sidebar.component.html",
  styleUrl: "./sidebar.component.css",
})
export class SidebarComponent {
  private authService = inject(AuthService);

  usuario = this.authService.obtenerUsuario();
  inicialUsuario = (this.usuario?.nombre?.charAt(0) ?? "?").toUpperCase();

  // Rutas reales: "inicio" ya existía (es el Dashboard). Las demás son
  // páginas "próximamente" mientras no exista el módulo expenses en el
  // backend (ver ProximamenteComponent y DashboardService).
  items: ItemMenu[] = [
    { etiqueta: "Inicio", ruta: "/inicio", icono: "inicio" },
    { etiqueta: "Gastos", ruta: "/gastos", icono: "gastos" },
    { etiqueta: "Ingresos", ruta: "/ingresos", icono: "ingresos" },
    { etiqueta: "Reportes", ruta: "/reportes", icono: "reportes" },
    { etiqueta: "Categorías", ruta: "/categorias", icono: "categorias" },
    { etiqueta: "Configuración", ruta: "/configuracion", icono: "configuracion" },
  ];

  cerrarSesion(): void {
    // Se borran token/sesión (dentro de logout) y se navega a /login con
    // el mensaje de confirmación, que Login muestra como aviso de éxito.
    this.authService.logout(MENSAJE_LOGOUT);
  }
}
