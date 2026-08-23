
import express from "express";
import { verifyToken } from "../middlewares/authorize.middleware";
import { getAllGifts, sendGift, createGift, getAllGiftsAdmin, toggleGiftActive, updateGift, deleteGift } from "../controllers/giftController";

const router = express.Router();

router.get("/all", verifyToken, getAllGifts);            // User: active gifts only
router.post("/send", verifyToken, sendGift);            // User: send gift during call
router.post("/create", verifyToken, createGift);        // Admin: add gift
router.get("/admin-all", verifyToken, getAllGiftsAdmin); // Admin: all gifts incl. inactive
router.put("/:id", verifyToken, updateGift);            // Admin: edit gift details
router.patch("/:id/toggle", verifyToken, toggleGiftActive); // Admin: enable/disable
router.delete("/:id", verifyToken, deleteGift);         // Admin: delete

export default router;
