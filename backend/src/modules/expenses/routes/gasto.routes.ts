import { Router } from "express";
import { actualizar, crear, eliminar, listar } from "../controllers/gasto.controller";
import { verificarToken } from "../../../middlewares/auth.middleware";

const router = Router();

router.get("/", verificarToken, listar);
router.post("/", verificarToken, crear);
router.put("/:id", verificarToken, actualizar);
router.delete("/:id", verificarToken, eliminar);

export default router;
