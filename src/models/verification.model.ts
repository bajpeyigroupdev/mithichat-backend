import mongoose, { Schema } from "mongoose";

export const FACE_STATUSES = [
  "PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED",
  "RESUBMISSION_REQUIRED", "CANCELLED",
] as const;
export const KYC_STATUSES = [
  "PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED",
  "RESUBMISSION_REQUIRED", "EXPIRED",
] as const;
export const PURPOSES = [
  "HOST_APPLICATION", "WITHDRAWAL_ACTIVATION", "ACCOUNT_RECOVERY",
  "PROFILE_VERIFICATION", "DUPLICATE_ACCOUNT_REVIEW",
  "HIGH_RISK_ACTIVITY", "ADMIN_REQUESTED",
] as const;

const historySchema = new Schema({
  version: { type: Number, required: true },
  files: { type: Schema.Types.Mixed, default: {} },
  fields: { type: Schema.Types.Mixed, default: {} },
  submittedAt: { type: Date, default: Date.now },
}, { _id: false });

const commonReviewFields = {
  requestId: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  purpose: { type: String, enum: PURPOSES, required: true },
  submissionVersion: { type: Number, default: 1 },
  attemptNumber: { type: Number, default: 1 },
  assignedAdminId: { type: Schema.Types.ObjectId, ref: "User" },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  priority: { type: String, enum: ["LOW", "NORMAL", "HIGH", "URGENT"], default: "NORMAL" },
  riskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], default: "LOW" },
  rejectionReasonCode: String,
  rejectionReasonText: String,
  resubmissionInstructions: String,
  requestedResubmissionFields: { type: [String], default: [] },
  internalNotes: { type: [Schema.Types.Mixed], default: [] },
  userVisibleMessage: String,
  consentAccepted: { type: Boolean, required: true },
  consentTextVersion: { type: String, default: "2026-01" },
  consentAt: { type: Date, required: true },
  submittedAt: { type: Date, default: Date.now },
  reviewStartedAt: Date,
  reviewedAt: Date,
  approvedAt: Date,
  rejectedAt: Date,
  histories: { type: [historySchema], default: [] },
};

const faceSchema = new Schema({
  ...commonReviewFields,
  status: { type: String, enum: FACE_STATUSES, default: "PENDING", index: true },
  faceImageStorageKey: { type: String, required: true },
  faceImageMimeType: { type: String, required: true },
  deviceInfo: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });
faceSchema.index({ userId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "PENDING" } });

const kycSchema = new Schema({
  ...commonReviewFields,
  overallStatus: { type: String, enum: KYC_STATUSES, default: "PENDING", index: true },
  documentStatus: { type: String, enum: ["PENDING", "VALID", "INVALID", "UNCLEAR", "EXPIRED"], default: "PENDING" },
  faceStatus: { type: String, enum: ["PENDING", "MATCHED_MANUALLY", "NOT_MATCHED", "UNCLEAR"], default: "PENDING" },
  bankStatus: { type: String, enum: ["NOT_REQUIRED", "PENDING", "VERIFIED", "REJECTED"], default: "NOT_REQUIRED" },
  personalDetails: { type: Schema.Types.Mixed, required: true },
  document: { type: Schema.Types.Mixed, required: true },
  face: { type: Schema.Types.Mixed, required: true },
  bankDetails: { type: Schema.Types.Mixed },
  expiresAt: Date,
}, { timestamps: true });
kycSchema.index({ userId: 1, overallStatus: 1 }, { unique: true, partialFilterExpression: { overallStatus: "PENDING" } });

const auditSchema = new Schema({
  requestType: { type: String, enum: ["FACE", "KYC"], required: true, index: true },
  requestId: { type: String, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true },
  performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  performedByRole: { type: String, required: true },
  oldStatus: String,
  newStatus: String,
  note: String,
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const settingsSchema = new Schema({
  singletonKey: { type: String, default: "default", unique: true },
  faceVerificationEnabled: { type: Boolean, default: true },
  kycVerificationEnabled: { type: Boolean, default: true },
  rolesRequiringFaceVerification: { type: [String], default: ["host"] },
  rolesRequiringKycVerification: { type: [String], default: ["host"] },
  faceImageMaximumSizeMb: { type: Number, default: 5 },
  allowedImageFormats: { type: [String], default: ["jpg", "jpeg", "png"] },
  maximumSubmissionAttempts: { type: Number, default: 5 },
  resubmissionAllowed: { type: Boolean, default: true },
  verificationExpiryDays: { type: Number, default: 365 },
  bankDetailsRequiredForWithdrawal: { type: Boolean, default: true },
  manualReviewRequired: { type: Boolean, default: true },
  notificationsEnabled: { type: Boolean, default: true },
  autoAssignmentEnabled: { type: Boolean, default: false },
  automaticApprovalEnabled: { type: Boolean, default: false, immutable: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

export const FaceVerificationRequest = mongoose.model("FaceVerificationRequest", faceSchema);
export const KycVerificationRequest = mongoose.model("KycVerificationRequest", kycSchema);
export const VerificationAuditLog = mongoose.model("VerificationAuditLog", auditSchema);
export const VerificationSettings = mongoose.model("VerificationSettings", settingsSchema);
