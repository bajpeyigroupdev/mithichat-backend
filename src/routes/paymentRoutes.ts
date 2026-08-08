import express from "express";
import rateLimit from "express-rate-limit";
import { verifyToken } from "../middlewares/authorize.middleware";
import { verifyGooglePurchase, handleGooglePlayRTDN } from "../controllers/paymentController";

const router = express.Router();

// Strict Rate Limiter for Payment Verification Endpoint (max 15 requests per 15 minutes per IP)
const verifyPaymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    success: false,
    message: "Too many payment verification requests from this IP. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Verify Google Play Purchase Endpoint
router.post("/verify-google", verifyToken, verifyPaymentLimiter, verifyGooglePurchase);

// Google Play Real-Time Developer Notifications (RTDN) Webhook
router.post("/google-play/rtdn", handleGooglePlayRTDN);

export default router;
