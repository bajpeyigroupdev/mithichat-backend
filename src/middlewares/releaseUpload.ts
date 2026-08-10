import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = path.resolve(process.cwd(), "uploads/releases");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
    cb(null, `release-${uniqueSuffix}-${sanitizedName}`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".apk" || ext === ".aab") {
    cb(null, true);
  } else {
    cb(new Error("Invalid file format. Only .apk and .aab files are allowed."));
  }
};

export const releaseUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 250 * 1024 * 1024, // 250 MB max file size for APK/AAB builds
  },
});
