import { Router } from "express";
import { verifyToken } from "../middlewares/authorize.middleware";
import { endCall, getCallHistory, getHostLevels, getRanking, startCall, pulse } from "../controllers/callController";

const router = Router();

// ✅ Start a call (generate Agora token + transaction)
router.post("/start", verifyToken, startCall);

// ✅ End a call (update transaction, deduct coins)
router.post("/end", verifyToken, endCall);

// ✅ Heartbeat Pulse
router.post("/pulse", verifyToken, pulse);

// ✅ Get user call history
router.get("/history", verifyToken, getCallHistory);

router.get("/ranking", verifyToken, getRanking);

router.get('/level', verifyToken, getHostLevels)
export default router;
