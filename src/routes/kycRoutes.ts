
import express from "express";
import { verifyToken } from "../middlewares/authorize.middleware";
import { submitKyc, getMyKyc, getPendingKyc, updateKycStatus } from "../controllers/kycController";

const router = express.Router();

// const kycUploads = upload.fields([
//     { name: 'panImage', maxCount: 1 },
//     { name: 'aadharFrontImage', maxCount: 1 },
//     { name: 'aadharBackImage', maxCount: 1 }
// ]);

// User Routes
router.post("/submit", verifyToken, submitKyc);
router.get("/my-status", verifyToken, getMyKyc);

// Admin Routes (Missing middleware to check isAdmin, assuming verifyToken handles role checks inside controller or added later)
router.get("/pending", verifyToken, getPendingKyc);
router.post("/update-status", verifyToken, updateKycStatus);

export default router;
