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

export const sendMessageController = async (req: AuthRequest, res: Response) => {
  try {
    const { id, role } = req.user || {};
    const userId = id;
    const { receiverId, content, conversationId } = req.body;

    if (!userId || !receiverId || !content) {
      return sendResponse(res, 400, false, "Missing required fields");
    }

    // 💰 Deduct coins if the sender is a user
    if (role === "user") {
      const dbUser = await User.findById(userId);
      const settings = await getCachedSettings();
      const MESSAGE_COST = settings.chatMessageCost || 10; // Dynamic config cost

      if (!dbUser || (dbUser.coins || 0) < MESSAGE_COST) {
        return sendResponse(res, 400, false, "Insufficient balance to send message");
      }

      // Deduct coins synchronously
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
