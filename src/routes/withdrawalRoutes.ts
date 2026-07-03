
import express from "express";
import { verifyToken } from "../middlewares/authorize.middleware";
import { requestWithdrawal, getMyWithdrawals, getPendingWithdrawals, processWithdrawal } from "../controllers/withdrawalController";

const router = express.Router();

// User Routes
router.post("/request", verifyToken, requestWithdrawal);
router.get("/my-history", verifyToken, getMyWithdrawals);

// Admin Routes
router.get("/pending", verifyToken, getPendingWithdrawals);
router.post("/process", verifyToken, processWithdrawal);

export default router;
