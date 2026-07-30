import express from "express";
import { verifyToken } from "../middlewares/authorize.middleware";
import * as controller from "../controllers/verificationController";

const router = express.Router();
router.use(verifyToken);

router.get("/files/:storageKey", controller.serveVerificationFile);
router.get("/face", controller.listFaceVerifications);
router.get("/face/:requestId", controller.getAdminFaceDetail);
router.patch("/face/:requestId/start-review", controller.startFaceReview);
router.patch("/face/:requestId/approve", controller.approveFace);
router.patch("/face/:requestId/reject", controller.rejectFace);
router.patch("/face/:requestId/request-resubmission", controller.requestFaceResubmission);
router.patch("/face/:requestId/assign", controller.assignFace);
router.post("/face/:requestId/notes", controller.addFaceNote);
router.get("/kyc", controller.listKycVerifications);
router.get("/kyc/:requestId", controller.getAdminKycDetail);
router.get("/kyc/:requestId/sensitive", controller.revealKycSensitiveData);
router.patch("/kyc/:requestId/start-review", controller.startKycReview);
router.patch("/kyc/:requestId/approve", controller.approveKyc);
router.patch("/kyc/:requestId/reject", controller.rejectKyc);
router.patch("/kyc/:requestId/request-resubmission", controller.requestKycResubmission);
router.patch("/kyc/:requestId/assign", controller.assignKyc);
router.patch("/kyc/:requestId/section-status", controller.updateKycSectionStatus);
router.post("/kyc/:requestId/notes", controller.addKycNote);
router.get("/reports/summary", controller.getVerificationSummary);
router.get("/reports/trends", controller.getVerificationTrends);
router.get("/reports/admin-performance", controller.getAdminPerformance);
router.get("/reports/export", controller.exportVerificationReport);
router.get("/settings", controller.getVerificationSettings);
router.patch("/settings", controller.updateVerificationSettings);

export default router;
