import { verifyToken } from './../middlewares/authorize.middleware';
import { Router } from "express";
import {
  sendMessageController,
  getMessagesController,
  getConversationsController,
  markMessagesSeenController,
  deleteSeenMessagesController,
} from "../controllers/chatController";

// import { authorize } from "../middlewares/authorize.middleware";

const router = Router();

// ✅ Send a message
router.post("/send", verifyToken, sendMessageController);

// ✅ Get messages of a conversation
router.get("/messages",verifyToken, getMessagesController);

// ✅ Get conversation list of logged in user
router.get("/conversations", verifyToken, getConversationsController);

// ✅ Mark messages as seen
router.post("/seen", verifyToken, markMessagesSeenController);

// ✅ Delete seen messages
router.delete("/seen", verifyToken, deleteSeenMessagesController);

export default router;
