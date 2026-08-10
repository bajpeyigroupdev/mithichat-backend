import express from "express";
import { releaseUpload } from "../middlewares/releaseUpload";
import { verifyToken } from "../middlewares/authorize.middleware";
import {
  uploadAppRelease,
  getLatestRelease,
  downloadLatestRelease,
  getAllReleases,
  setActiveRelease,
  deleteRelease,
} from "../controllers/appReleaseController";

const router = express.Router();

// Public routes (No auth required for download button on website)
router.get("/latest", getLatestRelease);
router.get("/download", downloadLatestRelease);

// Management routes (Auth required)
router.post("/upload", verifyToken, releaseUpload.single("buildFile"), uploadAppRelease);
router.get("/all", verifyToken, getAllReleases);
router.patch("/:id/activate", verifyToken, setActiveRelease);
router.delete("/:id", verifyToken, deleteRelease);

export default router;
