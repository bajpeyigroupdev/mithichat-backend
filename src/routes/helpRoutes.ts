import express from "express";
import { submitHelpRequest, submitSupportRequest } from "../controllers/userController";
import { verifyToken } from "../middlewares/authorize.middleware";
// import { upload } from "../utils/multer";

const router = express.Router();

router.post("/", verifyToken, submitHelpRequest as any);
router.post("/support", verifyToken, submitSupportRequest as any);

export default router;
