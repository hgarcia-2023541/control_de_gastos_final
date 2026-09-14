import { Router } from "express";
import {
  refrescar,
  login,
  registrar,
  registrarPublico,
  google,
  actualizarMiPerfil,
  listar,
  actualizarRol,
  desactivar,
} from "../controllers/auth.controller";
import { verificarToken } from "../../../middlewares/auth.middleware";

const router = Router();

// Públicas: cualquiera puede registrarse o intentar iniciar sesión
// (tradicional o con Google).
router.post("/login", login);
router.post("/registro-publico", registrarPublico);
router.post("/google", google);

// Protegidas: requieren un token válido. Cada controlador verifica
// además que el usuario autenticado tenga rol "admin" antes de
// continuar (ver auth.controller.ts).
router.post("/registrar", verificarToken, registrar);
router.get("/usuarios", verificarToken, listar);
router.patch("/usuarios/:id/rol", verificarToken, actualizarRol);
router.patch("/usuarios/:id/desactivar", verificarToken, desactivar);
router.post("/refresh", verificarToken, refrescar);

// Perfil propio: cualquier usuario autenticado, solo sus propios datos.
router.patch("/perfil", verificarToken, actualizarMiPerfil);

export default router;