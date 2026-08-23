import express, { Response } from "express";
import { AuthRequest, verifyToken } from "../middlewares/authorize.middleware";
import { requireModerationPermission } from "../middlewares/moderationPermission.middleware";
import sendResponse from "../utils/reponse";
import { Logger } from "../utils/logger";
import {
  getRiskProfile,
  getRiskHistory,
  getHighRiskUsers,
  updateUserModerationRisk,
} from "../services/moderationRiskService";
import { User } from "../models/user.model";

const router = express.Router();

/**
 * GET /api/moderation/users/:userId/risk-profile
 * Returns detailed Trust & Safety Risk Profile & Repeat Offender Intelligence.
 * Requires permission: moderation:view
 */
router.get(
  "/moderation/users/:userId/risk-profile",
  verifyToken,
  requireModerationPermission("moderation:view"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return sendResponse(res, 400, false, "User ID is required");
      }

      const profile = await getRiskProfile(userId);
      if (!profile) {
        return sendResponse(res, 404, false, "User not found");
      }

      return sendResponse(res, 200, true, "Risk profile fetched successfully", profile);
    } catch (error: any) {
      await Logger("getRiskProfileEndpoint", error);
      return sendResponse(res, 500, false, error.message || "Failed to fetch risk profile");
    }
  }
);

/**
 * GET /api/moderation/users/:userId/risk-history
 * Returns paginated Moderation Risk Event audit timeline.
 * Requires permission: moderation:view
 */
router.get(
  "/moderation/users/:userId/risk-history",
  verifyToken,
  requireModerationPermission("moderation:view"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

      if (!userId) {
        return sendResponse(res, 400, false, "User ID is required");
      }

      const historyData = await getRiskHistory(userId, page, limit);
      return sendResponse(res, 200, true, "Risk history fetched successfully", historyData);
    } catch (error: any) {
      await Logger("getRiskHistoryEndpoint", error);
      return sendResponse(res, 500, false, error.message || "Failed to fetch risk history");
    }
  }
);

/**
 * GET /api/moderation/high-risk-users
 * Returns paginated list of high-risk users.
 * Requires permission: moderation:view
 */
router.get(
  "/moderation/high-risk-users",
  verifyToken,
  requireModerationPermission("moderation:view"),
  async (req: AuthRequest, res: Response) => {
    try {
      const riskLevel = String(req.query.riskLevel || "ALL");
      const minScore = req.query.minScore ? Number(req.query.minScore) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

      const result = await getHighRiskUsers({
        riskLevel,
        minScore,
        search,
        page,
        limit,
      });

      return sendResponse(res, 200, true, "High-risk users fetched successfully", result);
    } catch (error: any) {
      await Logger("getHighRiskUsersEndpoint", error);
      return sendResponse(res, 500, false, error.message || "Failed to fetch high-risk users");
    }
  }
);

/**
 * POST /api/moderation/users/:userId/risk-action
 * Admin action endpoint to recalculate risk, clear review status, or unmute user.
 * Requires permission: moderation:action or moderation:risk-action
 */
router.post(
  "/moderation/users/:userId/risk-action",
  verifyToken,
  requireModerationPermission("moderation:action"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { action, note } = req.body || {};

      if (!userId) {
        return sendResponse(res, 400, false, "User ID is required");
      }

      const user = await User.findById(userId);
      if (!user) {
        return sendResponse(res, 404, false, "User not found");
      }

      if (action === "RECALCULATE") {
        const updateResult = await updateUserModerationRisk(userId);
        return sendResponse(res, 200, true, "User risk score recalculated", updateResult);
      }

      if (action === "CLEAR_REVIEW") {
        user.accountReviewRequired = false;
        user.accountReviewReason = "";
        await user.save();
        await updateUserModerationRisk(userId);
        return sendResponse(res, 200, true, "Account review status cleared");
      }

      if (action === "UNMUTE") {
        user.chatMuteUntil = undefined;
        user.chatMuteReason = "";
        await user.save();
        await updateUserModerationRisk(userId);
        return sendResponse(res, 200, true, "User chat unmuted");
      }

      return sendResponse(res, 400, false, "Invalid risk action specified");
    } catch (error: any) {
      await Logger("postRiskActionEndpoint", error);
      return sendResponse(res, 500, false, error.message || "Failed to perform risk action");
    }
  }
);

export default router;
