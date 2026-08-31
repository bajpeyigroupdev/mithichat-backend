import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import agoraToken from 'agora-token';
import { Response } from 'express';
import { Types, isValidObjectId } from "mongoose";
const { RtcTokenBuilder, RtcRole } = agoraToken;

import { CoinsTransaction } from '../models/spentCoinModel';
import { CallStatus, TransactionType } from '../constants/user';
import { AuthRequest } from '../middlewares/authorize.middleware';
import sendResponse from '../utils/reponse';
import { getIO, getUserRoom } from '../sockets';
import { log } from 'console';
import { getAgoraCredentials, getCachedSettings } from './settingsController';
import { updateBalance } from '../services/coins.service';
import { convertToHMS } from '../utils/time.util';
import { User } from '../models/user.model';
import { BillingService } from '../services/billing.service';
import { sendCallNotification, sendMissedCallNotification } from '../utils/pushNotification';
import { notifyHostCallState } from '../services/callStateNotification.service';
import { recalculateAndUpdateHostLevel } from '../services/user.service';
import { CALL_DIAMONDS_PER_MINUTE } from '../configs/monetization';
import redis from '../configs/redisConfig';


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
  let reservedHostId: string | undefined;
  let callerLockKey: string | undefined;
  let callerLockToken: string | undefined;
  try {
    const { randomMatch = false } = req.body || {};
    let hostId = req.body?.hostId as string | undefined;
    const { id: userId, name, image: callerImage } = req.user || {};

    console.log('[CALL] START REQUEST:', { userId, hostId, randomMatch });

    const [runtimeSettings, agoraCredentials] = await Promise.all([getCachedSettings(), getAgoraCredentials()]);
    const CALL_RATE_PER_MINUTE = Math.max(1, Number(runtimeSettings.callRatePerMinute || CALL_DIAMONDS_PER_MINUTE));
    const APP_ID = agoraCredentials.appId;
    const APP_CERTIFICATE = agoraCredentials.certificate;
    if (!APP_ID || !APP_CERTIFICATE) {
      return sendResponse(res, 503, false, 'Calling service is not configured');
    }

    if (!userId || (!hostId && !randomMatch)) {
      return sendResponse(res, 400, false, "Required call details are missing");
    }

    callerLockKey = `call:start:${userId}`;
    callerLockToken = uuidv4();
    const lockAcquired = await redis.set(callerLockKey, callerLockToken, 'EX', 15, 'NX');
    if (lockAcquired !== 'OK') {
      return sendResponse(res, 409, false, "A call request is already being processed");
    }

    // MANDATORY DB BALANCE CHECK (Read freshest value from database)
    const liveCaller = await User.findOne({
      _id: userId,
      isDeleted: { $ne: true },
    }).select('coins diamonds').lean();

    const callerDiamonds = Number(liveCaller?.diamonds || 0);

    console.log(`[CALL] DIAMONDS CHECK | CallerID: ${userId} | Live DB Diamonds: ${callerDiamonds} | Required Rate: ${CALL_RATE_PER_MINUTE}`);

    if (!liveCaller || callerDiamonds < CALL_RATE_PER_MINUTE) {
      console.log('[CALL] INSUFFICIENT DIAMONDS | CALL REJECTED BY BACKEND DB CHECK');
      return sendResponse(res, 402, false, "INSUFFICIENT_DIAMONDS: Your Diamond balance is too low to start this call. Please recharge your Diamonds to continue.", {
        code: 'INSUFFICIENT_DIAMONDS',
        errorCode: 'INSUFFICIENT_DIAMONDS',
        requiredBalance: CALL_RATE_PER_MINUTE,
        currentBalance: callerDiamonds,
      });
    }

    console.log('[CALL] BALANCE OK');

    // Double call / Race condition protection
    const existingActiveCall = await CoinsTransaction.findOne({
      userId,
      status: { $in: [CallStatus.INITIATED, CallStatus.RINGING, CallStatus.ACCEPTED, CallStatus.CONNECTING, CallStatus.CONNECTED] }
    });
    if (existingActiveCall) {
      console.log('[CALL] DOUBLE CALL ATTEMPT BLOCKED | Active TxID:', existingActiveCall._id);
      return sendResponse(res, 400, false, "You already have an active call in progress");
    }

    const availableDiamonds = callerDiamonds;

    let host: any = null;
    if (randomMatch) {
      const candidates = await User.aggregate([
        { $match: { _id: { $ne: new Types.ObjectId(userId) }, role: 'host', isDeleted: { $ne: true }, isActive: true, isBusy: false } },
        { $sample: { size: 12 } },
        { $project: { _id: 1 } },
      ]);
      for (const candidate of candidates) {
        host = await User.findOneAndUpdate(
          { _id: candidate._id, isActive: true, isBusy: false, isDeleted: { $ne: true } },
          { $set: { isBusy: true } },
          { new: true }
        );
        if (host) {
          hostId = String(host._id);
          reservedHostId = hostId;
          break;
        }
      }
      if (!host || !hostId) {
        return sendResponse(res, 404, false, "No active host is available right now");
      }
    } else {
      if (!hostId) {
        return sendResponse(res, 400, false, "Host ID is required");
      }
      host = await User.findOne({
        $or: [
          { _id: isValidObjectId(hostId) ? hostId : null },
          { meethiId: hostId },
          { userId: !isNaN(Number(hostId)) ? Number(hostId) : undefined }
        ]
      });
    }

    if (!host) {
      return sendResponse(res, 404, false, "Host user not found");
    }

    // Clear an orphaned busy flag only when no active transaction exists.
    if (host.isBusy) {
      const activeCall = await CoinsTransaction.findOne({
        hostId: host._id,
        status: { $in: [CallStatus.INITIATED, CallStatus.RINGING, CallStatus.ACCEPTED, CallStatus.CONNECTING, CallStatus.CONNECTED] }
      });
      if (!activeCall) {
        console.log('🧹 Host is marked busy but has no active call transaction. Resetting isBusy lock:', host._id);
        host.isBusy = false;
        await User.findByIdAndUpdate(host._id, { $set: { isBusy: false } });
      } else if (!randomMatch) {
        return sendResponse(res, 400, false, "Host busy, try again");
      }
    }

    // Auto-activate availability for approved hosts if disabled by default
    if ((host.role === 'host' || (host as any).isHost) && host.isActive === false) {
      console.log('⚡ Auto-activating host availability for call:', host._id);
      await User.findByIdAndUpdate(host._id, { $set: { isActive: true } });
      host.isActive = true;
    }

    const io = getIO();
    const hostRoom = getUserRoom(host._id.toString());
    const sockets = await io.in(hostRoom).allSockets();
    const isOnline = sockets.size > 0;

    console.log('🔌 Host presence check:', {
      hostId: host._id.toString(),
      room: hostRoom,
      socketCount: sockets.size
    });

    if (!host.isActive) {
      console.error('❌ Host is NOT Active (Availability turned off). Blocking call.');
      return sendResponse(res, 400, false, "Host is currently offline");
    }

    // Set host as busy ATOMICALLY
    let updatedHost = randomMatch ? host : await User.findOneAndUpdate(
      { _id: host._id, isBusy: false },
      { $set: { isBusy: true, isActive: true } },
      { new: true }
    );


    if (!updatedHost) {
      console.error('❌ Failed to set host as busy (might be in another call)');
      return sendResponse(res, 400, false, "Host became busy, try again");
    }

    if (!randomMatch) {
      reservedHostId = String(host._id);
    }

    const maxMinutes = Math.floor(availableDiamonds / CALL_RATE_PER_MINUTE);
    const expirationTimeInSeconds = maxMinutes * 60;
    const channelName = `call${Date.now()}${uuidv4().replace(/-/g, '').slice(0, 6)}`;

    const callerAgoraUid = Math.floor(Math.random() * 1e9);
    const hostAgoraUid = Math.floor(Math.random() * 1e9);
    const nowSec = Math.floor(Date.now() / 1000);
    // Unix timestamp in seconds for token expiration (86400s / 24h validity window for robustness)
    const tokenExpireTs = nowSec + Math.max(expirationTimeInSeconds, 86400);

    const callerToken = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      callerAgoraUid,
      RtcRole.PUBLISHER,
      tokenExpireTs,
      tokenExpireTs
    );

    const hostToken = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      hostAgoraUid,
      RtcRole.PUBLISHER,
      tokenExpireTs,
      tokenExpireTs
    );

    const transaction = await CoinsTransaction.create({
      userId,
      hostId: host._id,
      type: TransactionType.VOICE_CALL,
      // Persist RINGING before either Socket.IO or FCM can deliver the call.
      // Saving a stale document after emission could otherwise overwrite an
      // ACCEPTED state produced by a fast notification action.
      status: CallStatus.RINGING,
      ringExpiresAt: new Date(Date.now() + 45_000),
      channelName,
      meta: {
        channelName,
        appId: APP_ID,
        callerAgoraUid,
        hostAgoraUid,
        callerToken,
        hostToken,
        maxMinutes,
        reservedDiamonds: maxMinutes * CALL_RATE_PER_MINUTE,
        callDiamondsPerMinute: CALL_RATE_PER_MINUTE,
        platformCommissionRate: Number(runtimeSettings.commissionRate || 0),
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
        appId: APP_ID,
        hostToken,
        hostAgoraUid,
        callerToken,
        callerAgoraUid,
      },
      maxMinutes,
      callerImage,
      calleeImage: host.image,
      createdAt: transaction.createdAt,
      ringExpiresAt: transaction.ringExpiresAt,
      eventAt: transaction.createdAt,
    };

    console.log(`[CALL_INITIATED] Timestamp: ${new Date().toISOString()} | UserID: ${userId} | HostID: ${host._id} | Channel: ${channelName} | TxID: ${transaction._id}`);
    console.log('📤 Emitting incomingCall to rooms:', hostRoom, `user:${host._id}`);

    // Socket.IO unions multi-room broadcasts, so each socket receives one event.
    const hostRooms = [hostRoom];
    if (host.userId) hostRooms.push(`user:${host.userId}`);
    if (host.meethiId) hostRooms.push(`user:${host.meethiId}`);
    io.to(hostRooms).emit("incomingCall", callPayload);

    console.log(`[CALL_RINGING] Timestamp: ${new Date().toISOString()} | TxID: ${transaction._id} | Status: RINGING`);

    // 🔔 Send FCM Push to Host (VOIP Wake-up)
    const hostAny = host as any;
    if (hostAny.fcmToken) {
      const pushResult = await sendCallNotification(
        hostAny.fcmToken,
        name || "Unknown User",
        callerImage || "",
        (transaction as any)._id.toString(),
        false, // isVideo
        {
          channelName,
          maxMinutes: String(maxMinutes),
          createdAt: transaction.createdAt.toISOString(),
          ringExpiresAt: transaction.ringExpiresAt!.toISOString(),
          eventAt: transaction.createdAt.toISOString(),
          agoraString: JSON.stringify({
            hostToken,
            hostAgoraUid,
            callerToken,
            callerAgoraUid,
            appId: APP_ID
          })
        }
      );
      console.log(`[CALL_PUSH] TxID: ${transaction._id} | Success: ${pushResult?.success === true} | Error: ${pushResult?.error || "none"}`);
    } else {
      console.warn(`[CALL_PUSH] TxID: ${transaction._id} | Host has no FCM token; socket delivery only`);
    }

    return sendResponse(res, 201, true, "Call started successfully", {
      transactionId: transaction._id,
      channelName,
      maxMinutes,
      expiresInSeconds: expirationTimeInSeconds,
      callRatePerMinute: CALL_RATE_PER_MINUTE,
      createdAt: transaction.createdAt,
      ringExpiresAt: transaction.ringExpiresAt,
      agora: {
        appId: APP_ID,
        callerToken,
        callerAgoraUid,
        hostToken,
        hostAgoraUid,
      },
      matchedHost: {
        id: String(host._id),
        name: host.name || 'Host',
        image: host.image || '',
        gender: host.gender,
      },
    });

  } catch (error: any) {
    console.error('❌ START CALL ERROR:', error);
    if (reservedHostId) {
      await User.findByIdAndUpdate(reservedHostId, { $set: { isBusy: false } });
    }
    return sendResponse(res, 500, false, error.message || "Failed to start call");
  } finally {
    if (callerLockKey && callerLockToken) {
      await redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        callerLockKey,
        callerLockToken
      ).catch(() => undefined);
    }
  }
};
// FIXED endCall function
export const endCall = async (req: AuthRequest, res: Response) => {
  try {
    const { transactionId, durationSeconds } = req.body || {};
    const participantId = req.user?.id;
    if (!transactionId) {
      return sendResponse(res, 400, false, "Required field: transactionId");
    }

    const transaction = await CoinsTransaction.findOne({
      _id: transactionId,
      $or: [{ userId: participantId }, { hostId: participantId }]
    });
    if (!transaction) {
      return sendResponse(res, 404, false, "Call not found");
    }

    const result = await BillingService.processCallEnd(
      transactionId,
      new Date(),
      0,
      durationSeconds
    );

    if (result.success) {
      const payload = { transactionId };
      const io = getIO();
      io.to(getUserRoom(String(transaction.userId))).emit("callEnded", payload);
      io.to(getUserRoom(String(transaction.hostId))).emit("callEnded", payload);
      await notifyHostCallState(transaction.hostId, String(transaction._id), 'ended');

      // Missed Call Notification
      if (!transaction.callStart && String(transaction.userId) === String(participantId)) {
        // Caller hung up before host answered
        const host = await User.findById(transaction.hostId);
        const caller = await User.findById(transaction.userId);
        if (host && host.fcmToken && caller) {
          await sendMissedCallNotification(
            host.fcmToken,
            caller.name || 'User',
            caller.image || '',
            String(caller._id)
          );
        }
      }
    }

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

export const acceptIncomingCall = async (req: AuthRequest, res: Response) => {
  try {
    const { transactionId } = req.body || {};
    const hostId = req.user?.id;
    if (!transactionId || !hostId) {
      return sendResponse(res, 400, false, "transactionId is required");
    }

    const buildCallData = (record: any) => {
      const meta = record?.meta as any;
      return {
        transactionId,
        channelName: record?.channelName || meta?.channelName,
        agora: {
          callerToken: meta?.callerToken,
          callerAgoraUid: meta?.callerAgoraUid,
          hostToken: meta?.hostToken,
          hostAgoraUid: meta?.hostAgoraUid,
          appId: meta?.appId,
        }
      };
    };

    // Notification actions may be delivered once by the Android headless task
    // and again when the Activity starts. Treat a repeated accept by the same
    // host as success so the app can go straight to the ongoing call.
    const alreadyAccepted = await CoinsTransaction.findOne({
      _id: transactionId,
      hostId,
      status: { $in: [CallStatus.ACCEPTED, CallStatus.CONNECTING, CallStatus.CONNECTED] }
    });
    if (alreadyAccepted) {
      return sendResponse(res, 200, true, "Call already accepted", buildCallData(alreadyAccepted));
    }

    const transaction = await CoinsTransaction.findOneAndUpdate(
      {
        _id: transactionId,
        hostId,
        status: { $in: [CallStatus.INITIATED, CallStatus.RINGING] },
        ringExpiresAt: { $gt: new Date() }
      },
      { status: CallStatus.ACCEPTED, lastHeartbeat: new Date() },
      { new: true }
    );

    if (!transaction) {
      const racedAccept = await CoinsTransaction.findOne({
        _id: transactionId,
        hostId,
        status: { $in: [CallStatus.ACCEPTED, CallStatus.CONNECTING, CallStatus.CONNECTED] }
      });
      if (racedAccept) {
        return sendResponse(res, 200, true, "Call already accepted", buildCallData(racedAccept));
      }
      return sendResponse(res, 409, false, "Call is no longer available");
    }

    await User.findByIdAndUpdate(hostId, { $set: { isBusy: true } });
    const callData = buildCallData(transaction);

    console.log(`[BILLING] CALL ACCEPTED: TransactionID ${transactionId} | HostID ${hostId}`);
    getIO().to(getUserRoom(String(transaction.userId))).emit("callAccepted", callData);
    return sendResponse(res, 200, true, "Call accepted", callData);
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message || "Failed to accept call");
  }
};

export const rejectIncomingCall = async (req: AuthRequest, res: Response) => {
  try {
    const { transactionId } = req.body || {};
    const hostId = req.user?.id;
    if (!transactionId || !hostId) {
      return sendResponse(res, 400, false, "transactionId is required");
    }

    const transaction = await CoinsTransaction.findOneAndUpdate(
      {
        _id: transactionId,
        hostId,
        status: { $in: [CallStatus.INITIATED, CallStatus.RINGING] }
      },
      { status: CallStatus.REJECTED, callEnd: new Date() },
      { new: true }
    );

    if (!transaction) {
      const alreadyRejected = await CoinsTransaction.exists({
        _id: transactionId,
        hostId,
        status: CallStatus.REJECTED,
      });
      if (alreadyRejected) {
        return sendResponse(res, 200, true, 'Call already rejected');
      }
      return sendResponse(res, 409, false, "Call is no longer available");
    }

    await User.findByIdAndUpdate(hostId, { $set: { isBusy: false } });
    getIO().to(getUserRoom(String(transaction.userId))).emit("callRejected", { transactionId });
    getIO().to(getUserRoom(String(transaction.hostId))).emit("callEnded", { transactionId, reason: 'rejected' });
    await notifyHostCallState(transaction.hostId, String(transaction._id), 'rejected');
    return sendResponse(res, 200, true, "Call rejected");
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message || "Failed to reject call");
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
      type: { $in: [TransactionType.VOICE_CALL, TransactionType.GIFT, TransactionType.GIFT_SENT, 'gift', 'gift_sent', 'voice_call'] },
      status: { $in: [CallStatus.ENDED, 'ended', 'completed', 'success'] },
    };

    // 🗓️ Date Filtering
    const days = parseInt(req.query.days as string) || 3000;
    if (days) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      query.createdAt = { $gte: startDate };
    }

    const transactions = await CoinsTransaction.find(query)
      .populate("userId", "name image")
      .populate("hostId", "name image")
      .sort({ createdAt: -1 })
      .lean();

    if (!transactions.length) {
      return sendResponse(res, 200, true, "No history found", {
        totalTiming: "0 Hours 0 Min 0 Sec",
        calls: [],
      });
    }

    // Aggregate gifts by callId
    const giftsByCallId = new Map<string, { giftTotal: number; giftEarning: number }>();
    for (const t of transactions) {
      const typeStr = String(t.type);
      const isGiftItem = typeStr === TransactionType.GIFT || typeStr === TransactionType.GIFT_SENT || typeStr === 'gift' || typeStr === 'gift_sent';
      if (isGiftItem) {
        const callIdStr = (t.meta as any)?.callId ? String((t.meta as any).callId) : null;
        if (callIdStr) {
          const prev = giftsByCallId.get(callIdStr) || { giftTotal: 0, giftEarning: 0 };
          prev.giftTotal += Number(t.coinsSpent || 0);
          prev.giftEarning += Number(t.hostEarning || 0);
          giftsByCallId.set(callIdStr, prev);
        }
      }
    }

    // ✅ Safe numeric conversion for duration
    const totalDurationSeconds = transactions
      .filter((t) => String(t.type) === TransactionType.VOICE_CALL || String(t.type) === 'voice_call')
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

      const typeStr = String(t.type);
      const isCall = typeStr === TransactionType.VOICE_CALL || typeStr === 'voice_call';
      const isGift = typeStr === TransactionType.GIFT || typeStr === TransactionType.GIFT_SENT || typeStr === 'gift' || typeStr === 'gift_sent';

      let voiceVal = 0;
      let giftVal = 0;
      let commissionVal = 0;

      if (isCall) {
        voiceVal = role === "host" ? Number(t.hostEarning || 0) : Number(t.coinsSpent || 0);
        const callGifts = giftsByCallId.get(String(t._id));
        if (callGifts) {
          giftVal = role === "host" ? callGifts.giftEarning : callGifts.giftTotal;
        } else {
          giftVal = Number((t as any).gift || 0);
        }
        commissionVal = role === "host" ? (voiceVal + giftVal) : 0;
      } else if (isGift) {
        giftVal = role === "host" ? Number(t.hostEarning || 0) : Number(t.coinsSpent || 0);
        commissionVal = role === "host" ? Number(t.hostEarning || 0) : 0;
      }

      // ✅ Safe duration formatting
      const formattedDuration =
        t.duration && isCall
          ? new Date(Number(t.duration) * 1000).toISOString().substring(11, 19)
          : null;

      return {
        _id: t._id,
        name: partnerName,
        id: partnerId,
        image: partnerImage,
        type: t.type,
        voice: voiceVal,
        gift: giftVal,
        commission: role === "host" ? commissionVal : undefined,
        duration: formattedDuration,
        callStart: t.callStart || t.createdAt,
        callEnd: t.callEnd || t.createdAt,
        createdAt: t.createdAt,
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
  try {
    const requestedType = String(req.query.type || "time").toLowerCase();
    const requestedRange = String(req.query.range || "daily").toLowerCase();
    const metric = ["time", "call", "coins", "diamonds"].includes(requestedType)
      ? requestedType
      : "time";

    const match: Record<string, any> = {
      status: CallStatus.ENDED,
      type: metric === "diamonds"
        ? { $in: [TransactionType.VOICE_CALL, TransactionType.GIFT, TransactionType.GIFT_SENT] }
        : { $in: [TransactionType.VOICE_CALL, TransactionType.GIFT, TransactionType.GIFT_SENT] },
    };
    if (requestedRange !== "all") {
      const startDate =
        requestedRange === "weekly"
          ? dayjs().subtract(7, "day")
          : requestedRange === "monthly"
            ? dayjs().subtract(30, "day")
            : dayjs().startOf("day");
      match.createdAt = { $gte: startDate.toDate() };
    }

    const participantField = metric === "diamonds" ? "$userId" : "$hostId";
    const ranking = await CoinsTransaction.aggregate([
      { $match: match },
      {
        $addFields: {
          participantId: {
            $convert: {
              input: participantField,
              to: "objectId",
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $match: { participantId: { $ne: null } } },
      {
        $group: {
          _id: "$participantId",
          time: {
            $sum: {
              $cond: [
                { $eq: ["$type", TransactionType.VOICE_CALL] },
                { $ifNull: ["$duration", 0] },
                0,
              ],
            },
          },
          call: {
            $sum: {
              $cond: [{ $eq: ["$type", TransactionType.VOICE_CALL] }, 1, 0],
            },
          },
          coins: { $sum: { $ifNull: ["$hostEarning", 0] } },
          diamonds: { $sum: { $ifNull: ["$coinsSpent", 0] } },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      { $sort: { [metric]: -1, _id: 1 } },
      {
        $project: {
          name: { $ifNull: ["$user.name", "$user.userName"] },
          image: "$user.image",
          time: 1,
          call: 1,
          coins: 1,
          diamonds: 1,
        },
      },
    ]);

    const formattedRanking = ranking.map((item, index) => {
      const totalSeconds = Number(item.time) || 0;
      const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
      const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
      const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
      return {
        id: String(item._id),
        rank: index + 1,
        name: item.name || "User",
        image: item.image || "",
        time: `${hours}:${minutes}:${seconds}`,
        call: Number(item.call) || 0,
        coins: Number(item.coins) || 0,
        diamonds: Number(item.diamonds) || 0,
      };
    });

    const currentUserId = String(req.user?.id || "");
    return res.json({
      success: true,
      data: formattedRanking.slice(0, 10),
      currentUser: formattedRanking.find((item) => item.id === currentUserId) || null,
      metric,
      range: requestedRange,
    });
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message || "Failed to fetch ranking");
  }
};



import HostLevel from '../models/hostLevel.model';

export const getHostLevels = async (req: AuthRequest, res: Response) => {
  try {
    const { id: userId, role } = req.user || {};

    if (!userId) {
      return sendResponse(res, 400, false, "User not authenticated");
    }

    if (role !== "host") {
      return sendResponse(res, 403, false, "Only hosts can access levels");
    }

    const { getWeeklyTimeBounds } = require('../services/user.service');
    const bounds = getWeeklyTimeBounds();
    const transactions = await CoinsTransaction.find({
      hostId: userId,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ENDED,
      createdAt: { $gte: bounds.startOfWeek, $lte: bounds.endOfWeek }
    }).select('duration').lean();

    const totalCalls = transactions.length;
    const totalDurationSeconds = transactions.reduce(
      (sum, t) => sum + Number(t.duration || 0),
      0
    );
    const totalMinutes = Math.floor(totalDurationSeconds / 60);

    // ✅ Fetch ALL host levels from DB sorted ascending (1 → 8, new levels included)
    const now = new Date();
    const allLevels = await HostLevel.find({
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: now } }
      ]
    }).sort({ level: 1 }).lean();

    const userDoc = await User.findById(userId).select('coins diamonds createdAt level').lean();
    const createdAt = (userDoc as any)?.createdAt ? new Date((userDoc as any).createdAt) : new Date();
    const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const isPromoActive = diffDays <= 7;
    const promoDaysLeft = isPromoActive ? Math.max(1, Math.ceil(7 - diffDays)) : 0;

    const realLevels = allLevels.filter(lvl => lvl.level > 0);

    // Recalculate & persist host level in DB
    const currentLevelNum = await recalculateAndUpdateHostLevel(userId);

    // ✅ Find next level target (for progress bar) — only from real levels
    const nextLevelEntry = realLevels.find(lvl => lvl.level > currentLevelNum);
    const targetCalls = nextLevelEntry?.minCalls ?? 0;
    const targetMinutes = nextLevelEntry?.minMinutes ?? 0;

    // ✅ Build levelData array — exclude level 0 (Preview/promo level) from display
    // Level 0 is a temporary promo; it has no real call/minute requirements and
    // pollutes the table rendering and benefits lookups in the mobile app.
    const displayLevels = allLevels.filter(lvl => lvl.level > 0);

    const levelData = displayLevels.map((lvl) => {
      const isCurrentLevel = lvl.level === currentLevelNum;
      const isPast = lvl.level < currentLevelNum;
      const status = isPast ? "completed" : isCurrentLevel ? "current" : "locked";
      return {
        level: lvl.level,
        name: lvl.name,
        minCalls: lvl.minCalls,
        minMinutes: lvl.minMinutes,
        coinPerMinute: lvl.coinPerMinute,
        // Extra display fields the app uses
        call: `${lvl.minCalls.toLocaleString()} Calls`,
        time: `${lvl.minMinutes.toLocaleString()} Min`,
        earning: `${lvl.coinPerMinute} Coins/Min`,
        status,
      };
    });

    return sendResponse(res, 200, true, "Host level fetched successfully", {
      levelData,
      totalCalls,
      totalDuration: totalDurationSeconds,
      totalMinutes,
      totalCoins: userDoc?.coins ?? 0,
      totalDiamonds: userDoc?.diamonds ?? 0,
      currentLevel: currentLevelNum,
      isPromoActive,
      promoDaysLeft,
      // Next level targets for progress bars
      targetCalls,
      targetTime: targetMinutes,
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

    if (!role || !["owner", "operator", "admin", "superAdmin"].includes(role)) {
      return sendResponse(res, 403, false, "Access Denied");
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const query: any = {
      type: { $in: [TransactionType.VOICE_CALL, TransactionType.GIFT, TransactionType.GIFT_SENT] },
      status: CallStatus.ENDED,
    };

    const targetUserId = req.query.userId || req.query.targetUserId;
    if (targetUserId) {
      let targetUserObj;
      if (typeof targetUserId === 'string' && targetUserId.match(/^[0-9a-fA-F]{24}$/)) {
        targetUserObj = await User.findById(targetUserId);
      } else {
        targetUserObj = await User.findOne({ userId: Number(targetUserId) });
      }

      if (targetUserObj) {
        query.$or = [{ userId: targetUserObj._id }, { hostId: targetUserObj._id }];
      } else {
        return sendResponse(res, 200, true, "Call history fetched successfully", {
          calls: [],
          totalCalls: 0,
          currentPage: page,
          totalPages: 0,
        });
      }
    }

    const transactions = await CoinsTransaction.find(query)
      .populate("userId", "name")
      .populate("hostId", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalTransactions = await CoinsTransaction.countDocuments(query);

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

      const isGift = t.type === TransactionType.GIFT || t.type === TransactionType.GIFT_SENT;

      return {
        id: t._id,
        callerName: userObj?.name || "Unknown User",
        hostName: hostObj?.name || "Unknown Host",
        type: t.type,
        voice: t.type === TransactionType.VOICE_CALL ? Number(t.coinsSpent) || 0 : 0,
        gift: isGift ? Number(t.coinsSpent) || 0 : 0,
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

// Get Call Status Fallback
export const getCallStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { transactionId } = req.params;
    if (!transactionId) {
      return sendResponse(res, 400, false, "Transaction ID required");
    }

    if (!Types.ObjectId.isValid(transactionId)) {
      console.warn(`[CALL_STATUS_WARN] Invalid ObjectId format: ${transactionId}`);
      return sendResponse(res, 400, false, "Invalid Transaction ID format");
    }

    const participantId = req.user?.id;
    if (!participantId) {
      return sendResponse(res, 401, false, "User not authenticated");
    }

    const transaction = await CoinsTransaction.findOne({
      _id: transactionId,
      $or: [{ userId: participantId }, { hostId: participantId }],
    });
    if (!transaction) {
      console.warn(`[CALL_STATUS_WARN] Call transaction not found in DB: ${transactionId}`);
      return sendResponse(res, 404, false, "Transaction not found");
    }

    const meta = transaction.meta as any;
    const channelName = transaction.channelName || meta?.channelName;
    const fallbackAgora = meta?.appId ? null : await getAgoraCredentials();

    console.log(`[CALL_STATUS_CHECK] Timestamp: ${new Date().toISOString()} | TxID: ${transactionId} | Status: ${transaction.status} | Channel: ${channelName}`);

    return sendResponse(res, 200, true, "Call status fetched successfully", {
      status: transaction.status,
      transactionId: transaction._id,
      channelName,
      createdAt: transaction.createdAt,
      ringExpiresAt: transaction.ringExpiresAt,
      agora: {
        callerToken: meta?.callerToken,
        callerAgoraUid: meta?.callerAgoraUid,
        hostToken: meta?.hostToken,
        hostAgoraUid: meta?.hostAgoraUid,
        appId: meta?.appId || fallbackAgora?.appId || ''
      },
    });
  } catch (error: any) {
    console.error(`[CALL_STATUS_ERROR] Timestamp: ${new Date().toISOString()} | Error:`, error);
    return sendResponse(res, 500, false, error.message || "Failed to fetch call status");
  }
};
