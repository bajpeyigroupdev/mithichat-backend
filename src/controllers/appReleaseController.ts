import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { AppRelease } from "../models/appRelease.model";
import sendResponse from "../utils/reponse";
import { AuthRequest } from "../middlewares/authorize.middleware";

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Upload a new APK or AAB App Release
 * POST /api/v1/app-releases/upload
 */
export const uploadAppRelease = async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    const { versionName, versionCode, releaseNotes, setAsActive, directUrl, fileUrl: bodyFileUrl } = req.body;

    const targetUrl = directUrl || bodyFileUrl;

    if (!file && !targetUrl) {
      return sendResponse(res, 400, false, "Please select a build file (.apk/.aab) or enter a direct download URL.");
    }

    if (!versionName) {
      if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return sendResponse(res, 400, false, "Version name (e.g. 1.8.3) is required.");
    }

    let fileType: "apk" | "aab" = "apk";
    let fileUrl = "";
    let filePath = "";
    let originalFileName = "";
    let fileSizeBytes = 0;
    let fileSizeFormatted = "70.2 MB";

    if (file) {
      const ext = path.extname(file.originalname).toLowerCase().replace(".", "");
      fileType = ext === "aab" ? "aab" : "apk";
      fileUrl = `/uploads/releases/${file.filename}`;
      filePath = file.path;
      originalFileName = file.originalname;
      fileSizeBytes = file.size;
      fileSizeFormatted = formatBytes(file.size);
    } else {
      fileUrl = targetUrl;
      const lower = targetUrl.toLowerCase();
      fileType = lower.includes(".aab") ? "aab" : "apk";
      originalFileName = targetUrl.split("/").pop()?.split("?")[0] || `app-release.${fileType}`;
    }

    const shouldBeActive = setAsActive === "false" ? false : true;

    // If setting as active, deactivate previous releases
    if (shouldBeActive) {
      await AppRelease.updateMany({ isActive: true }, { $set: { isActive: false } });
    }

    const release = await AppRelease.create({
      versionName: String(versionName).trim(),
      versionCode: versionCode ? parseInt(versionCode, 10) : 1,
      fileUrl,
      filePath,
      fileType,
      originalFileName,
      fileSizeBytes,
      fileSizeFormatted,
      releaseNotes: releaseNotes ? String(releaseNotes).trim() : "",
      isActive: shouldBeActive,
      downloadCount: 0,
      uploadedBy: req.user?.name || "Management Admin",
    });

    console.log(`[AppRelease] New ${fileType.toUpperCase()} release registered: v${versionName} (${release.fileSizeFormatted})`);

    return sendResponse(res, 201, true, `App release v${versionName} (${fileType.toUpperCase()}) registered successfully.`, release);
  } catch (error: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error("[AppRelease] Upload error:", error);
    return sendResponse(res, 500, false, error.message || "Internal server error during app release upload.");
  }
};

/**
 * Public Endpoint: Get Latest App Release Info
 * GET /api/v1/app-releases/latest
 */
export const getLatestRelease = async (_req: Request, res: Response) => {
  try {
    let activeRelease = await AppRelease.findOne({ isActive: true }).sort({ createdAt: -1 });

    if (!activeRelease) {
      activeRelease = await AppRelease.findOne().sort({ createdAt: -1 });
    }

    if (!activeRelease) {
      // Fallback for default APK if no DB record exists yet
      const defaultApkPath = path.resolve(process.cwd(), "../MithiChat-v1.5-call-banner-fix.apk");
      const exists = fs.existsSync(defaultApkPath);
      return res.status(200).json({
        success: true,
        data: {
          versionName: "1.7.6",
          fileUrl: "/api/v1/app-releases/download",
          downloadUrl: "/api/v1/app-releases/download",
          fileType: "apk",
          fileSizeFormatted: "64.3 MB",
          releaseNotes: "Latest production build with call and banner enhancements.",
          isActive: true,
          hasBuild: exists,
        },
      });
    }

    const host = process.env.BASE_URL || "https://api.mithichat.live/api";
    const fullDownloadUrl = `${host.replace(/\/api$/, "")}/api/v1/app-releases/download`;

    return res.status(200).json({
      success: true,
      data: {
        id: activeRelease._id,
        versionName: activeRelease.versionName,
        versionCode: activeRelease.versionCode,
        fileUrl: activeRelease.fileUrl,
        downloadUrl: fullDownloadUrl,
        fileType: activeRelease.fileType,
        originalFileName: activeRelease.originalFileName,
        fileSizeFormatted: activeRelease.fileSizeFormatted,
        releaseNotes: activeRelease.releaseNotes,
        downloadCount: activeRelease.downloadCount,
        updatedAt: activeRelease.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("[AppRelease] getLatestRelease error:", error);
    return sendResponse(res, 500, false, "Failed to retrieve latest app release.");
  }
};

/**
 * Public Direct Download Route: Stream or serve the latest APK/AAB build directly to browser
 * GET /api/v1/app-releases/download
 */
export const downloadLatestRelease = async (_req: Request, res: Response) => {
  try {
    let release = await AppRelease.findOne({ isActive: true }).sort({ createdAt: -1 });

    if (!release) {
      release = await AppRelease.findOne({ fileType: "apk" }).sort({ createdAt: -1 });
    }

    if (release && fs.existsSync(release.filePath)) {
      // Increment download counter
      await AppRelease.updateOne({ _id: release._id }, { $inc: { downloadCount: 1 } });

      const downloadFileName = `MeethiChat-v${release.versionName}.${release.fileType}`;
      res.setHeader("Content-Disposition", `attachment; filename="${downloadFileName}"`);
      res.setHeader("Content-Type", release.fileType === "apk" ? "application/vnd.android.package-archive" : "application/octet-stream");

      return res.sendFile(path.resolve(release.filePath));
    }

    // Fallback: Check root project for fallback APK
    const candidatePaths = [
      path.resolve(process.cwd(), "uploads/releases/app-release.apk"),
      path.resolve(process.cwd(), "../MithiChat-v1.5-call-banner-fix.apk"),
      path.resolve(process.cwd(), "./MithiChat-v1.5-call-banner-fix.apk"),
    ];

    for (const fallbackPath of candidatePaths) {
      if (fs.existsSync(fallbackPath)) {
        res.setHeader("Content-Disposition", 'attachment; filename="MeethiChat-v1.7.6.apk"');
        res.setHeader("Content-Type", "application/vnd.android.package-archive");
        return res.sendFile(fallbackPath);
      }
    }

    return sendResponse(res, 404, false, "No APK build file found on server.");
  } catch (error: any) {
    console.error("[AppRelease] downloadLatestRelease error:", error);
    return sendResponse(res, 500, false, "Download failed due to server error.");
  }
};

/**
 * Management API: Get All Release History
 * GET /api/v1/app-releases/all
 */
export const getAllReleases = async (_req: Request, res: Response) => {
  try {
    const releases = await AppRelease.find().sort({ createdAt: -1 });
    return sendResponse(res, 200, true, "App releases fetched successfully.", releases);
  } catch (error: any) {
    console.error("[AppRelease] getAllReleases error:", error);
    return sendResponse(res, 500, false, "Failed to fetch app releases list.");
  }
};

/**
 * Management API: Activate a specific App Release
 * PATCH /api/v1/app-releases/:id/activate
 */
export const setActiveRelease = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const target = await AppRelease.findById(id);
    if (!target) {
      return sendResponse(res, 404, false, "Release record not found.");
    }

    await AppRelease.updateMany({}, { $set: { isActive: false } });
    target.isActive = true;
    await target.save();

    return sendResponse(res, 200, true, `v${target.versionName} (${target.fileType.toUpperCase()}) is now set as the active download build.`, target);
  } catch (error: any) {
    console.error("[AppRelease] setActiveRelease error:", error);
    return sendResponse(res, 500, false, "Failed to activate release.");
  }
};

/**
 * Management API: Delete an App Release
 * DELETE /api/v1/app-releases/:id
 */
export const deleteRelease = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const target = await AppRelease.findById(id);
    if (!target) {
      return sendResponse(res, 404, false, "Release record not found.");
    }

    if (fs.existsSync(target.filePath)) {
      try {
        fs.unlinkSync(target.filePath);
      } catch (e) {
        console.warn("[AppRelease] Could not delete physical file:", e);
      }
    }

    await AppRelease.findByIdAndDelete(id);

    // If active was deleted, promote latest remaining
    if (target.isActive) {
      const remainingLatest = await AppRelease.findOne().sort({ createdAt: -1 });
      if (remainingLatest) {
        remainingLatest.isActive = true;
        await remainingLatest.save();
      }
    }

    return sendResponse(res, 200, true, "Release build deleted successfully.");
  } catch (error: any) {
    console.error("[AppRelease] deleteRelease error:", error);
    return sendResponse(res, 500, false, "Failed to delete release.");
  }
};
