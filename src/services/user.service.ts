import { User } from "../models/user.model";
import { cacheService } from "../utils/cache";
import HostLevel from "../models/hostLevel.model";
import { CoinsTransaction } from "../models/spentCoinModel";
import { CallStatus, TransactionType } from "../constants/user";
import { ClientSession, Types } from "mongoose";

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Helper to calculate Monday-to-Sunday weekly time bounds in Asia/Kolkata (IST) timezone
 */
export const getWeeklyTimeBounds = (refDate: Date = new Date()) => {
    const istNow = dayjs(refDate).tz('Asia/Kolkata');
    const dayOfWeek = istNow.day(); // 0 is Sunday, 1 is Monday
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const startOfWeekIST = istNow.add(diffToMonday, 'day').startOf('day');
    const endOfWeekIST = startOfWeekIST.add(6, 'day').endOf('day');

    return {
        startOfWeek: startOfWeekIST.toDate(),
        endOfWeek: endOfWeekIST.toDate()
    };
};

export const getPreviousWeekBounds = (refDate: Date = new Date()) => {
    const istNow = dayjs(refDate).tz('Asia/Kolkata');
    const lastWeekDate = istNow.subtract(7, 'day').toDate();
    return getWeeklyTimeBounds(lastWeekDate);
};

/**
 * Recalculate and update host level dynamically in DB based on weekly completed calls and minutes.
 */
export const recalculateAndUpdateHostLevel = async (
  hostId: Types.ObjectId | string,
  session?: ClientSession,
  customBounds?: { startOfWeek: Date; endOfWeek: Date }
): Promise<number> => {
  try {
    const bounds = customBounds || getWeeklyTimeBounds();

    const transactions = await CoinsTransaction.find({
      hostId,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ENDED,
      createdAt: { $gte: bounds.startOfWeek, $lte: bounds.endOfWeek }
    }).select('duration').session(session || null as any).lean();

    const totalCalls = transactions.length;
    const totalDurationSeconds = transactions.reduce(
      (sum, t) => sum + Number(t.duration || 0),
      0
    );
    const totalMinutes = Math.floor(totalDurationSeconds / 60);

    const now = new Date();
    const hostUser = await User.findById(hostId).select('level createdAt').session(session || null as any).lean();
    if (!hostUser) return 1;

    const createdAt = (hostUser as any).createdAt ? new Date((hostUser as any).createdAt) : now;
    const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const isPromoActive = diffDays <= 7;

    const allLevels = await HostLevel.find({
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: now } }
      ]
    }).session(session || null as any).sort({ level: -1 }).lean();

    const realLevels = allLevels.filter(lvl => lvl.level > 0);
    let qualifiedLevel = 1;

    for (const lvl of realLevels) {
      if (totalCalls >= (lvl.minCalls || 0) && totalMinutes >= (lvl.minMinutes || 0)) {
        qualifiedLevel = lvl.level;
        break;
      }
    }

    // 🌟 7-Day New User Promo Rule:
    // New users start at Level 3 for the first 7 days.
    // After 7 days expire, level drops/updates to their actual qualified level based on performance (starts at Level 1).
    const targetLevel = isPromoActive ? Math.max(3, qualifiedLevel) : qualifiedLevel;

    const currentStoredLevel = (hostUser as any)?.level || 0;

    if (currentStoredLevel !== targetLevel) {
      await User.findByIdAndUpdate(
        hostId,
        { $set: { level: targetLevel } },
        { session: session || null as any }
      );
      console.log(`🎉 Host ${hostId} level updated from ${currentStoredLevel} to ${targetLevel} (promo active: ${isPromoActive})`);
    }

    return targetLevel;
  } catch (error) {
    console.error(`Error in recalculateAndUpdateHostLevel for ${hostId}:`, error);
    const fallbackUser = await User.findById(hostId).select('level').session(session || null as any).lean();
    return (fallbackUser as any)?.level || 1;
  }
};

let activeLockToken: string | null = null;
let lockHeartbeatTimer: NodeJS.Timeout | null = null;

const RECALC_LOCK_KEY = 'lock:weekly_host_level_recalculation';
const RECALC_LOCK_TTL_SECONDS = 600; // 10-minute safety TTL
const HEARTBEAT_INTERVAL_MS = 30000; // 30-second heartbeat renewal interval

const stopLockHeartbeat = () => {
    if (lockHeartbeatTimer) {
        clearInterval(lockHeartbeatTimer);
        lockHeartbeatTimer = null;
    }
};

const startLockHeartbeat = (token: string) => {
    stopLockHeartbeat();
    lockHeartbeatTimer = setInterval(async () => {
        if (activeLockToken !== token) {
            stopLockHeartbeat();
            return;
        }
        try {
            const redis = (await import('../configs/redisConfig')).default;
            const luaScript = `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("expire", KEYS[1], ARGV[2])
                else
                    return 0
                end
            `;
            const renewed = await redis.eval(luaScript, 1, RECALC_LOCK_KEY, token, String(RECALC_LOCK_TTL_SECONDS));
            if (Number(renewed) === 0) {
                console.error("🚨 CRITICAL: Lost Redis distributed lock ownership during weekly recalculation! Halting renewal.");
                activeLockToken = null;
                stopLockHeartbeat();
            }
        } catch (err: any) {
            console.error("⚠️ Error renewing Redis recalculation lock TTL:", err?.message);
        }
    }, HEARTBEAT_INTERVAL_MS);
};

const acquireRecalculationLock = async (): Promise<string | null> => {
    const token = `owner_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    try {
        const redis = (await import('../configs/redisConfig')).default;
        const res = await redis.set(RECALC_LOCK_KEY, token, 'EX', RECALC_LOCK_TTL_SECONDS, 'NX');
        if (res === 'OK') {
            activeLockToken = token;
            startLockHeartbeat(token);
            return token;
        }
        console.warn("⚠️ Weekly Host Level Recalculation lock acquired by another process/cluster node.");
        return null;
    } catch (err: any) {
        console.error('❌ Redis lock acquisition error:', err?.message);
        // SAFETY MANDATE: In multi-instance mode, do NOT fallback to independent local locks when Redis is down
        console.warn('⚠️ Weekly host level recalculation skipped because distributed lock service (Redis) is unavailable.');
        return null;
    }
};

const releaseRecalculationLock = async (token: string) => {
    stopLockHeartbeat();
    activeLockToken = null;
    try {
        const redis = (await import('../configs/redisConfig')).default;
        const luaScript = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        await redis.eval(luaScript, 1, RECALC_LOCK_KEY, token);
    } catch (err: any) {
        console.error('⚠️ Error releasing Redis recalculation lock via Lua script:', err?.message);
    }
};

/**
 * Runs batch weekly host level recalculation for all active hosts.
 * Called automatically every Sunday midnight (Monday 00:00:00 IST) by Cron.
 * Protected by Redis distributed lock with ownership token & heartbeat renewal.
 */
export const runWeeklyHostLevelRecalculation = async () => {
    const lockToken = await acquireRecalculationLock();
    if (!lockToken) {
        return { success: false, message: "Weekly host level recalculation skipped: Lock not acquired or Redis unavailable", total: 0, upgraded: 0, downgraded: 0, unchanged: 0, errors: 0 };
    }

    console.log(`⏰ Starting Weekly Host Level Recalculation (Lock Token: ${lockToken} in Asia/Kolkata)...`);
    try {
        const hosts = await User.find({ role: 'host', isDeleted: false }).select('_id level name').lean();
        const bounds = getPreviousWeekBounds();
        let upgraded = 0;
        let downgraded = 0;
        let unchanged = 0;
        let errors = 0;

        for (const host of hosts) {
            // Fail-safe lock loss check: halt if lock ownership was lost mid-job
            if (activeLockToken !== lockToken) {
                console.error(`🚨 CRITICAL: Halting recalculation batch — lock token ${lockToken} was revoked or lost.`);
                break;
            }

            try {
                const oldLevel = host.level || 1;
                const newLevel = await recalculateAndUpdateHostLevel(host._id as any, undefined, bounds);
                if (newLevel > oldLevel) upgraded++;
                else if (newLevel < oldLevel) downgraded++;
                else unchanged++;
            } catch (hostErr) {
                errors++;
                console.error(`❌ Error recalculating level for host ${host._id}:`, hostErr);
            }
        }

        console.log(`✅ Weekly Host Level Recalculation Complete! Total: ${hosts.length} | Upgraded: ${upgraded} | Downgraded: ${downgraded} | Unchanged: ${unchanged} | Errors: ${errors}`);
        return { success: true, total: hosts.length, upgraded, downgraded, unchanged, errors };
    } catch (err: any) {
        console.error("❌ Error in runWeeklyHostLevelRecalculation:", err);
        throw err;
    } finally {
        await releaseRecalculationLock(lockToken);
    }
};

interface GetAllHostsOptions {
  role: string;
  page: number;
  limit: number;
  tab?: string;
  language?: string; // Explicit language filter
}

export const getAllHostsService = async ({
  role,
  page,
  limit,
  userId, // <-- pass the logged-in user's ID here
  tab = 'All',
  language,
}: GetAllHostsOptions & { userId?: string }) => {
  // Create cache key based on parameters
  const cacheKey = `hosts:${role}:${page}:${limit}:${userId || 'none'}:${tab}`;

  // Try to get from cache first (2 minute TTL for host list)
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Debug Logging
  if (userId) {
    console.log(`🔍 getAllHostsService called for userId: ${userId} (Role: ${role}) - Excluding self`);
  }

  const skip = (page - 1) * limit;

  // Base filter
  let filter: any = { role: "host", isDeleted: false }; // 🧠 Remove isOnline: true default

  if (language) {
    // Hosts map languages as an array, match explicitly or via regex
    filter.languages = { $regex: new RegExp(`^${language}$`, 'i') };
  }

  let fields =
    "userId name image isOnline audio audioPrice videoPrice language languages hobbies isActive bio country role isVerified faceVerificationStatus kycVerificationStatus";

  // Role-based access
  switch (role) {
    case "superAdmin":
      fields += " isBlocked";
      break;

    case "admin":
      filter.isBlocked = false;
      break;

    case "user":
    case "host":
      filter.isBlocked = false;
      filter.isActive = true;
      filter.isOnline = true; // Hide hosts on home screen when they log out or delete/uninstall the app

      // 🧠 Exclude the current host's own record
      if (userId) {
        // Handle both ObjectId string and Numeric userId
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(userId);
        if (isObjectId) {
          filter._id = { $ne: userId };
        } else {
          // If it's not an ObjectId, assume it's the numeric userId
          // (or handle both if uncertain)
          filter.userId = { $ne: userId };
        }
      }
      break;

    default:
      throw new Error("Access Denied");
  }

  // Count total hosts
  const totalHosts = await User.countDocuments(filter);


  // Sorting Logic
  let sort: any = { isOnline: -1, createdAt: -1 }; // Default (All/Star)

  if (tab === 'New') {
    sort = { createdAt: -1 }; // Newest first
  } else if (tab === 'Trending') {
    sort = { coins: -1, isOnline: -1 }; // Most rich/popular first
  }

  // Fetch hosts
  const hosts = await User.find(filter)
    .select(fields)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  // 🧠 BACKWARD COMPATIBILITY:
  // Old APKs use 'isOnline' to show the Green Dot.
  // Since we now rely on 'isActive' (Push Notifications) for backgrounded hosts,
  // we effectively treat them as "Online" if they are 'isActive'.
  const mappedHosts = hosts.map((host: any) => ({
    ...host,
    isOnline: !!host.isActive, // Enforce 'online' display if they are Active
  }));

  const result = {
    hosts: mappedHosts,
    totalHosts,
    currentPage: page,
    totalPages: Math.ceil(totalHosts / limit),
    limit,
  };

  // Cache the result for 2 minutes
  cacheService.set(cacheKey, result, 120);

  return result;
};

/**
 * Invalidate host cache when host status changes
 */
export const invalidateHostCache = () => {
  cacheService.invalidatePattern('hosts:');
};

