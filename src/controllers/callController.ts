import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import agoraToken from 'agora-token';
import { Response } from 'express';
import { Types } from "mongoose";
const { RtcTokenBuilder, RtcRole } = agoraToken;

import { CoinsTransaction } from '../models/spentCoinModel';
import { CallStatus, TransactionType } from '../constants/user';
import { AuthRequest } from '../middlewares/authorize.middleware';
import sendResponse from '../utils/reponse';
import { getIO, getUserRoom } from '../sockets';
import { log } from 'console';
import { config } from '../configs/envConfig';
import { updateBalance } from '../services/coins.service';
import { convertToHMS } from '../utils/time.util';
import { User } from '../models/user.model';
import { BillingService } from '../services/billing.service';
import { sendCallNotification } from '../utils/pushNotification';
import { getCachedSettings } from './settingsController';

const APP_ID = config.AGORA_APP_ID!;
const APP_CERTIFICATE = config.AGORA_APP_CERTIFICATE!;

// export const startCall = async (req: AuthRequest, res: Response) => {
//   try {
//     const { hostId } = req.body || {};
//     const { id: userId, coins, name } = req.user || {};

//     if (!userId || !hostId || coins == null) {
//       return sendResponse(res, 400, false, "all things required");
//     }
//     if (coins < CALL_RATE_PER_MINUTE) {
//       return sendResponse(res, 400, false, "Insufficient balance to start a call");
//     }

//     const host = await User.findById(hostId);

//     if (host?.isBusy) {
//       return sendResponse(res, 400, false, "Host busy, try again");
//     }

//     const maxMinutes = Math.floor(coins / CALL_RATE_PER_MINUTE);
//     const expirationTimeInSeconds = maxMinutes * 60;
//     const nowSec = Math.floor(Date.now() / 1000);
//     const tokenExpireTs = nowSec + expirationTimeInSeconds;
//     const TOKEN_LIFETIME = 86400;
//     const channelName = `call${Date.now()}${uuidv4().replace(/-/g, '').slice(0, 6)}`;


//     // Generate UIDs
//     const callerAgoraUid = Math.floor(Math.random() * 1e9);
//     const hostAgoraUid = Math.floor(Math.random() * 1e9);

//     // Generate tokens
//     const tokenDuration = expirationTimeInSeconds; // maxMinutes * 60

//     const callerToken = RtcTokenBuilder.buildTokenWithUid(
//       APP_ID,
//       APP_CERTIFICATE,
//       channelName,
//       callerAgoraUid,
//       RtcRole.PUBLISHER,
//       tokenDuration,      // Set tokenExpire to the call duration
//       tokenDuration       // Set privilegeExpire to the call duration
//     );

//     const hostToken = RtcTokenBuilder.buildTokenWithUid(
//       APP_ID,
//       APP_CERTIFICATE,
//       channelName,
//       hostAgoraUid,
//       RtcRole.PUBLISHER,
//       tokenDuration,      // Set tokenExpire to the call duration
//       tokenDuration       // Set privilegeExpire to the call duration
//     );

//     console.log('user id and host id : ', hostId , userId)
//     const transaction = await CoinsTransaction.create({
//       userId,
//       hostId,
//       type: TransactionType.VOICE_CALL,
//       status: CallStatus.PENDING, // waiting for host to pick up
//       meta: {
//         channelName,
//         callerAgoraUid,
//         hostAgoraUid,
//         callerToken,
//         hostToken,
//       },
//     });
//   console.log('host socket id :  ',hostId.toString())
//     const hostSocketId = getSocketIdByUserId(hostId.toString());
//       console.log('host socket id :  ',hostSocketId)
//     if (hostSocketId) {
//       getIO().to(hostSocketId).emit("incomingCall", {
//         transactionId: transaction._id,
//         channelName,
//         // caller: { userId, username: name },
//         name,
//         agora: {
//           hostToken,
//           hostAgoraUid,
//           callerToken,
//           callerAgoraUid,
//         },
//         maxMinutes,
//       });
//     }

//     return sendResponse(res, 201, true, "Call started successfully", {
//       transactionId: transaction._id,
//       channelName,
//       maxMinutes,
//       expiresInSeconds: expirationTimeInSeconds,
//       expiresAt: tokenExpireTs,
//       agora: {
//         callerToken,
//         callerAgoraUid,
//         hostToken,
//         hostAgoraUid,
//       },
//     });

//   } catch (error: any) {
//     return sendResponse(res, 500, false, error.message || "Failed to start call");
//   }
// };

// export const endCall = async (req: AuthRequest, res: Response) => {
//   try {
//     const { transactionId } = req.body || {};
//     if (!transactionId) {
//       return sendResponse(res, 400, false, "Required field: transactionId");
//     }

//     const transaction = await CoinsTransaction.findById(transactionId);
//     if (!transaction) {
//       return sendResponse(res, 404, false, "Transaction not found");
//     }

//     // 🛑 Already ended → avoid duplicate deduction
//     if (transaction.status === CallStatus.ENDED) {
//       return sendResponse(res, 200, true, "Call already ended", {
//         transactionId: transaction._id,
//         duration: transaction.duration,
//         coinsSpent: transaction.coinsSpent,
//         hostEarning: transaction.hostEarning,
//       });
//     }

//     // 📴 If call never started (no callStart), no deduction
//     if (!transaction.callStart) {
//       transaction.status = CallStatus.MISSED || "missed";
//       transaction.callEnd = new Date();
//       transaction.duration = 0;
//       transaction.coinsSpent = 0;
//       transaction.hostEarning = 0;
//       await transaction.save();
//       return sendResponse(res, 200, true, "Call never connected, no coins deducted", {
//         transactionId: transaction._id,
//         duration: 0,
//         coinsSpent: 0,
//         hostEarning: 0,
//       });
//     }

//     // ✅ Mark call end
//     transaction.callEnd = new Date();
//     transaction.status = CallStatus.ENDED;

//     // 🕒 Calculate duration
//     const durationSec = Math.floor(
//       (transaction.callEnd.getTime() - transaction.callStart.getTime()) / 1000
//     );
//     transaction.duration = durationSec;

//     // 💰 Calculate coins spent & host earning
//     const coinsSpent = Math.round(durationSec * CALL_RATE_PER_SECOND);
//     const hostEarning = Math.round(durationSec * HOST_SHARE_PER_SECOND);

//     transaction.coinsSpent = coinsSpent;
//     transaction.hostEarning = hostEarning;

//     // ✅ Deduct only if duration > 0
//     if (durationSec > 0) {
//       await updateBalance(transaction.userId, coinsSpent, "deduct");
//       await updateBalance(transaction.hostId, hostEarning, "earn");
//     }

//     await transaction.save();
//     const hostId = transaction.hostId;
//     await User.findByIdAndUpdate({
//       hostId,
//       isBusy: false,
//     })
//     return sendResponse(res, 200, true, "Call ended successfully", {
//       transactionId: transaction._id,
//       duration: transaction.duration,
//       coinsSpent: transaction.coinsSpent,
//       hostEarning: transaction.hostEarning,
//     });
//   } catch (error: any) {
//     console.log('error : ', error)
//     return sendResponse(res, 500, false, error.message || "Failed to end call");
//   }
// };


// FIXED startCall function
export const startCall = async (req: AuthRequest, res: Response) => {
  try {
    const { hostId } = req.body || {};
    const { id: userId, coins, name, image: callerImage } = req.user || {};

    console.log('🔵 START CALL REQUEST:', { userId, hostId, coins });

    const settings = await getCachedSettings();
    const CALL_RATE_PER_MINUTE = settings.callRatePerMinute || 100;

    if (!userId || !hostId || coins == null) {
      return sendResponse(res, 400, false, "all things required");
    }
    if (coins < CALL_RATE_PER_MINUTE) {
      return sendResponse(res, 400, false, "Insufficient balance to start a call");
    }

    // Check if host exists
    const host = await User.findById(hostId);
    if (!host) {
      return sendResponse(res, 404, false, "Host not found");
    }

    if (host.isBusy) {
      return sendResponse(res, 400, false, "Host busy, try again");
    }

    // ⚠️ CRITICAL: Check presence via Redis instead of local map
    // We assume if they have a room with sockets, they are online.
    const io = getIO();
    const hostRoom = getUserRoom(hostId.toString());
    const sockets = await io.in(hostRoom).allSockets();

    // Fallback: Check 'isOnline' in DB.
    // NOTE: allSockets() works with RedisAdapter to count sockets across ALL nodes.
    const isOnline = sockets.size > 0;

    console.log('🔌 Host presence check:', {
      hostId: hostId.toString(),
      room: hostRoom,
      socketCount: sockets.size
    });

    // We will use Push Notification to wake them up if they are backgrounded.
    // However, if they have explicitly toggled their availability OFF (isActive = false),
    // they MUST NOT receive calls, even if their app is currently open (isOnline = true).
    if (!host.isActive) {
      console.error('❌ Host is NOT Active (Availability turned off). Blocking call.');
      return sendResponse(res, 400, false, "Host is currently offline");
    } else if (!isOnline && host.isActive) {
      console.log('⚠️ Host socket offline, but isActive is TRUE. Proceeding with Push Notification flow.');
    }

    // Set host as busy ATOMICALLY
    const updatedHost = await User.findOneAndUpdate(
      { _id: hostId, isBusy: false },
      { $set: { isBusy: true } },
      { new: true }
    );

    if (!updatedHost) {
      console.error('❌ Failed to set host as busy (might be in another call)');
      return sendResponse(res, 400, false, "Host became busy, try again");
    }

    const maxMinutes = Math.floor(coins / CALL_RATE_PER_MINUTE);
    const expirationTimeInSeconds = maxMinutes * 60;
    const channelName = `call${Date.now()}${uuidv4().replace(/-/g, '').slice(0, 6)}`;

    const callerAgoraUid = Math.floor(Math.random() * 1e9);
    const hostAgoraUid = Math.floor(Math.random() * 1e9);
    const tokenDuration = expirationTimeInSeconds;

    const callerToken = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      callerAgoraUid,
      RtcRole.PUBLISHER,
      tokenDuration,
      tokenDuration
    );

    const hostToken = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      hostAgoraUid,
      RtcRole.PUBLISHER,
      tokenDuration,
      tokenDuration
    );

    const transaction = await CoinsTransaction.create({
      userId,
      hostId,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.PENDING,
      meta: {
        channelName,
        callerAgoraUid,
        hostAgoraUid,
        callerToken,
        hostToken,
      },
    });

    console.log('💾 Transaction created:', transaction._id);

    // Emit incoming call
    const callPayload = {
      transactionId: transaction._id,
      channelName,
      name,
      callerName: name,
      callerId: userId,
      agora: {
        hostToken,
        hostAgoraUid,
        callerToken,
        callerAgoraUid,
      },
      maxMinutes,
      callerImage,
      calleeImage: host.image,
    };

    console.log('📤 Emitting incomingCall to room:', hostRoom);

    // Broadcast to Host's Room
    io.to(hostRoom).emit("incomingCall", callPayload);

    // 🔔 Send FCM Push to Host (VOIP Wake-up)
    // ONLY check if host is 'isActive' (Live)
    const hostAny = host as any;
    if (hostAny.fcmToken && hostAny.isActive) {
      sendCallNotification(
        hostAny.fcmToken,
        name || "Unknown User",
        callerImage || "",
        (transaction as any)._id.toString(),
        false, // isVideo
        {
          channelName,
          maxMinutes: String(maxMinutes),
          agoraString: JSON.stringify({
            hostToken,
            hostAgoraUid,
            callerToken,
            callerAgoraUid,
            appId: APP_ID
          })
        }
      );
    }

    return sendResponse(res, 201, true, "Call started successfully", {
      transactionId: transaction._id,
      channelName,
      maxMinutes,
      expiresInSeconds: expirationTimeInSeconds,
      agora: {
        callerToken,
        callerAgoraUid,
        hostToken,
        hostAgoraUid,
      },
    });

  } catch (error: any) {
    console.error('❌ START CALL ERROR:', error);
    if (req.body?.hostId) {
      await User.findByIdAndUpdate(req.body.hostId, { $set: { isBusy: false } });
    }
    return sendResponse(res, 500, false, error.message || "Failed to start call");
  }
};



// FIXED endCall function
export const endCall = async (req: AuthRequest, res: Response) => {
  try {
    const { transactionId } = req.body || {};
    if (!transactionId) {
      return sendResponse(res, 400, false, "Required field: transactionId");
    }

    const result = await BillingService.processCallEnd(transactionId);

    return sendResponse(
      res,
      result.statusCode,
      result.success,
      result.message,
      result.data
    );

  } catch (error: any) {
    console.log('error : ', error);
    return sendResponse(res, 500, false, error.message || "Failed to end call");
  }
};


export const getCallHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id: userId, role } = req.user || {};

    if (!userId) {
      return sendResponse(res, 400, false, "User not authenticated");
    }

    // role-wise filter
    const filter = role === "host" ? { hostId: userId } : { userId };

    const query: any = {
      ...filter,
      type: { $in: [TransactionType.VOICE_CALL, TransactionType.GIFT] },
      status: "ended",
    };

    // 🗓️ Date Filtering
    const days = parseInt(req.query.days as string) || 3000; // default 3000 days (all)
    if (days) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      query.callStart = { $gte: startDate };
    }

    const transactions = await CoinsTransaction.find(query)
      .populate("userId", "name image")
      .populate("hostId", "name image")
      .sort({ callStart: -1 })
      .lean();

    if (!transactions.length) {
      return sendResponse(res, 200, true, "No history found", {
        totalTiming: "0 Hours 0 Min 0 Sec",
        calls: [],
      });
    }

    // ✅ Safe numeric conversion for duration
    const totalDurationSeconds = transactions
      .filter((t) => t.type === TransactionType.VOICE_CALL)
      .reduce((sum, t) => sum + Number(t.duration || 0), 0);

    // Format total time
    const hours = Math.floor(totalDurationSeconds / 3600);
    const minutes = Math.floor((totalDurationSeconds % 3600) / 60);
    const seconds = totalDurationSeconds % 60;
    const totalTiming = `${hours} Hours ${minutes} Min ${seconds} Sec`;

    // Format records for UI
    const formattedCalls = transactions.map((t) => {
      // ✅ Type guard for populated user/host objects
      const userObj =
        typeof t.userId === "object" && t.userId !== null
          ? (t.userId as { _id: Types.ObjectId; name?: string; image?: string })
          : undefined;

      const hostObj =
        typeof t.hostId === "object" && t.hostId !== null
          ? (t.hostId as { _id: Types.ObjectId; name?: string; image?: string })
          : undefined;

      const partnerName =
        role === "host" ? userObj?.name || "User" : hostObj?.name || "Host";

      const partnerId =
        role === "host" ? userObj?._id?.toString() : hostObj?._id?.toString();

      const partnerImage =
        role === "host" ? userObj?.image : hostObj?.image;

      // ✅ Safe duration formatting
      const formattedDuration =
        t.duration && t.type === TransactionType.VOICE_CALL
          ? new Date(Number(t.duration) * 1000).toISOString().substring(11, 19)
          : null;

      return {
        name: partnerName,
        id: partnerId,
        image: partnerImage,
        type: t.type,
        voice: t.type === TransactionType.VOICE_CALL ? Number(t.coinsSpent) || 0 : 0,
        gift: t.type === TransactionType.GIFT ? Number(t.coinsSpent) || 0 : 0,
        commission:
          role === "host" && t.type === TransactionType.VOICE_CALL
            ? Number(t.hostEarning) || 0
            : undefined,
        duration: formattedDuration,
        callStart: t.callStart,
        callEnd: t.callEnd,
        date: t.callStart
          ? new Date(t.callStart).toLocaleDateString("en-GB")
          : new Date(t.createdAt).toLocaleDateString("en-GB"),
      };
    });

    // Final response
    const result = {
      totalTiming,
      calls: formattedCalls,
    };

    return sendResponse(res, 200, true, "History fetched successfully", result);
  } catch (error: any) {
    console.error("Error fetching call history:", error);
    return sendResponse(
      res,
      500,
      false,
      error.message || "Failed to fetch call history"
    );
  }
};

// type = 'time' | 'call' | 'coins'
// range = 'daily' | 'weekly' | 'monthly'



export const getRanking = async (req: AuthRequest, res: Response) => {
  const { type = 'time', range = 'daily' } = req.query;

  // 1️⃣ Determine date range
  const now = new Date();
  let startDate: dayjs.Dayjs;
  if (range === 'daily') startDate = dayjs(now).startOf('day');
  else if (range === 'weekly') startDate = dayjs(now).subtract(7, 'day');
  else if (range === 'monthly') startDate = dayjs(now).subtract(30, 'day');
  else startDate = dayjs(now).startOf('day');

  // 2️⃣ Aggregate calls
  let sortField: 'time' | 'call' | 'coins' = 'time';
  if (type === 'time') sortField = 'time';
  else if (type === 'call') sortField = 'call';
  else if (type === 'coins') sortField = 'coins';

  const ranking = await CoinsTransaction.aggregate([
    {
      $match: {
        callStart: { $gte: startDate.toDate() },
        type: { $in: [TransactionType.VOICE_CALL, TransactionType.GIFT] }
      }
    },
    // Fix Duplicates: Convert hostId to ObjectId to ensure grouping matches generic user OIDs
    {
      $addFields: {
        hostIdObj: { $toObjectId: "$hostId" }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'hostIdObj', // Use converted ID
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $group: {
        _id: '$hostIdObj', // Group by standard ObjectId
        name: { $first: '$user.name' },
        time: { $sum: { $ifNull: [{ $toDouble: '$duration' }, 0] } }, // Ensure numeric
        call: { $sum: 1 },
        coins: { $sum: { $ifNull: [{ $toDouble: '$hostEarning' }, 0] } }, // Ensure numeric
      },
    },
    { $sort: { [sortField]: -1 } },
    { $limit: 10 },
  ]);

  console.log('📊 Ranking Aggregation Result:', JSON.stringify(ranking, null, 2));

  // 3️⃣ Format Data
  const formattedRanking = ranking.map((item, index) => {
    // Format Time: HH:MM:SS
    const totalSeconds = item.time || 0;
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');

    // Frontend expects keys: 'time', 'call', 'coins' (lowercase) based on activeMetric
    return {
      rank: index + 1,
      name: item.name || "Unknown",
      time: `${h}:${m}:${s}`,
      call: item.call || 0,
      coins: item.coins || 0,
    };
  });

  res.json({
    success: true,
    data: formattedRanking,
  });
};



import LevelModel from '../models/level.model';

export const getHostLevels = async (req: AuthRequest, res: Response) => {
  try {
    const { id: userId, role } = req.user || {};

    if (!userId) {
      return sendResponse(res, 400, false, "User not authenticated");
    }

    if (role !== "host") {
      return sendResponse(res, 403, false, "Only hosts can access levels");
    }

    const transactions = await CoinsTransaction.find({
      hostId: userId,
      type: TransactionType.VOICE_CALL,
      status: "ended",
    }).lean();

    const totalCalls = transactions.length;
    const totalDurationSeconds = transactions.reduce(
      (sum, t) => sum + Number(t.duration || 0),
      0
    );

    const levelData = await LevelModel.find().sort({ level: -1 }).lean();

    const thresholds = [
      { level: 1, minCalls: 1000, minDuration: 57600 },
      { level: 2, minCalls: 500, minDuration: 28800 },
      { level: 3, minCalls: 200, minDuration: 14400 },
      { level: 4, minCalls: 100, minDuration: 7200 },
      { level: 5, minCalls: 50, minDuration: 3600 },
      { level: 6, minCalls: 0, minDuration: 0 },
    ];

    let currentLevelNum = 6;

    for (const thr of thresholds) {
      if (
        totalCalls >= thr.minCalls &&
        totalDurationSeconds >= thr.minDuration
      ) {
        currentLevelNum = thr.level;
        break;
      }
    }

    await User.findByIdAndUpdate(userId, { level: currentLevelNum });

    return sendResponse(res, 200, true, "Host level fetched successfully", {
      levelData,
      totalCalls,
      totalDuration: totalDurationSeconds,
      currentLevel: currentLevelNum,
    });

  } catch (error: any) {
    console.error("Error fetching host levels:", error);
    return sendResponse(
      res,
      500,
      false,
      error.message || "Failed to fetch host levels"
    );
  }
};

// Admin: Get all call history
export const getAllCallHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.user || {};

    if (!role || !["admin", "superAdmin"].includes(role)) {
      return sendResponse(res, 403, false, "Access Denied");
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const transactions = await CoinsTransaction.find({
      type: { $in: [TransactionType.VOICE_CALL, TransactionType.GIFT] },
      status: "ended",
    })
      .populate("userId", "name")
      .populate("hostId", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalTransactions = await CoinsTransaction.countDocuments({
      type: { $in: [TransactionType.VOICE_CALL, TransactionType.GIFT] },
      status: "ended",
    });

    // Format records for UI
    const formattedCalls = transactions.map((t) => {
      const userObj =
        typeof t.userId === "object" && t.userId !== null
          ? (t.userId as { _id: Types.ObjectId; name?: string })
          : undefined;

      const hostObj =
        typeof t.hostId === "object" && t.hostId !== null
          ? (t.hostId as { _id: Types.ObjectId; name?: string })
          : undefined;

      const formattedDuration =
        t.duration && t.type === TransactionType.VOICE_CALL
          ? new Date(Number(t.duration) * 1000).toISOString().substring(11, 19)
          : null;

      return {
        id: t._id,
        callerName: userObj?.name || "Unknown User",
        hostName: hostObj?.name || "Unknown Host",
        type: t.type,
        voice: t.type === TransactionType.VOICE_CALL ? Number(t.coinsSpent) || 0 : 0,
        gift: t.type === TransactionType.GIFT ? Number(t.coinsSpent) || 0 : 0,
        hostEarning: Number(t.hostEarning) || 0,
        duration: formattedDuration,
        callStart: t.callStart,
        callEnd: t.callEnd,
        date: t.callStart
          ? new Date(t.callStart).toISOString()
          : new Date(t.createdAt).toISOString(),
      };
    });

    return sendResponse(res, 200, true, "All call history fetched successfully", {
      calls: formattedCalls,
      total: totalTransactions,
      page,
      limit,
      totalPages: Math.ceil(totalTransactions / limit)
    });

  } catch (error: any) {
    return sendResponse(res, 500, false, error.message || "Failed to fetch all call history");
  }
};

// Pulse Endpoint for Heartbeat
export const pulse = async (req: AuthRequest, res: Response) => {
  try {
    const { transactionId } = req.body || {};
    if (!transactionId) return sendResponse(res, 400, false, "Transaction ID required");

    await BillingService.processPulse(transactionId);
    return sendResponse(res, 200, true, "Pulse ack");
  } catch (error) {
    return sendResponse(res, 500, false, "Pulse failed");
  }
};
