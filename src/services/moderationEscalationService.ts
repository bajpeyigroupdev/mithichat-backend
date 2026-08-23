import { Types } from "mongoose";
import { User } from "../models/user.model";
import { ChatViolation, IChatViolation } from "../models/chatViolation.model";
import { MODERATION_ESCALATION } from "../configs/moderationEscalationConfig";

export type EscalationAction =
  | "WARNING"
  | "TEMPORARY_CHAT_MUTE"
  | "EXTENDED_CHAT_MUTE"
  | "ACCOUNT_REVIEW_REQUIRED";

export interface EscalationEvaluationResult {
  action: EscalationAction;
  muteUntil?: Date;
  accountReviewRequired: boolean;
  total24h: number;
  total7d: number;
  alreadyHandled: boolean;
}

export async function evaluateModerationEscalation(
  userId: string | Types.ObjectId,
  violationId?: string | Types.ObjectId
): Promise<EscalationEvaluationResult> {
  const targetUserId = String(userId);
  let targetViolation: IChatViolation | null = null;

  if (violationId) {
    targetViolation = await ChatViolation.findById(violationId);
  }

  // Idempotency check: If violation is already processed for escalation, return existing status
  if (targetViolation && targetViolation.escalationHandled) {
    const user = await User.findById(targetUserId);
    return {
      action: (targetViolation.escalationAction as EscalationAction) || "WARNING",
      muteUntil: user?.chatMuteUntil,
      accountReviewRequired: !!user?.accountReviewRequired,
      total24h: 0,
      total7d: 0,
      alreadyHandled: true,
    };
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Query recent violations for this user
  const [violations24h, violations7d] = await Promise.all([
    ChatViolation.find({
      sender: targetUserId,
      createdAt: { $gte: twentyFourHoursAgo },
    }).lean(),
    ChatViolation.find({
      sender: targetUserId,
      createdAt: { $gte: sevenDaysAgo },
    }).lean(),
  ]);

  // Total violation attempt counts across documents
  const total24h = violations24h.reduce((acc, v) => acc + (v.attemptCount || 1), 0);
  const total7d = violations7d.reduce((acc, v) => acc + (v.attemptCount || 1), 0);

  let chosenAction: EscalationAction = "WARNING";
  let muteUntil: Date | undefined = undefined;
  let accountReview = false;
  let muteReason = "";

  const cfg = MODERATION_ESCALATION;

  // Level 4: Severe or Persistent Abuse (>= 8 violations in 7 days)
  if (total7d >= cfg.accountReview.violations) {
    chosenAction = "ACCOUNT_REVIEW_REQUIRED";
    accountReview = true;
  }
  // Level 3: Extended Chat Mute (>= 5 violations in 24 hours)
  else if (total24h >= cfg.extendedMute.violations) {
    chosenAction = "EXTENDED_CHAT_MUTE";
    muteUntil = new Date(now.getTime() + cfg.extendedMute.muteHours * 60 * 60 * 1000);
    muteReason = `Extended chat mute for ${cfg.extendedMute.muteHours} hours (${total24h} violations in 24h)`;
  }
  // Level 2: Temporary Chat Mute (>= 3 violations in 24 hours)
  else if (total24h >= cfg.temporaryMute.violations) {
    chosenAction = "TEMPORARY_CHAT_MUTE";
    muteUntil = new Date(now.getTime() + cfg.temporaryMute.muteMinutes * 60 * 1000);
    muteReason = `Temporary chat mute for ${cfg.temporaryMute.muteMinutes} minutes (${total24h} violations in 24h)`;
  }
  // Level 1: Warning (1 violation)
  else {
    chosenAction = "WARNING";
  }

  // Update User account restrictions
  const user = await User.findById(targetUserId);
  if (user) {
    user.chatMuteViolationCount = total7d;
    user.lastEscalationAction = chosenAction;
    user.lastEscalatedAt = now;

    if (accountReview) {
      user.accountReviewRequired = true;
      user.accountReviewReason = `Account flagged for review: ${total7d} contact sharing violation attempts in 7 days`;
    }

    if (muteUntil) {
      // Do not reduce an existing longer mute (take maximum date)
      if (!user.chatMuteUntil || new Date(user.chatMuteUntil).getTime() < muteUntil.getTime()) {
        user.chatMuteUntil = muteUntil;
        user.chatMuteReason = muteReason;
      }
    }

    await user.save();
  }

  // Update target violation record to mark escalation handled (Idempotency)
  if (targetViolation) {
    targetViolation.escalationHandled = true;
    targetViolation.escalationAction = chosenAction;
    await targetViolation.save();
  }

  // Emit real-time Socket.IO notification to admin room 'admin_moderation' for significant escalations
  if (chosenAction !== "WARNING") {
    try {
      const { getIO } = require("../sockets");
      const io = getIO();
      if (io) {
        const payload = {
          userId: targetUserId,
          user: user
            ? {
                _id: String(user._id),
                userId: user.userId,
                name: user.name,
                email: user.email,
                image: user.image,
                role: user.role,
              }
            : undefined,
          action: chosenAction,
          muteUntil: user?.chatMuteUntil,
          accountReviewRequired: !!user?.accountReviewRequired,
          total24h,
          total7d,
          createdAt: now,
        };

        io.to("admin_moderation").emit("moderationEscalation:new", payload);
        io.to("admin_moderation").emit("moderation_escalation:new", payload);
      }
    } catch (sockErr: any) {
      console.warn("Socket broadcast warning for moderation escalation:", sockErr?.message);
    }
  }

  return {
    action: chosenAction,
    muteUntil: user?.chatMuteUntil,
    accountReviewRequired: !!user?.accountReviewRequired,
    total24h,
    total7d,
    alreadyHandled: false,
  };
}
