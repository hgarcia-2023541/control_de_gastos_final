import { Router } from "express";
import { verificarToken } from "../../../middlewares/auth.middleware";
import {
  actualizar,
  crear,
  eliminar,
  listar,
} from "../controllers/categoria.controller";

const router = Router();

// Todas las rutas de categorías requieren sesión.
router.use(verificarToken);

router.get("/", listar);
router.post("/", crear);
router.put("/:id", actualizar);
router.delete("/:id", eliminar);

export default router;