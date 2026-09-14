import "dotenv/config";
import cors from "cors";
import express, { Request, Response } from "express";
import { errorHandler } from "../middlewares/errorHandler";
import authRoutes from "./auth/routes/auth.routes";
import ingresosRoutes from "./ingresos/routes/ingreso.routes";
import expensesRoutes from "./expenses/routes/gasto.routes";
import categoriasRoutes from "./categorias/routes/categoria.routes";

export const app = express();

// --- Middlewares globales ---
app.use(cors()); // permite que Angular (otro puerto/origen) consuma la API
app.use(express.json()); // parsea el body de las peticiones como JSON

// --- Ruta de salud (útil para probar que el server está vivo) ---
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, mensaje: "API Control de Gastos funcionando" });
});

// --- Registro de rutas de cada módulo ---
app.use("/api/auth", authRoutes);
app.use("/api/ingresos", ingresosRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/categorias", categoriasRoutes);

// --- Middleware de errores: SIEMPRE al final, después de las rutas ---
app.use(errorHandler);
