import express from "express";
import { submitHelpRequest, submitSupportRequest, getMyHelpRequests, replyToHelpTicket } from "../controllers/userController";
import { verifyToken } from "../middlewares/authorize.middleware";

const router = express.Router();

router.get("/", verifyToken, getMyHelpRequests as any);
router.post("/", verifyToken, submitHelpRequest as any);
router.post("/support", verifyToken, submitSupportRequest as any);
router.post("/:id/reply", verifyToken, replyToHelpTicket as any);  // User reply/reopen

export default router;
