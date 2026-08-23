import { Router } from "express";
import {
  getChatViolations,
  getUnreadViolationCount,
  getChatViolationById,
  updateChatViolationStatus,
  dismissChatViolation,
  blockUserViolation,
  unmuteUserChat,
  dismissAccountReview,
} from "../controllers/chatViolationController";
import { verifyToken } from "../middlewares/authorize.middleware";

const router = Router();

// All moderation routes require authenticated token with management RBAC role
router.get("/violations", verifyToken, getChatViolations);
router.get("/violations/unread-count", verifyToken, getUnreadViolationCount);
router.get("/violations/:id", verifyToken, getChatViolationById);
router.patch("/violations/:id/status", verifyToken, updateChatViolationStatus);
router.patch("/violations/:id/dismiss", verifyToken, dismissChatViolation);
router.post("/violations/:id/block-user", verifyToken, blockUserViolation);

// User escalation management routes
router.post("/users/:userId/unmute", verifyToken, unmuteUserChat);
router.patch("/users/:userId/review-status", verifyToken, dismissAccountReview);

export default router;
