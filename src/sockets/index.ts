import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import redis from "../configs/redisConfig";
import { sendMessage, markMessagesSeen, deleteSeenMessages } from "../services/chat.service";
import { CoinsTransaction } from "../models/spentCoinModel";
import { AuthenticatedSocket, socketAuth } from "../middlewares/auth.socket";
import { User } from "../models/user.model";
import { CallStatus } from "../constants/user";
import { getAllHostsService, invalidateHostCache } from "../services/user.service";
import { BillingService } from '../services/billing.service';

// Redis Pub/Sub for Adapter
const pubClient = redis;
const subClient = redis.duplicate();

let ioInstance: Server;

// Helper: Get 'room' name for user
export const getUserRoom = (userId: string) => `user:${userId}`;

// Deleted deprecated getSocketIdByUserId


// -------------------- 🔑 Access io Globally --------------------
export const getIO = (): Server => {
    if (!ioInstance) {
        throw new Error("❌ Socket.io instance not initialized yet");
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
        // Join personal room for targeting
        socket.join(getUserRoom(userIdStr));

        // Mark Online in Redis
        await redis.sadd("online_users", userIdStr);
        await redis.set(`socket_user:${socket.id}`, userIdStr); // Map socket -> user for disconnect

        console.log(`✅ User connected: ${userIdStr} | Socket: ${socket.id}`);

        await User.findByIdAndUpdate(socket.user.id, { $set: { isOnline: true } });

        // Invalidate host cache when host comes online
        if (socket.user.role === "host") {
            invalidateHostCache();
        }

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

        socket.on("exitChat", async ({ conversationId }: { conversationId: string }) => {
            await deleteSeenMessages(conversationId, socket.user!.id);
            io.to(conversationId).emit("messagesDeleted", { conversationId, id: userIdStr });
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
                        await txn.save();

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

        socket.on("endCall", async ({ transactionId }: { transactionId: string }) => {
            console.log(`🔴 Ending call (Socket): ${transactionId}`);
            if (!transactionId) return;
            await handleEndCall(io, transactionId);
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
const handleEndCall = async (io: Server, transactionId: string) => {
    try {
        const result = await BillingService.processCallEnd(transactionId);

        if (result.success && result.data) {

            const { userId, hostId } = await CoinsTransaction.findById(transactionId).select('userId hostId').lean() as any;

            const payload = result.data;

            // Broadcast to Rooms
            io.to(getUserRoom(String(userId))).emit("callEnded", payload);
            io.to(getUserRoom(String(hostId))).emit("callEnded", payload);
            io.to(`call:${transactionId}`).emit("callEnded", payload);
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
