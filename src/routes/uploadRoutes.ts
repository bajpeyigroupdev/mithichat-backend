import express from "express";
import { getUploadSignature, uploadDirectFile } from "../controllers/uploadController";
import { verifyToken } from "../middlewares/authorize.middleware";
import { giftFileUpload } from "../middlewares/giftUpload";

const router = express.Router();

// Get signature for client-side Cloudinary upload
router.get("/signature", verifyToken, getUploadSignature);

// Direct file upload for gift icons, animations (.svga, .gif, .webp, .png)
router.post("/file", verifyToken, giftFileUpload.single("file"), uploadDirectFile);

export default router;
