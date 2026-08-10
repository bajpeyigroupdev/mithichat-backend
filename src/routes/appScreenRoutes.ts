import express from "express";
import { verifyToken } from "../middlewares/authorize.middleware";
import {
  getAllScreens,
  getPublicScreenSecurityConfig,
  createScreen,
  updateScreen,
  toggleScreenshot,
  toggleRecording,
  deleteScreen,
} from "../controllers/appScreenController";

const router = express.Router();

// Public route for Mobile App dynamic security lookup
router.get("/public-config", getPublicScreenSecurityConfig);

// Management routes (Auth required)
router.get("/all", verifyToken, getAllScreens);
router.post("/create", verifyToken, createScreen);
router.put("/:id", verifyToken, updateScreen);
router.patch("/:id/toggle-screenshot", verifyToken, toggleScreenshot);
router.patch("/:id/toggle-recording", verifyToken, toggleRecording);
router.delete("/:id", verifyToken, deleteScreen);

export default router;
