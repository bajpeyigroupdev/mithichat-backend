import express from "express";
import { submitHelpRequest, submitSupportRequest, getMyHelpRequests } from "../controllers/userController";
import { verifyToken } from "../middlewares/authorize.middleware";

const router = express.Router();

router.get("/", verifyToken, getMyHelpRequests as any);
router.post("/", verifyToken, submitHelpRequest as any);
router.post("/support", verifyToken, submitSupportRequest as any);

export default router;
