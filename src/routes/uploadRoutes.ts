import express from "express";
import { getUploadSignature } from "../controllers/uploadController";
import { verifyToken } from "../middlewares/authorize.middleware";

const router = express.Router();

// Get signature for client-side upload
// verifyToken is recommended but optional depending on requirements. 
// Adding it for security so only logged in users can upload.
router.get("/signature", verifyToken, getUploadSignature);

export default router;
