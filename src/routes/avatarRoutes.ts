import express from "express";
import * as avatarController from "../controllers/avatarController";

// import { verifyToken } from "../middlewares/authorize.middleware";
// import { upload } from "../utils/multer";
import { verifyToken } from "../middlewares/authorize.middleware";
const router = express.Router();

router.post('/', verifyToken, avatarController.createAvatar);
router.get('/:gender', verifyToken, avatarController.getAvatars);
router.delete("/:id", avatarController.deleteAvatar);

export default router;