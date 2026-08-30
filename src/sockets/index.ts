import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import redis from "../configs/redisConfig";
import { sendMessage, markMessagesSeen } from "../services/chat.service";
import { CoinsTransaction } from "../models/spentCoinModel";
import { AuthenticatedSocket, socketAuth } from "../middlewares/auth.socket";
import { User } from "../models/user.model";
import { CallStatus } from "../constants/user";
import { getAllHostsService, invalidateHostCache } from "../services/user.service";
import { BillingService } from '../services/billing.service';
import { PermissionEngine } from "../utils/permissionEngine";

// Redis Pub/Sub for Adapter
const pubClient = redis;
const subClient = redis.duplicate();

let ioInstance: Server;

// Helper: Get 'room' name for user
export const getUserRoom = (userId: string) => `user:${userId}`;

// Deleted deprecated getSocketIdByUserId


// -------------------- 🔑 Access io Globally --------------------
export const getIOOptional = (): Server | null => {
    return ioInstance || null;
};

export const getIO = (): Server => {
    if (!ioInstance) {
        return null as any;
    }
    return ioInstance;
};

const chatSocket = (io: Server) => {
    ioInstance = io;

    // Setup Redis Adapter
    io.adapter(createAdapter(pubClient, subClient));

    io.use(socketAuth);

    io.on("connection", async (socket: AuthenticatedSocket) => {
        if (!socket.user?.id) {
            console.error('❌ Socket connected without user ID');
            return;
        }

        const userIdStr = socket.user.id.toString();
        const userRoom = getUserRoom(userIdStr);

        // Join personal rooms for targeting across aliases (_id, numeric userId, meethiId)
        socket.join(userRoom);
        socket.join(`user:${userIdStr}`);
        if (socket.user.userId) socket.join(`user:${socket.user.userId}`);

        // Mark Online in Redis
        await redis.sadd("online_users", userIdStr);
        await redis.set(`socket_user:${socket.id}`, userIdStr); // Map socket -> user for disconnect

        console.log(`✅ User connected: ${userIdStr} | Socket: ${socket.id}`);

        await User.findByIdAndUpdate(socket.user.id, { $set: { isOnline: true } });

        // Invalidate host cache when host comes online
        if (socket.user.role === "host") {
            invalidateHostCache();
        }

        // Join authorized admin/operator roles with verified server-side permission to moderation room
        const canAccessModeration = await PermissionEngine.hasModerationPermission(
            { id: socket.user.id, _id: socket.user.id, role: socket.user.role },
            "view"
        );

        if (canAccessModeration) {
            socket.join("admin_moderation");
            console.log(`🛡️ Admin socket ${socket.id} (user: ${socket.user.id}, role: ${socket.user.role}) joined room admin_moderation`);
        } else {
            console.warn(`🔒 Access Denied: Socket ${socket.id} (user: ${socket.user.id}, role: ${socket.user.role}) denied admin_moderation room access`);
        }

        socket.on("joinModerationRoom", async () => {
            const hasPermission = await PermissionEngine.hasModerationPermission(
                { id: socket.user?.id, _id: socket.user?.id, role: socket.user?.role },
                "view"
            );
            if (hasPermission) {
                socket.join("admin_moderation");
                socket.emit("moderationRoomJoined", { success: true });
            } else {
                console.warn(`🔒 Access Denied: Socket ${socket.id} requested joinModerationRoom without permission`);
                socket.emit("moderationRoomJoined", { success: false, message: "Permission denied" });
            }
        });

        socket.emit("connectionConfirmed", {
            userId: userIdStr,
            socketId: socket.id,
            timestamp: new Date()
        });

        // ------------------ Initial Data ------------------
        if (socket.user.role === "host") {
            const hostsData = await getAllHostsService({
                role: "user",
                page: 1,
                limit: 50,
                userId: String(socket.user.id) // Exclude self
            });
            socket.emit("hostsList", hostsData); // Emit ONLY to the connected host
        } else {
            const hostsData = await getAllHostsService({
                role: "host",
                page: 1,
                limit: 50,
                userId: String(socket.user.id)
            });
            socket.emit("hostsList", hostsData);
        }

        io.emit("userOnline", { userId: userIdStr });

        // ------------------ Chat & Lists ------------------
        socket.on("requestHostsList", async (data: { tab?: string, language?: string } = {}) => {
            const hostsData = await getAllHostsService({
                role: "host", // Everyone sees hosts
                page: 1,
                limit: 50,
                userId: String(socket.user?.id),
                tab: data?.tab,
                language: data?.language
            });
            socket.emit("hostsList", hostsData);
        });


        socket.on("joinConversation", ({ conversationId }: { conversationId: string }) => {
            console.log(`➡️ User ${userIdStr} joining conversation ${conversationId}`);
            socket.join(conversationId);
        });

        socket.on("typing", ({ conversationId }: { conversationId: string }) => {
            socket.to(conversationId).emit("userTyping", { userId: userIdStr });
        });

        socket.on("markSeen", async ({ conversationId }: { conversationId: string }) => {
            await markMessagesSeen(conversationId, socket.user!.id);
            io.to(conversationId).emit("messagesSeen", { conversationId, id: userIdStr });
        });

        socket.on("exitChat", ({ conversationId }: { conversationId: string }) => {
            socket.leave(conversationId);
        });

        // ------------------ Call Handlers ------------------

        socket.on("acceptCall", async ({ transactionId }: { transactionId: string }) => {
            console.log(`📞 Host accepting call: ${transactionId}`);

            const txn = await CoinsTransaction.findByIdAndUpdate(
                transactionId,
                { status: CallStatus.ACCEPTED, lastHeartbeat: new Date() },
                { new: true }
            );

            if (!txn) {
                console.error('❌ Transaction not found:', transactionId);
                return;
            }

            await User.findByIdAndUpdate(txn.hostId, { $set: { isBusy: true } });
            socket.data.transactionId = transactionId;

            const meta = txn.meta as any;
            const channelName = txn.channelName || meta?.channelName;

            // Notify Caller (Target Room)
            io.to(getUserRoom(String(txn.userId))).emit("callAccepted", {
                transactionId,
                channelName,

                agora: {
                    callerToken: meta.callerToken,
                    callerAgoraUid: meta.callerAgoraUid,

                    hostToken: meta.hostToken,
                    hostAgoraUid: meta.hostAgoraUid,

                    appId: meta.appId,
                },
            });

            // Confirm to Host
            socket.emit("acceptedBySystem", {
                transactionId,
                channelName,

                agora: {
                    hostToken: meta.hostToken,
                    hostAgoraUid: meta.hostAgoraUid,

                    callerToken: meta.callerToken,
                    callerAgoraUid: meta.callerAgoraUid,

                    appId: meta.appId,
                },
            });
        });

        socket.on("joinChannel", async ({ transactionId }: { transactionId: string }) => {
            const callRoom = `call:${transactionId}`;
            console.log(`👤 Socket ${socket.id} joining call room: ${callRoom}`);
            socket.join(callRoom);

            try {
                const sockets = await io.in(callRoom).allSockets();
                console.log(`📞 Room ${callRoom} size: ${sockets.size}`);

                const txn = await CoinsTransaction.findById(transactionId);
                if (txn) {
                    if (sockets.size === 2) {
                        // Both joined! Transition status to CONNECTED
                        txn.status = CallStatus.CONNECTED;
                        txn.callStart = txn.callStart || new Date();
                        txn.lastHeartbeat = new Date();
                        const meta = (txn.meta || {}) as any;
                        const maxMinutes = Math.max(0, Number(meta.maxMinutes || 0));
                        const callDeadlineAt = maxMinutes > 0
                            ? new Date(txn.callStart.getTime() + maxMinutes * 60_000)
                            : null;
                        txn.meta = {
                            ...meta,
                            ...(callDeadlineAt ? { callDeadlineAt } : {}),
                        };
                        await txn.save();

                        // Instantly process minute 1 billing so caller balance updates immediately on 1st second
                        BillingService.processActiveCallBilling(txn._id as any).catch(err =>
                            console.error("Failed initial minute 1 billing on joinChannel:", err)
                        );

                        if (callDeadlineAt) {
                            scheduleCallDeadline(
                                io,
                                String(txn._id),
                                callDeadlineAt,
                                maxMinutes * 60
                            );
                        }

                        console.log(`🚀 Call ${transactionId} is now CONNECTED. Emitting callConnected to room.`);
                        io.to(callRoom).emit("callConnected", {
                            transactionId,
                            callStart: txn.callStart,
                        });
                    } else if (txn.status === CallStatus.ACCEPTED) {
                        // Only one joined. Transition status to CONNECTING
                        txn.status = CallStatus.CONNECTING;
                        await txn.save();
                        console.log(`⏳ Call ${transactionId} status set to CONNECTING.`);
                    }
                }
            } catch (err: any) {
                console.error("❌ Error in joinChannel status update:", err.message);
            }
        });

        socket.on("leaveChannel", async ({ transactionId }: { transactionId: string }) => {
            const callRoom = `call:${transactionId}`;
            console.log(`👤 Socket ${socket.id} leaving call room: ${callRoom}`);
            socket.leave(callRoom);
        });

        socket.on("rejectCall", async ({ transactionId }) => {
            console.log(`❌ Host rejecting call: ${transactionId}`);

            const txn = await CoinsTransaction.findByIdAndUpdate(
                transactionId,
                { status: CallStatus.REJECTED, callEnd: new Date() },
                { new: true }
            );

            if (txn) {
                await User.findByIdAndUpdate(txn.hostId, { $set: { isBusy: false } });

                // Notify Caller
                io.to(getUserRoom(String(txn.userId))).emit("callRejected", { transactionId });
            }
        });

        socket.on("missedCall", async ({ transactionId }: { transactionId: string }) => {
            console.log(`⚠️ Call missed/timed out: ${transactionId}`);

            const txn = await CoinsTransaction.findByIdAndUpdate(
                transactionId,
                { status: CallStatus.MISSED, callEnd: new Date() }, // Or CallStatus.MISSED
                { new: true }
            );

            if (txn) {
                await User.findByIdAndUpdate(txn.hostId, { $set: { isBusy: false } });

                // Fetch Caller Details to notify Host
                const caller = await User.findById(txn.userId);
                const host = await User.findById(txn.hostId);

                if (host && host.fcmToken && caller) {
                    // Import lazily or at top
                    const { sendMissedCallNotification } = require("../utils/pushNotification");
                    sendMissedCallNotification(
                        host.fcmToken,
                        caller.name || "User",
                        caller.image || ""
                    );
                }

                // Notify Caller (ACK) - currently caller initiates this, so they know. 
                // But if Host initiated? (Not supported yet).
            }
        });

        socket.on("endCall", async ({
            transactionId,
            durationSeconds,
        }: {
            transactionId: string;
            durationSeconds?: number;
        }) => {
            console.log(`🔴 Ending call (Socket): ${transactionId}`);
            if (!transactionId) return;
            await handleEndCall(io, transactionId, durationSeconds);
        });

        // ------------------ Disconnect ------------------
        socket.on("disconnect", async () => {
            try {
                // Determine User ID from socket map in Redis to avoid losing context
                const storedUserId = await redis.get(`socket_user:${socket.id}`);
                const uid = storedUserId || userIdStr;

                await redis.del(`socket_user:${socket.id}`);

                // Check if user has other sockets (e.g. multi-tab)
                // With io.adapter, checking room size is async. 
                // For simplicity: We remove from set. If set is empty? 
                // We just rely on heartbeats or simple assumption: 
                // If they disconnect, they are offline unless they reconnect.
                // Better approach: Count active sockets in Redis? 
                // Or just assume offline.

                // Let's check if the Room `user:ID` is empty.
                const sockets = await io.in(getUserRoom(uid)).allSockets();

                if (sockets.size === 0) {
                    await redis.srem("online_users", uid);
                    const lastOnline = new Date();
                    await User.findByIdAndUpdate(uid, {
                        $set: { lastOnline, isOnline: false, isBusy: false }
                    });

                    io.emit("userOffline", { userId: uid, lastOnline });

                    if (socket.user?.role === "host") {
                        invalidateHostCache();
                    }
                    console.log(`👋 User fully offline: ${uid}`);
                }

            } catch (error) {
                console.error(`Error during disconnect for ${userIdStr}:`, error);
            }
        });
    });
};

// -------------------- 🔑 Common Call End Logic --------------------
// BUG-01 FIX: Fetch userId/hostId BEFORE processCallEnd commits the transaction,
// so we are guaranteed to have the data for socket emission — no second DB read needed.
const handleEndCall = async (
    io: Server,
    transactionId: string,
    durationSeconds?: number
) => {
    try {
        console.log(`[BILLING] MANUAL HANGUP / TERMINATION: TransactionID ${transactionId} (DurationSec: ${durationSeconds ?? 'unspecified'})`);
        // Fetch participant IDs before billing so they are always available for routing
        const txRef = await CoinsTransaction.findById(transactionId).select('userId hostId').lean() as any;

        const result = await BillingService.processCallEnd(
            transactionId,
            new Date(),
            0,
            durationSeconds
        );

        if (result.success) {
            const payload = result.data ?? { transactionId };

            if (txRef) {
                const callerDoc = await User.findById(txRef.userId).select('_id userId meethiId coins diamonds').lean();
                const hostDoc = await User.findById(txRef.hostId).select('_id userId meethiId coins diamonds').lean();

                const callerRooms = [
                    `user:${txRef.userId}`,
                    ...(callerDoc?.userId ? [`user:${callerDoc.userId}`] : []),
                    ...(callerDoc?.meethiId ? [`user:${callerDoc.meethiId}`] : [])
                ];
                const hostRooms = [
                    `user:${txRef.hostId}`,
                    ...(hostDoc?.userId ? [`user:${hostDoc.userId}`] : []),
                    ...(hostDoc?.meethiId ? [`user:${hostDoc.meethiId}`] : [])
                ];

                callerRooms.forEach(room => io.to(room).emit("callEnded", payload));
                hostRooms.forEach(room => io.to(room).emit("callEnded", payload));

                if (callerDoc) {
                    const callerBalPayload = {
                        userId: String(callerDoc._id),
                        coins: Number(callerDoc.coins || 0),
                        diamonds: Number(callerDoc.diamonds || 0),
                        totalBalance: Number(callerDoc.coins || 0) + Number(callerDoc.diamonds || 0),
                    };
                    callerRooms.forEach(room => io.to(room).emit("balanceUpdated", callerBalPayload));
                }

                if (hostDoc) {
                    const hostBalPayload = {
                        userId: String(hostDoc._id),
                        coins: Number(hostDoc.coins || 0),
                        diamonds: Number(hostDoc.diamonds || 0),
                        totalBalance: Number(hostDoc.coins || 0) + Number(hostDoc.diamonds || 0),
                    };
                    hostRooms.forEach(room => io.to(room).emit("balanceUpdated", hostBalPayload));
                }
            }
            io.to(`call:${transactionId}`).emit("callEnded", payload);
        } else {
            console.error(`❌ Call End Failed for ${transactionId}: ${result.message}`);
        }

    } catch (error) {
        console.error(`❌ Handle End Call Error:`, error);
    }
};

const scheduleCallDeadline = (
    io: Server,
    transactionId: string,
    deadline: Date,
    maxDurationSeconds: number
) => {
    const delayMs = Math.max(0, deadline.getTime() - Date.now());
    // Node timers above 2^31-1 ms fire immediately. Long-balance calls rely
    // on the persistent cron fallback instead of an unsafe in-memory timer.
    if (delayMs > 2_147_483_647) return;

    const timer = setTimeout(() => {
        handleEndCall(io, transactionId, maxDurationSeconds).catch(error => {
            console.error(`Call deadline end failed for ${transactionId}:`, error);
        });
    }, delayMs);
    timer.unref?.();
};
export default chatSocket;
// Export onlineUsers to keep other files from crashing, but it is empty/useless now.
export const onlineUsers = {}; 
