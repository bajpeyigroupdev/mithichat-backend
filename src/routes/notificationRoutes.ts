import express from "express";
import { verifyToken } from "../middlewares/authorize.middleware";
import {
    getMyNotifications,
    markAllAsRead,
    markAsRead,
    sendSystemNotification,
} from "../controllers/notificationController";

const router = express.Router();

router.get("/", verifyToken, getMyNotifications as any);
router.patch("/read-all", verifyToken, markAllAsRead);
router.patch("/:id/read", verifyToken, markAsRead);
router.post("/send-system", verifyToken, sendSystemNotification as any);

export default router;
