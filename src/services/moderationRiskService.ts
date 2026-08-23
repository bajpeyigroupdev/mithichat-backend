import { Types } from "mongoose";
import { User } from "../models/user.model";
import { ChatViolation, IChatViolation } from "../models/chatViolation.model";
import {
  ModerationRiskEvent,
  RiskLevelEnum,
} from "../models/moderationRiskEvent.model";
import { MODERATION_RISK_CONFIG } from "../config/moderationRiskConfig";

export interface RiskCalculationResult {
  score: number;
  level: RiskLevelEnum;
  rawScore: number;
  decayApplied: number; // Factor applied (1.0 = no decay, 0.85 = 15% decay, etc.)
  lastViolationAt?: Date;
  totalViolations: number;
  categoryBreakdown: Record<string, number>;
  mostCommonType: string;
  distinctCategoriesCount: number;
  violations24h: number;
  violations7d: number;
  violations30d: number;
}

/**
 * Maps a numeric risk score (0 to 100) to a Risk Level Enum.
 */
export function mapScoreToRiskLevel(score: number): RiskLevelEnum {
  const { thresholds } = MODERATION_RISK_CONFIG;
  if (score >= thresholds.CRITICAL.min) return "CRITICAL";
  if (score >= thresholds.HIGH.min) return "HIGH";
  if (score >= thresholds.MEDIUM.min) return "MEDIUM";
  return "LOW";
}

/**
 * Calculates a user's authoritative moderation risk score and level.
 * Deterministic, idempotent, and time-aware.
 */
export async function calculateUserModerationRisk(
  userId: string | Types.ObjectId
): Promise<RiskCalculationResult> {
  const targetUserId = String(userId);

  // Fetch all chat violation records for the user
  const violations = await ChatViolation.find({ sender: targetUserId })
    .sort({ createdAt: -1 })
    .lean();

  const totalViolations = violations.length;

  // Default clean profile if zero violations
  if (totalViolations === 0) {
    return {
      score: 0,
      level: "LOW",
      rawScore: 0,
      decayApplied: 1.0,
      totalViolations: 0,
      categoryBreakdown: {},
      mostCommonType: "NONE",
      distinctCategoriesCount: 0,
      violations24h: 0,
      violations7d: 0,
      violations30d: 0,
    };
  }

  const now = new Date();
  const lastViolationAt = new Date(violations[0].createdAt);

  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Frequency time-window counts
  let violations1h = 0;
  let violations24h = 0;
  let violations7d = 0;
  let violations30d = 0;

  // Category breakdown & Evasion detection
  const categoryBreakdown: Record<string, number> = {};
  let obfuscatedCount = 0;

  for (const v of violations) {
    const vDate = new Date(v.createdAt);
    const cat = v.violationType || "CONTACT_SHARING";
    const attempts = v.attemptCount || 1;

    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + attempts;

    if (cat === "OBFUSCATED_CONTACT") {
      obfuscatedCount += attempts;
    }

    if (vDate >= oneHourAgo) violations1h += attempts;
    if (vDate >= twentyFourHoursAgo) violations24h += attempts;
    if (vDate >= sevenDaysAgo) violations7d += attempts;
    if (vDate >= thirtyDaysAgo) violations30d += attempts;
  }

  const distinctCategoriesCount = Object.keys(categoryBreakdown).length;

  // Most common violation category
  let mostCommonType = "NONE";
  let maxCatCount = 0;
  for (const [cat, count] of Object.entries(categoryBreakdown)) {
    if (count > maxCatCount) {
      maxCatCount = count;
      mostCommonType = cat;
    }
  }

  // 1. BASE VIOLATION CATEGORY POINTS
  let basePoints = 0;
  const cfg = MODERATION_RISK_CONFIG;

  for (const [cat, count] of Object.entries(categoryBreakdown)) {
    const weight = cfg.categoryPoints[cat] ?? 10;
    // Cap contribution per single category to prevent runaway scaling from simple repeated digits
    const catContribution = Math.min(weight * count, weight * 4);
    basePoints += catContribution;
  }

  // 2. REPEAT FREQUENCY BONUS (Bounded & Non-duplicate)
  let frequencyBonus = 0;
  if (violations1h >= 3) {
    frequencyBonus += 20;
  } else if (violations1h >= 2) {
    frequencyBonus += 10;
  }

  if (violations24h >= 5) {
    frequencyBonus += 25;
  }

  // 3. ESCALATION HISTORY WEIGHT
  let escalationWeight = 0;
  const userDoc = await User.findById(targetUserId).select(
    "lastEscalationAction accountReviewRequired chatMuteUntil"
  );
  if (userDoc) {
    const action = userDoc.lastEscalationAction || "WARNING";
    escalationWeight = cfg.escalationWeights[action] || 0;

    if (userDoc.accountReviewRequired) {
      escalationWeight = Math.max(escalationWeight, cfg.escalationWeights.ACCOUNT_REVIEW_REQUIRED);
    }
  }

  // 4. BYPASS / EVASION MULTIPLIER
  let bypassBonus = 0;
  if (obfuscatedCount > 0) {
    bypassBonus = Math.min(obfuscatedCount * 8, 25);
  }

  // Raw Score Computation
  let rawScore = basePoints + frequencyBonus + escalationWeight + bypassBonus;

  // 5. TIME DECAY MODEL
  // Evaluate decay based on days elapsed since the last violation
  const daysSinceLastViolation =
    (now.getTime() - lastViolationAt.getTime()) / (1000 * 60 * 60 * 24);

  let decayFactor = 1.0;
  if (daysSinceLastViolation >= 90) {
    decayFactor = cfg.decay.ninetyDays.factor; // 90% reduction
  } else if (daysSinceLastViolation >= 30) {
    decayFactor = cfg.decay.thirtyDays.factor; // 50% reduction
  } else if (daysSinceLastViolation >= 7) {
    decayFactor = cfg.decay.sevenDays.factor; // 15% reduction
  }

  let finalScore = Math.round(rawScore * decayFactor);

  // Clamp final score between 0 and 100
  finalScore = Math.max(0, Math.min(100, finalScore));

  const level = mapScoreToRiskLevel(finalScore);

  return {
    score: finalScore,
    level,
    rawScore,
    decayApplied: decayFactor,
    lastViolationAt,
    totalViolations,
    categoryBreakdown,
    mostCommonType,
    distinctCategoriesCount,
    violations24h,
    violations7d,
    violations30d,
  };
}

/**
 * Updates a user's risk score and level idempotently.
 * Emits real-time socket events and records audit history on material changes.
 */
export async function updateUserModerationRisk(
  userId: string | Types.ObjectId,
  violationId?: string | Types.ObjectId
): Promise<{
  updated: boolean;
  previousScore: number;
  newScore: number;
  previousLevel: RiskLevelEnum;
  newLevel: RiskLevelEnum;
  levelEscalated: boolean;
}> {
  const targetUserId = String(userId);
  const user = await User.findById(targetUserId);
  if (!user) {
    return {
      updated: false,
      previousScore: 0,
      newScore: 0,
      previousLevel: "LOW",
      newLevel: "LOW",
      levelEscalated: false,
    };
  }

  // Idempotency Check: If violationId provided and already recorded in ModerationRiskEvent, return early
  if (violationId) {
    const existingEvent = await ModerationRiskEvent.findOne({
      userId: targetUserId,
      violationId,
    });
    if (existingEvent) {
      return {
        updated: false,
        previousScore: existingEvent.previousScore,
        newScore: existingEvent.newScore,
        previousLevel: existingEvent.previousLevel,
        newLevel: existingEvent.newLevel,
        levelEscalated: false,
      };
    }
  }

  const previousScore = user.moderationRiskScore || 0;
  const previousLevel = (user.moderationRiskLevel as RiskLevelEnum) || "LOW";

  const riskResult = await calculateUserModerationRisk(targetUserId);
  const newScore = riskResult.score;
  const newLevel = riskResult.level;

  // Update user document projection fields
  user.moderationRiskScore = newScore;
  user.moderationRiskLevel = newLevel;
  if (riskResult.lastViolationAt) {
    user.moderationLastViolationAt = riskResult.lastViolationAt;
  }
  await user.save();

  // Check if risk score or level changed materially
  const isMaterialScoreChange = Math.abs(newScore - previousScore) >= 3;
  const isLevelChange = previousLevel !== newLevel;
  const isViolationProcessing = Boolean(violationId);

  const levelRank: Record<RiskLevelEnum, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  };
  const levelEscalated = levelRank[newLevel] > levelRank[previousLevel];

  if (isLevelChange || isMaterialScoreChange || isViolationProcessing) {
    let reason = `Risk updated: ${previousScore} (${previousLevel}) → ${newScore} (${newLevel})`;
    if (levelEscalated) {
      reason = `🚨 Risk level escalated from ${previousLevel} to ${newLevel} (Score: ${newScore})`;
    } else if (isViolationProcessing) {
      reason = `Risk processed for violation ${violationId} (Score: ${newScore}, Level: ${newLevel})`;
    }

    try {
      await ModerationRiskEvent.create({
        userId: user._id,
        violationId: violationId ? new Types.ObjectId(String(violationId)) : undefined,
        previousScore,
        newScore,
        previousLevel,
        newLevel,
        reason,
      });
    } catch (evtErr: any) {
      console.warn("ModerationRiskEvent duplicate creation suppressed:", evtErr?.message);
    }

    // Broadcast real-time socket event 'moderationRisk:updated' to admin room 'admin_moderation'
    try {
      const { getIO } = require("../sockets");
      const io = getIO();
      if (io) {
        const payload = {
          userId: targetUserId,
          user: {
            _id: String(user._id),
            userId: user.userId,
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role,
          },
          riskScore: newScore,
          riskLevel: newLevel,
          previousRiskScore: previousScore,
          previousRiskLevel: previousLevel,
          levelEscalated,
          violationId: violationId ? String(violationId) : undefined,
          updatedAt: new Date(),
        };

        io.to("admin_moderation").emit("moderationRisk:updated", payload);
        io.to("admin_moderation").emit("moderation_risk:updated", payload);
      }
    } catch (sockErr: any) {
      console.warn("Socket broadcast warning for moderation risk:", sockErr?.message);
    }
  }

  return {
    updated: true,
    previousScore,
    newScore,
    previousLevel,
    newLevel,
    levelEscalated,
  };
}

/**
 * Returns comprehensive repeat offender risk profile summary.
 */
export async function getRiskProfile(userId: string | Types.ObjectId) {
  const targetUserId = String(userId);
  const user = await User.findById(targetUserId).lean();
  if (!user) return null;

  const riskResult = await calculateUserModerationRisk(targetUserId);

  // IP / Device Correlation Signal
  let potentiallyRelatedAccountsCount = 0;
  if (user.ipAddress || user.lastIp || (user as any).lastLoginIp || user.device?.currentDeviceId) {
    const targetIp = user.ipAddress || user.lastIp || (user as any).lastLoginIp || "";
    const targetDeviceId = user.device?.currentDeviceId || (user as any).deviceId || "";

    const queryConditions: any[] = [];
    if (targetIp) queryConditions.push({ ipAddress: targetIp }, { lastIp: targetIp });
    if (targetDeviceId) queryConditions.push({ "device.currentDeviceId": targetDeviceId });

    if (queryConditions.length > 0) {
      potentiallyRelatedAccountsCount = await User.countDocuments({
        _id: { $ne: user._id },
        $or: queryConditions,
        isDeleted: false,
      });
    }
  }

  const now = new Date();
  const isMuted = Boolean(
    user.chatMuteUntil && new Date(user.chatMuteUntil).getTime() > now.getTime()
  );

  return {
    userId: targetUserId,
    user: {
      _id: String(user._id),
      userId: user.userId,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      image: user.image,
      role: user.role,
      isBlocked: user.isBlocked,
    },
    riskScore: riskResult.score,
    riskLevel: riskResult.level,
    rawScore: riskResult.rawScore,
    timeDecayApplied: riskResult.decayApplied,
    totalViolations: riskResult.totalViolations,
    violationsLast24h: riskResult.violations24h,
    violationsLast7d: riskResult.violations7d,
    violationsLast30d: riskResult.violations30d,
    mostCommonViolationType: riskResult.mostCommonType,
    distinctCategoriesCount: riskResult.distinctCategoriesCount,
    categoryBreakdown: riskResult.categoryBreakdown,
    lastViolationAt: riskResult.lastViolationAt,
    currentChatRestriction: {
      isMuted,
      chatMuteUntil: user.chatMuteUntil,
      chatMuteReason: user.chatMuteReason,
      chatMuteViolationCount: user.chatMuteViolationCount || 0,
    },
    accountReviewStatus: {
      accountReviewRequired: Boolean(user.accountReviewRequired),
      accountReviewReason: user.accountReviewReason || "",
      lastEscalationAction: user.lastEscalationAction || "NONE",
      lastEscalatedAt: user.lastEscalatedAt,
    },
    potentiallyRelatedAccountsCount,
  };
}

/**
 * Returns paginated audit risk timeline history.
 */
export async function getRiskHistory(
  userId: string | Types.ObjectId,
  page = 1,
  limit = 20
) {
  const targetUserId = String(userId);
  const skip = (page - 1) * limit;

  const [events, total] = await Promise.all([
    ModerationRiskEvent.find({ userId: targetUserId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ModerationRiskEvent.countDocuments({ userId: targetUserId }),
  ]);

  return {
    events,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Returns paginated high-risk users for admin dashboard.
 */
export async function getHighRiskUsers(options: {
  riskLevel?: string;
  minScore?: number;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = options.page || 1;
  const limit = options.limit || 20;
  const skip = (page - 1) * limit;

  const filter: any = { isDeleted: false };

  if (options.riskLevel && options.riskLevel !== "ALL") {
    filter.moderationRiskLevel = options.riskLevel;
  } else {
    // Default show users with risk level MEDIUM, HIGH, or CRITICAL
    filter.moderationRiskLevel = { $in: ["MEDIUM", "HIGH", "CRITICAL"] };
  }

  if (options.minScore !== undefined) {
    filter.moderationRiskScore = { $gte: options.minScore };
  }

  if (options.search?.trim()) {
    const searchRegex = new RegExp(options.search.trim(), "i");
    filter.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { phoneNumber: searchRegex },
      { userId: Number(options.search.trim()) || -1 },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select(
        "userId name email image role isBlocked moderationRiskScore moderationRiskLevel moderationLastViolationAt chatMuteUntil accountReviewRequired"
      )
      .sort({ moderationRiskScore: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}
