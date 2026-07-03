import express from "express";
import { verifyToken } from "../middlewares/authorize.middleware";
import {
    getMyNotifications,
    markAllAsRead,
    markAsRead,
} from "../controllers/notificationController";

const router = express.Router();

router.get("/", verifyToken, getMyNotifications as any);
router.patch("/read-all", verifyToken, markAllAsRead);
router.patch("/:id/read", verifyToken, markAsRead);

export default router;
