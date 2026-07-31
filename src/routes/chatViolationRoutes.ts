import { Router } from "express";
import {
  getChatViolations,
  dismissChatViolation,
  blockUserViolation,
} from "../controllers/chatViolationController";
import { verifyToken } from "../middlewares/authorize.middleware";

const router = Router();

// All moderation routes require authenticated token with management RBAC role
router.get("/violations", verifyToken, getChatViolations);
router.patch("/violations/:id/dismiss", verifyToken, dismissChatViolation);
router.post("/violations/:id/block-user", verifyToken, blockUserViolation);

export default router;
