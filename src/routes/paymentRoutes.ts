
import express from "express";
import { verifyToken } from "../middlewares/authorize.middleware";
import { verifyGooglePurchase } from "../controllers/paymentController";

const router = express.Router();

// Verify Google Play Purchase
router.post("/verify-google", verifyToken, verifyGooglePurchase);

export default router;
