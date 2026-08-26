import { Response } from "express";
import {
  sendMessage,
  getMessages,
  getConversations,
  markMessagesSeen,
  deleteSeenMessages,
} from "../services/chat.service";
import { AuthRequest } from "../middlewares/authorize.middleware";
import sendResponse from "../utils/reponse";
import { Logger } from "../utils/logger";

import { getIO, onlineUsers, getUserRoom } from "../sockets"; // export your io instance from chatSocket or a separate file

import { ChatQueueService } from "../services/chatQueue.service";
import { Types } from "mongoose";
import { User } from "../models/user.model";
import { updateBalance } from "../services/coins.service";
import { getCachedSettings } from "./settingsController";
import {
  validateMessageContent,
  handleModerationViolation,
} from "../services/messageModerationService";
import { evaluateModerationEscalation } from "../services/moderationEscalationService";
import { ChatViolation } from "../models/chatViolation.model";
import { sendPushNotification } from '../utils/pushNotification';

export const sendMessageController = async (req: AuthRequest, res: Response) => {
  try {
    const { id, userId: reqUserId, role } = req.user || {};
    const userId = id || reqUserId;
    const { content, conversationId } = req.body;
    const targetReceiverId = req.body.receiverId || req.body.receiver || req.body.recipientId;

    if (!userId || !targetReceiverId || !content) {
      return sendResponse(res, 400, false, "Missing required fields");
    }
    const receiverId = targetReceiverId;

    // 🚫 CHAT MUTE ENFORCEMENT (Check if sender account is currently muted)
    const senderUser = await User.findById(userId);
    if (senderUser && senderUser.chatMuteUntil && new Date(senderUser.chatMuteUntil).getTime() > Date.now()) {
      return res.status(400).json({
        success: false,
        code: "CHAT_TEMPORARILY_RESTRICTED",
        message: "Your chat access is temporarily restricted.",
        chatMuteUntil: senderUser.chatMuteUntil,
      });
    }

    const settings = await getCachedSettings();
    const MAX_MESSAGE_LIMIT = settings.chatMessageLimit || 50;

    // 📏 DYNAMIC MESSAGE LENGTH CHECK
    if (content.length > MAX_MESSAGE_LIMIT) {
      return res.status(400).json({
        success: false,
        code: "MESSAGE_TOO_LONG",
        message: `1 message me maximum ${MAX_MESSAGE_LIMIT} characters hi bhej sakte hain.`,
      });
    }

    const isGiftMessage = req.body.type === 'gift' || content.includes('🎁') || content.toLowerCase().includes('gift');

    // 🛡️ CHAT CONTENT MODERATION CHECK (Skip for system generated gift notifications)
    if (!isGiftMessage) {
      const moderationResult = validateMessageContent(content);
      if (!moderationResult.allowed) {
        const violation = await handleModerationViolation({
          senderId: userId,
          receiverId,
          content,
          moderationResult,
          source: "REST",
          conversationId,
        });

        // Trigger automatic escalation evaluation (idempotent)
        await evaluateModerationEscalation(String(userId), String(violation._id));

        // Update Trust & Safety Risk Score & Level (idempotent)
        const { updateUserModerationRisk } = await import("../services/moderationRiskService");
        await updateUserModerationRisk(String(userId), String(violation._id)).catch(err =>
          console.warn("Failed to update user moderation risk:", err?.message)
        );

        return res.status(400).json({
          success: false,
          code: "CHAT_CONTENT_VIOLATION",
          message: "Sharing phone numbers, IDs, links, or contact information is not allowed.",
        });
      }
    }

    // 💰 Deduct 35 Diamonds per text message if the sender is a user (Skip for gifts as gift cost is already charged by /gift/send)
    if (role === "user" && !isGiftMessage) {
      const dbUser = await User.findById(userId);
      const MESSAGE_COST = 35; // 35 Diamonds per message as requested

      const totalBalance = Number(dbUser?.diamonds || 0) + Number(dbUser?.coins || 0);
      if (!dbUser || totalBalance < MESSAGE_COST) {
        return sendResponse(res, 400, false, "Insufficient Diamonds. 35 Diamonds required per message.");
      }

      // Deduct 35 Diamonds/Coins synchronously
      await updateBalance(userId, MESSAGE_COST, "deduct");
    }

    // ⚡ FAST PATH: Queue the message (Redis)
    await ChatQueueService.addMessage({
      senderId: userId,
      receiverId,
      content
    });

    // 🔮 Optimistic Response for Client and Socket
    const mockMessage = {
      _id: new Types.ObjectId(), // Fake ID
      sender: userId,
      receiver: receiverId,
      content,
      status: "queued",
      createdAt: new Date(),
      type: "text"
    };

    const receiverRoom = getUserRoom(receiverId);
    getIO().to(receiverRoom).emit("newMessageNotification", {
      conversationId: conversationId || "pending",
      message: mockMessage,
    });

    User.findById(receiverId).select('fcmToken').lean().then(async receiver => {
      if (!receiver?.fcmToken) return;
      const sender = await User.findById(userId).select('name image').lean();
      await sendPushNotification([receiver.fcmToken], {
        title: sender?.name || 'New message',
        body: content.length > 90 ? `${content.slice(0, 87)}...` : content,
        data: {
          type: 'message',
          action: 'open_chat',
          conversationId: String(conversationId || 'pending'),
          senderId: String(userId),
          senderName: sender?.name || 'User',
          senderImage: sender?.image || '',
        },
      });
    }).catch(error => console.error('Message push failed:', error.message));

    return sendResponse(res, 201, true, "Message queued", {
      message: mockMessage,
      conversation: { _id: conversationId || "pending" },
    });
  } catch (error: any) {
    await Logger("sendMessageController", error);
    return sendResponse(res, 500, false, error.message);
  }
};



// Get messages by conversationId
export const getMessagesController = async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.query;
    const { limit = "50", skip = "0" } = req.query;

    if (!conversationId) {
      return sendResponse(res, 400, false, "conversationId is required");
    }

    const messages = await getMessages(
      String(conversationId),
      Number(limit),
      Number(skip)
    );

    return sendResponse(res, 200, true, "Messages fetched successfully", { messages });
  } catch (error: any) {
    await Logger("getMessagesController", error);
    return sendResponse(res, 500, false, error.message);
  }
};

// Get conversation list for a user
export const getConversationsController = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.user || {};

    if (!id) {
      return sendResponse(res, 400, false, "userId is required");
    }

    const conversations = await getConversations(id);

    if (!conversations || conversations.length === 0) {
      return res.status(200).json({ data: [] }); // 200 OK + empty array
    }
    return sendResponse(res, 200, true, "Conversations fetched successfully", {
      conversations,
    });
  } catch (error: any) {
    await Logger("getConversationsController", error);
    return sendResponse(res, 500, false, error.message);
  }
};

// Mark messages seen
export const markMessagesSeenController = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.user || {};
    const { conversationId } = req.body;

    if (!id || !conversationId) {
      return sendResponse(res, 400, false, "conversationId and userId required");
    }

    await markMessagesSeen(conversationId, id);
    return sendResponse(res, 200, true, "Messages marked as seen");
  } catch (error: any) {
    await Logger("markMessagesSeenController", error);
    return sendResponse(res, 500, false, error.message);
  }
};

// Delete seen messages
export const deleteSeenMessagesController = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.user || {};
    const { conversationId } = req.body;

    if (!id || !conversationId) {
      return sendResponse(res, 400, false, "conversationId and userId required");
    }

    await deleteSeenMessages(conversationId, id);
    return sendResponse(res, 200, true, "Seen messages deleted");
  } catch (error: any) {
    await Logger("deleteSeenMessagesController", error);
    return sendResponse(res, 500, false, error.message);
  }
};
