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
import { notifyHostCallState } from "../services/callStateNotification.service";

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
            if (!transactionId) return;
            const txn = await CoinsTransaction.findOneAndUpdate(
                {
                    _id: transactionId,
                    hostId: socket.user!.id,
                    status: { $in: [CallStatus.INITIATED, CallStatus.RINGING] },
                    ringExpiresAt: { $gt: new Date() },
                },
                { status: CallStatus.ACCEPTED, lastHeartbeat: new Date() },
                { new: true }
            );
            if (!txn) {
                socket.emit("callActionError", { transactionId, action: "accept", message: "Call is unavailable" });
                return;
            }

            await User.findByIdAndUpdate(txn.hostId, { $set: { isBusy: true } });
            socket.data.transactionId = transactionId;
            const meta = txn.meta as any;
            const payload = {
                transactionId,
                channelName: txn.channelName || meta?.channelName,
                agora: {
                    callerToken: meta?.callerToken,
                    callerAgoraUid: meta?.callerAgoraUid,
                    hostToken: meta?.hostToken,
                    hostAgoraUid: meta?.hostAgoraUid,
                    appId: meta?.appId,
                },
            };
            io.to(getUserRoom(String(txn.userId))).emit("callAccepted", payload);
            socket.emit("acceptedBySystem", payload);
        });

        socket.on("joinChannel", async ({ transactionId }: { transactionId: string }) => {
            if (!transactionId) return;
            try {
                const txn = await CoinsTransaction.findOne({
                    _id: transactionId,
                    $or: [{ userId: socket.user!.id }, { hostId: socket.user!.id }],
                    status: { $in: [CallStatus.ACCEPTED, CallStatus.CONNECTING, CallStatus.CONNECTED] },
                });
                if (!txn) {
                    socket.emit("callActionError", { transactionId, action: "join", message: "Call is unavailable" });
                    return;
                }

                const callRoom = `call:${transactionId}`;
                socket.data.userId = String(socket.user!.id);
                socket.data.transactionId = transactionId;
                await socket.join(callRoom);

                const roomSockets = await io.in(callRoom).fetchSockets();
                const participantIds = new Set(roomSockets.map(s => String(s.data.userId || '')));
                const bothParticipantsJoined =
                    participantIds.has(String(txn.userId)) &&
                    participantIds.has(String(txn.hostId));

                if (bothParticipantsJoined && txn.status !== CallStatus.CONNECTED) {
                    const connected = await CoinsTransaction.findOneAndUpdate(
                        {
                            _id: transactionId,
                            status: { $in: [CallStatus.ACCEPTED, CallStatus.CONNECTING] },
                        },
                        {
                            $set: {
                                status: CallStatus.CONNECTED,
                                callStart: txn.callStart || new Date(),
                                lastHeartbeat: new Date(),
                            },
                        },
                        { new: true }
                    );
                    if (connected) {
                        BillingService.processActiveCallBilling(connected._id as any).catch(err =>
                            console.error("Failed initial minute billing:", err)
                        );
                        io.to(callRoom).emit("callConnected", {
                            transactionId,
                            callStart: connected.callStart,
                        });
                    }
                } else if (txn.status === CallStatus.ACCEPTED) {
                    await CoinsTransaction.updateOne(
                        { _id: transactionId, status: CallStatus.ACCEPTED },
                        { $set: { status: CallStatus.CONNECTING, lastHeartbeat: new Date() } }
                    );
                }
            } catch (error) {
                console.error("joinChannel failed:", error);
            }
        });

        socket.on("leaveChannel", async ({ transactionId }: { transactionId: string }) => {
            if (!transactionId) return;
            const isParticipant = await CoinsTransaction.exists({
                _id: transactionId,
                $or: [{ userId: socket.user!.id }, { hostId: socket.user!.id }],
            });
            if (isParticipant) await socket.leave(`call:${transactionId}`);
        });

        socket.on("rejectCall", async ({ transactionId }: { transactionId: string }) => {
            if (!transactionId) return;
            const txn = await CoinsTransaction.findOneAndUpdate(
                {
                    _id: transactionId,
                    hostId: socket.user!.id,
                    status: { $in: [CallStatus.INITIATED, CallStatus.RINGING] },
                },
                { status: CallStatus.REJECTED, callEnd: new Date() },
                { new: true }
            );
            if (!txn) return;
            await User.findByIdAndUpdate(txn.hostId, { $set: { isBusy: false } });
            io.to(getUserRoom(String(txn.userId))).emit("callRejected", { transactionId });
            io.to(getUserRoom(String(txn.hostId))).emit("callEnded", { transactionId, reason: "rejected" });
            await notifyHostCallState(txn.hostId, String(txn._id), "rejected");
        });

        socket.on("missedCall", async ({ transactionId }: { transactionId: string }) => {
            if (!transactionId) return;
            const txn = await CoinsTransaction.findOneAndUpdate(
                {
                    _id: transactionId,
                    $or: [{ userId: socket.user!.id }, { hostId: socket.user!.id }],
                    status: { $in: [CallStatus.INITIATED, CallStatus.RINGING] },
                },
                { status: CallStatus.MISSED, callEnd: new Date() },
                { new: true }
            );
            if (!txn) return;
            await User.findByIdAndUpdate(txn.hostId, { $set: { isBusy: false } });
        });

        socket.on("endCall", async ({
            transactionId,
            durationSeconds,
        }: {
            transactionId: string;
            durationSeconds?: number;
        }) => {
            if (!transactionId) return;
            await handleEndCall(io, transactionId, String(socket.user!.id), durationSeconds);
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
                    const hasActiveCall = await CoinsTransaction.exists({
                        hostId: uid,
                        status: { $in: [CallStatus.INITIATED, CallStatus.RINGING, CallStatus.ACCEPTED, CallStatus.CONNECTING, CallStatus.CONNECTED] },
                    });
                    await User.findByIdAndUpdate(uid, {
                        $set: {
                            lastOnline,
                            isOnline: false,
                            ...(hasActiveCall ? {} : { isBusy: false }),
                        }
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
    participantId: string,
    durationSeconds?: number
) => {
    try {
        console.log(`[BILLING] MANUAL HANGUP / TERMINATION: TransactionID ${transactionId} (DurationSec: ${durationSeconds ?? 'unspecified'})`);
        // Fetch participant IDs before billing so they are always available for routing
        const txRef = await CoinsTransaction.findOne({
            _id: transactionId,
            $or: [{ userId: participantId }, { hostId: participantId }],
        }).select('userId hostId').lean() as any;
        if (!txRef) {
            console.warn(`Unauthorized endCall ignored for transaction ${transactionId}`);
            return;
        }

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
            await notifyHostCallState(txRef.hostId, transactionId, "ended");
        } else {
            console.error(`❌ Call End Failed for ${transactionId}: ${result.message}`);
        }

    } catch (error) {
        console.error(`❌ Handle End Call Error:`, error);
    }
};

export default chatSocket;
// Export onlineUsers to keep other files from crashing, but it is empty/useless now.
export const onlineUsers = {}; 
