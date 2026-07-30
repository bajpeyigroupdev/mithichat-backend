import express from "express";
import { verifyToken } from "../middlewares/authorize.middleware";
import { verificationUpload } from "../middlewares/verificationUpload";
import * as controller from "../controllers/verificationController";

const router = express.Router();
const uploads = verificationUpload.fields([
  { name: "faceImage", maxCount: 1 }, { name: "documentFront", maxCount: 1 },
  { name: "documentBack", maxCount: 1 }, { name: "liveSelfie", maxCount: 1 },
  { name: "supportingDocument", maxCount: 1 }, { name: "bankProof", maxCount: 1 },
]);

router.post("/face", verifyToken, uploads, controller.submitFaceVerification);
router.get("/face/me", verifyToken, controller.getMyFaceVerification);
router.get("/face/:requestId", verifyToken, controller.getMyFaceById);
router.post("/face/:requestId/resubmit", verifyToken, uploads, controller.resubmitFaceVerification);
router.delete("/face/:requestId", verifyToken, controller.cancelFaceVerification);
router.post("/kyc", verifyToken, uploads, controller.submitKycVerification);
router.get("/kyc/me", verifyToken, controller.getMyKycVerification);
router.get("/kyc/:requestId", verifyToken, controller.getMyKycById);
router.post("/kyc/:requestId/resubmit", verifyToken, uploads, controller.resubmitKycVerification);

export default router;
