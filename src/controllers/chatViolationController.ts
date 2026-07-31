import { Response } from "express";
import { AuthRequest } from "../middlewares/authorize.middleware";
import { ChatViolation } from "../models/chatViolation.model";
import { User } from "../models/user.model";
import { BlockedUser } from "../models/blockedUser.model";
import sendResponse from "../utils/reponse";
import { Logger } from "../utils/logger";
import { getIO, getUserRoom } from "../sockets";

/**
 * GET /api/moderation/violations
 * Admin endpoint to list & filter flagged chat message violations
 */
export const getChatViolations = async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.user || {};
    if (!["owner", "operator", "superAdmin", "admin"].includes(role || "")) {
      return sendResponse(res, 403, false, "Permission denied");
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const skip = (page - 1) * limit;

    const {
      status,
      violationType,
      severity,
      search,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filter: any = {};

    if (status && status !== "ALL") {
      filter.status = status;
    }
    if (violationType && violationType !== "ALL") {
      filter.violationType = violationType;
    }
    if (severity && severity !== "ALL") {
      filter.severity = severity;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate as string);
      if (endDate) filter.createdAt.$lte = new Date(endDate as string);
    }

    // Handle search by matching sender/receiver user names or text
    if (search) {
      const searchRegex = new RegExp(String(search).trim(), "i");
      const matchedUsers = await User.find({
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { phoneNumber: searchRegex },
          { userId: !isNaN(Number(search)) ? Number(search) : undefined },
        ].filter(Boolean) as any,
      }).select("_id");

      const userIds = matchedUsers.map((u) => u._id);

      filter.$or = [
        { content: searchRegex },
        { sender: { $in: userIds } },
        { receiver: { $in: userIds } },
      ];
    }

    const sortOptions: any = {};
    sortOptions[String(sortBy)] = sortOrder === "asc" ? 1 : -1;

    const [violations, total] = await Promise.all([
      ChatViolation.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .populate("sender", "userId name email phoneNumber image role isBlocked")
        .populate("receiver", "userId name email phoneNumber image role")
        .populate("reviewedBy", "userId name role")
        .lean(),
      ChatViolation.countDocuments(filter),
    ]);

    // Aggregate overall statistics
    const [totalCount, pendingCount, highSeverityCount, actionTakenCount] = await Promise.all([
      ChatViolation.countDocuments(),
      ChatViolation.countDocuments({ status: "PENDING" }),
      ChatViolation.countDocuments({ severity: "HIGH" }),
      ChatViolation.countDocuments({ actionTaken: "USER_BLOCKED" }),
    ]);

    return sendResponse(res, 200, true, "Chat violations retrieved successfully", {
      violations,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      stats: {
        total: totalCount,
        pending: pendingCount,
        highSeverity: highSeverityCount,
        blockedUsers: actionTakenCount,
      },
    });
  } catch (error: any) {
    await Logger("getChatViolations", error);
    return sendResponse(res, 500, false, error.message || "Failed to retrieve chat violations");
  }
};

/**
 * PATCH /api/moderation/violations/:id/dismiss
 * Dismiss a chat violation record
 */
export const dismissChatViolation = async (req: AuthRequest, res: Response) => {
  try {
    const { role, id: adminId } = req.user || {};
    if (!["owner", "operator", "superAdmin", "admin"].includes(role || "")) {
      return sendResponse(res, 403, false, "Permission denied");
    }

    const { id } = req.params;
    const violation = await ChatViolation.findById(id);

    if (!violation) {
      return sendResponse(res, 404, false, "Chat violation record not found");
    }

    violation.status = "DISMISSED";
    violation.actionTaken = "DISMISSED";
    violation.reviewedBy = adminId as any;
    violation.reviewedAt = new Date();
    await violation.save();

    return sendResponse(res, 200, true, "Chat violation dismissed successfully", violation);
  } catch (error: any) {
    await Logger("dismissChatViolation", error);
    return sendResponse(res, 500, false, error.message || "Failed to dismiss violation");
  }
};

/**
 * POST /api/moderation/violations/:id/block-user
 * Block the violating user using existing account blocking infrastructure
 */
export const blockUserViolation = async (req: AuthRequest, res: Response) => {
  try {
    const { role, id: adminId } = req.user || {};
    if (!["owner", "operator", "superAdmin", "admin"].includes(role || "")) {
      return sendResponse(res, 403, false, "Permission denied");
    }

    const { id } = req.params;
    const violation = await ChatViolation.findById(id).populate("sender");

    if (!violation) {
      return sendResponse(res, 404, false, "Chat violation record not found");
    }

    const sender = await User.findById(violation.sender);
    if (!sender) {
      return sendResponse(res, 404, false, "Violating user not found");
    }

    // 1. Enforce user block via existing model properties
    sender.isBlocked = true;
    sender.activeToken = "";
    sender.refreshToken = "";
    await sender.save();

    // 2. Log in BlockedUser model
    await BlockedUser.create({
      userId: sender.userId,
      blockedBy: adminId,
      reason: `Blocked for chat content violation: ${violation.violationType} (${violation.reason || 'Prohibited text'})`,
    });

    // 3. Disconnect sockets & force logout using existing socket infrastructure
    try {
      const io = getIO();
      const userRoom = getUserRoom(String(sender.userId));
      io.to(userRoom).emit("force_logout", {
        message: "Aapka account security policy violation (phone/link/@ handle) ki wajah se block kar diya gaya hai.",
        code: "ACCOUNT_BLOCKED",
        reason: "Account blocked for chat violation",
      });
      io.in(userRoom).disconnectSockets(true);
    } catch (sockErr: any) {
      console.warn("Socket force logout warning in chat violation block:", sockErr.message);
    }

    // 4. Update violation record
    violation.status = "ACTION_TAKEN";
    violation.actionTaken = "USER_BLOCKED";
    violation.reviewedBy = adminId as any;
    violation.reviewedAt = new Date();
    await violation.save();

    return sendResponse(res, 200, true, "Violating user blocked and logged successfully", {
      violation,
      user: {
        userId: sender.userId,
        name: sender.name,
        isBlocked: sender.isBlocked,
      },
    });
  } catch (error: any) {
    await Logger("blockUserViolation", error);
    return sendResponse(res, 500, false, error.message || "Failed to block violating user");
  }
};
