import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

export const VERIFICATION_STORAGE_ROOT = path.resolve(
  process.env.VERIFICATION_PRIVATE_STORAGE_PATH || path.join(process.cwd(), "private", "verifications")
);
fs.mkdirSync(VERIFICATION_STORAGE_ROOT, { recursive: true });

const allowed = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
]);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VERIFICATION_STORAGE_ROOT),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${allowed.get(file.mimetype) || ".bin"}`),
});

export const verificationUpload = multer({
  storage,
  limits: { fileSize: Number(process.env.VERIFICATION_MAX_FILE_SIZE_MB || 5) * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const valid = allowed.has(file.mimetype) && [".jpg", ".jpeg", ".png"].includes(ext);
    if (valid) cb(null, true);
    else cb(new Error("Only JPG, JPEG and PNG images are allowed"));
  },
});

export const cleanupUploadedFiles = async (files?: Express.Multer.File[]) => {
  await Promise.all((files || []).map((file) => fs.promises.unlink(file.path).catch(() => undefined)));
};
