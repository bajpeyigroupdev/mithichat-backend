import express from "express";
import {
    getHosts,
    getHostById,
    applyHost,
    getAppliedHosts,
    submitHostForm,
    approveHost,
    blockHost,
    sendFormForHost,
} from "../controllers/hostController";
import { verifyToken } from "../middlewares/authorize.middleware";
// import { upload } from "../utils/multer";

const router = express.Router();

router.post("/apply", verifyToken, applyHost);
router.get("/", verifyToken, getAppliedHosts);
router.post("/send-form/:hostId", verifyToken, sendFormForHost);
router.post("/submit-form", submitHostForm as any)

router.post("/:id", verifyToken, approveHost);
router.get("/", verifyToken, getHosts as any);
router.get("/:id", verifyToken, getHostById as any);
router.patch("/:id", verifyToken, blockHost);

export default router;
