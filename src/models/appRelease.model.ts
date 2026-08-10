import mongoose, { Schema, Document } from "mongoose";

export interface IAppRelease extends Document {
  versionName: string;          // e.g. "1.7.6"
  versionCode?: number;         // e.g. 176
  fileUrl: string;              // e.g. "/uploads/releases/app-release-1.7.6.apk"
  filePath: string;             // Absolute path on disk for streaming download
  fileType: "apk" | "aab";      // File extension type
  originalFileName: string;     // Original filename
  fileSizeBytes: number;        // Raw size in bytes
  fileSizeFormatted: string;    // Formatted size e.g. "64.3 MB"
  releaseNotes?: string;        // Changelog / release description
  isActive: boolean;            // Active status for website download
  downloadCount: number;        // Direct download counter
  uploadedBy?: string;          // User ID or name
  createdAt: Date;
  updatedAt: Date;
}

const appReleaseSchema = new Schema<IAppRelease>(
  {
    versionName: { type: String, required: true },
    versionCode: { type: Number, default: 1 },
    fileUrl: { type: String, required: true },
    filePath: { type: String, required: true },
    fileType: { type: String, enum: ["apk", "aab"], required: true, default: "apk" },
    originalFileName: { type: String, required: true },
    fileSizeBytes: { type: Number, required: true, default: 0 },
    fileSizeFormatted: { type: String, default: "0 MB" },
    releaseNotes: { type: String, default: "" },
    isActive: { type: Boolean, default: true, index: true },
    downloadCount: { type: Number, default: 0 },
    uploadedBy: { type: String, default: "Management" },
  },
  { timestamps: true }
);

appReleaseSchema.index({ isActive: 1, createdAt: -1 });

export const AppRelease = mongoose.model<IAppRelease>("AppRelease", appReleaseSchema);
