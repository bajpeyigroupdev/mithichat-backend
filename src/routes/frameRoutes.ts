import { Router } from "express";
import * as levelController from "../controllers/frameController";
// import { upload } from "../utils/multer";
import { verifyToken } from "../middlewares/authorize.middleware";

const router = Router();

router.post("/", verifyToken, levelController.createLevel);
router.get("/", levelController.getLevels);
router.delete("/:id", levelController.deleteLevel);

export default router;
