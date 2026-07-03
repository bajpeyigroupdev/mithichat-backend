import express from "express";
import { verifyToken } from "../middlewares/authorize.middleware";
import { verifyUpi } from "../controllers/upiController";

const router = express.Router();

router.post("/verify", verifyToken, verifyUpi);

export default router;
