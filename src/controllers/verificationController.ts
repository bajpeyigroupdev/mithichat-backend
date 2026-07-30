import fs from "fs";
import path from "path";
import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middlewares/authorize.middleware";
import { User } from "../models/user.model";
import {
  FACE_STATUSES, KYC_STATUSES, PURPOSES, FaceVerificationRequest,
  KycVerificationRequest, VerificationAuditLog, VerificationSettings,
} from "../models/verification.model";
import { cleanupUploadedFiles, VERIFICATION_STORAGE_ROOT } from "../middlewares/verificationUpload";
import { decryptSensitive, encryptSensitive, maskSensitive, sanitizeStorageKey } from "../utils/verificationSecurity";
import { createNotification } from "./notificationController";
import { PermissionEngine } from "../utils/permissionEngine";
import { HierarchyScopeService } from "../utils/hierarchyScope";
import sendResponse from "../utils/reponse";
import { canVerificationTransition } from "../utils/verificationRules";

const activeStatuses = ["PENDING", "UNDER_REVIEW"];
const editableStatuses = ["REJECTED", "RESUBMISSION_REQUIRED"];
const allowedResubmissionFields = new Set([
  "faceSelfie", "documentFront", "documentBack", "documentNumber",
  "personalDetails", "address", "bankDetails", "bankProof", "supportingDocument",
]);
const statusOf = (type: "FACE" | "KYC", record: any) => type === "FACE" ? record.status : record.overallStatus;
const filesOf = (req: AuthRequest) => Object.values((req.files || {}) as Record<string, Express.Multer.File[]>).flat();
const fileFor = (req: AuthRequest, key: string) => ((req.files || {}) as Record<string, Express.Multer.File[]>)[key]?.[0];
const parseJson = <T>(value: unknown, fallback: T): T => {
  if (!value) return fallback;
  if (typeof value === "object") return value as T;
  try { return JSON.parse(String(value)); } catch { return fallback; }
};
const requestId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const getSettings = async () => VerificationSettings.findOneAndUpdate(
  { singletonKey: "default" }, { $setOnInsert: { singletonKey: "default" } }, { upsert: true, new: true }
);
const audit = (req: AuthRequest, type: "FACE" | "KYC", record: any, action: string, oldStatus?: string, note?: string, metadata: any = {}) =>
  VerificationAuditLog.create({
    requestType: type, requestId: record.requestId, userId: record.userId,
    action, performedBy: req.user!.id, performedByRole: req.user!.role,
    oldStatus, newStatus: statusOf(type, record), note, metadata,
  });
const notify = async (userId: string, title: string, message: string, requestType: "FACE" | "KYC", requestIdValue: string) =>
  createNotification(userId, title, message, "system", {
    action: requestType === "FACE" ? "open_face_verification" : "open_kyc_verification",
    requestType, requestId: requestIdValue,
  });

const can = async (req: AuthRequest, permission: string, action: "view" | "review" | "approve" | "reject" | "assign" = "view") => {
  const role = req.user?.role;
  if (!role) return false;
  if (role === "owner" || role === "superAdmin") return true;
  if (role === "admin") return true;
  if (role === "operator") return ["view", "review", "assign"].includes(action);
  if (role === "agency") return action === "view" && (permission === "verification.face.view" || permission === "verification.kyc.view");
  return PermissionEngine.canAccessAction(req.user, permission.split(".").slice(0, 2).join("."), permission);
};
const requirePermission = async (req: AuthRequest, res: Response, permission: string, action?: any) => {
  if (await can(req, permission, action)) return true;
  sendResponse(res, 403, false, "You do not have permission for this verification action");
  return false;
};
const scopedUserIds = async (req: AuthRequest) => {
  if (["owner", "superAdmin", "operator"].includes(req.user!.role)) return null;
  const scope = HierarchyScopeService.buildUserScope({ id: String(req.user!.id), role: req.user!.role });
  return (await User.find(scope).select("_id").lean()).map((user) => user._id);
};
const userView = (record: any) => {
  const value = record.toObject ? record.toObject() : { ...record };
  delete value.internalNotes;
  if (value.document) {
    delete value.document.encryptedDocumentNumber;
    delete value.document.frontImageStorageKey;
    delete value.document.backImageStorageKey;
    delete value.document.supportingDocumentStorageKey;
  }
  if (value.face) delete value.face.liveSelfieStorageKey;
  if (value.bankDetails) {
    delete value.bankDetails.encryptedAccountNumber;
    delete value.bankDetails.proofImageStorageKey;
  }
  delete value.faceImageStorageKey;
  return value;
};
const adminView = (record: any) => {
  const value = record.toObject ? record.toObject() : { ...record };
  const fileUrl = (key?: string) => key ? `/api/v1/admin/verifications/files/${encodeURIComponent(key)}` : undefined;
  if (value.faceImageStorageKey) value.faceImageUrl = fileUrl(value.faceImageStorageKey);
  if (value.document) {
    value.document.frontImageUrl = fileUrl(value.document.frontImageStorageKey);
    value.document.backImageUrl = fileUrl(value.document.backImageStorageKey);
    value.document.supportingDocumentUrl = fileUrl(value.document.supportingDocumentStorageKey);
    delete value.document.encryptedDocumentNumber;
  }
  if (value.face) value.face.liveSelfieUrl = fileUrl(value.face.liveSelfieStorageKey);
  if (value.bankDetails) {
    value.bankDetails.proofImageUrl = fileUrl(value.bankDetails.proofImageStorageKey);
    delete value.bankDetails.encryptedAccountNumber;
  }
  return value;
};

export const submitFaceVerification = async (req: AuthRequest, res: Response) => {
  try {
    const settings = await getSettings();
    if (!settings.faceVerificationEnabled) return sendResponse(res, 403, false, "Face verification is currently disabled");
    const face = fileFor(req, "faceImage");
    if (!face || face.size < 15_000) return sendResponse(res, 400, false, "A clear live selfie is required");
    const purpose = String(req.body.purpose || "PROFILE_VERIFICATION");
    if (!PURPOSES.includes(purpose as any)) return sendResponse(res, 400, false, "Invalid verification purpose");
    if (String(req.body.consentAccepted) !== "true") return sendResponse(res, 400, false, "Consent is required");
    const duplicate = await FaceVerificationRequest.exists({ userId: req.user!.id, status: { $in: activeStatuses } });
    if (duplicate) return sendResponse(res, 409, false, "A face verification request is already pending");
    const attempts = await FaceVerificationRequest.countDocuments({ userId: req.user!.id });
    if (attempts >= settings.maximumSubmissionAttempts) return sendResponse(res, 429, false, "Maximum verification attempts reached");
    const record = await FaceVerificationRequest.create({
      requestId: requestId("FACE"), userId: req.user!.id, purpose,
      faceImageStorageKey: face.filename, faceImageMimeType: face.mimetype,
      attemptNumber: attempts + 1, consentAccepted: true, consentAt: new Date(),
      deviceInfo: parseJson(req.body.deviceInfo, {}),
      histories: [{ version: 1, files: { faceImageStorageKey: face.filename }, fields: { purpose } }],
    });
    await User.findByIdAndUpdate(req.user!.id, { faceVerificationStatus: "PENDING" });
    await audit(req, "FACE", record, "SUBMITTED");
    await notify(String(req.user!.id), "Face verification submitted", "Your face verification is waiting for manual review.", "FACE", record.requestId);
    return sendResponse(res, 201, true, "Face verification submitted", userView(record));
  } catch (error: any) {
    await cleanupUploadedFiles(filesOf(req));
    return sendResponse(res, error?.code === 11000 ? 409 : 500, false, error?.code === 11000 ? "A verification request is already pending" : error.message);
  }
};

export const getMyFaceVerification = async (req: AuthRequest, res: Response) => {
  const record = await FaceVerificationRequest.findOne({ userId: req.user!.id }).sort({ createdAt: -1 });
  return sendResponse(res, 200, true, record ? "Face verification fetched" : "Face verification not submitted",
    record ? userView(record) : { status: "NOT_SUBMITTED" });
};

export const getMyFaceById = async (req: AuthRequest, res: Response) => {
  const record = await FaceVerificationRequest.findOne({ requestId: req.params.requestId, userId: req.user!.id });
  if (!record) return sendResponse(res, 404, false, "Face verification request not found");
  return sendResponse(res, 200, true, "Face verification fetched", userView(record));
};

export const resubmitFaceVerification = async (req: AuthRequest, res: Response) => {
  try {
    const face = fileFor(req, "faceImage");
    if (!face) return sendResponse(res, 400, false, "A new live selfie is required");
    const current = await FaceVerificationRequest.findOne({ requestId: req.params.requestId, userId: req.user!.id });
    if (!current || !editableStatuses.includes(current.status)) return sendResponse(res, 409, false, "This request cannot be resubmitted");
    const oldStatus = current.status;
    current.status = "PENDING"; current.submissionVersion += 1; current.attemptNumber += 1;
    current.faceImageStorageKey = face.filename; current.faceImageMimeType = face.mimetype;
    current.submittedAt = new Date(); current.rejectionReasonCode = undefined;
    current.rejectionReasonText = undefined; current.requestedResubmissionFields = [];
    current.histories.push({ version: current.submissionVersion, files: { faceImageStorageKey: face.filename }, fields: {} } as any);
    await current.save();
    await User.findByIdAndUpdate(req.user!.id, { faceVerificationStatus: "PENDING" });
    await audit(req, "FACE", current, "RESUBMITTED", oldStatus);
    await notify(String(req.user!.id), "Face verification resubmitted", "Your new face selfie was received.", "FACE", current.requestId);
    return sendResponse(res, 200, true, "Face verification resubmitted", userView(current));
  } catch (error: any) {
    await cleanupUploadedFiles(filesOf(req));
    return sendResponse(res, error?.code === 11000 ? 409 : 500, false, error?.code === 11000 ? "A verification request is already pending" : error.message);
  }
};

export const cancelFaceVerification = async (req: AuthRequest, res: Response) => {
  const record = await FaceVerificationRequest.findOneAndUpdate(
    { requestId: req.params.requestId, userId: req.user!.id, status: "PENDING" },
    { status: "CANCELLED", reviewedAt: new Date() }, { new: true }
  );
  if (!record) return sendResponse(res, 409, false, "Only a pending request can be cancelled");
  await User.findByIdAndUpdate(req.user!.id, { faceVerificationStatus: "NOT_SUBMITTED" });
  await audit(req, "FACE", record, "CANCELLED", "PENDING");
  return sendResponse(res, 200, true, "Face verification cancelled");
};

export const submitKycVerification = async (req: AuthRequest, res: Response) => {
  try {
    const settings = await getSettings();
    if (!settings.kycVerificationEnabled) return sendResponse(res, 403, false, "KYC verification is currently disabled");
    if (String(req.body.consentAccepted) !== "true") return sendResponse(res, 400, false, "Consent is required");
    const personal = parseJson<any>(req.body.personalDetails, {});
    const document = parseJson<any>(req.body.document, {});
    const bank = parseJson<any>(req.body.bankDetails, null);
    const front = fileFor(req, "documentFront");
    const selfie = fileFor(req, "liveSelfie");
    if (!personal.fullName || !personal.dateOfBirth || !personal.mobileNumber || !personal.address?.addressLine ||
      !personal.address?.state || !personal.address?.district || !personal.address?.cityOrVillage ||
      !/^\d{6}$/.test(personal.address?.pinCode || "")) {
      return sendResponse(res, 400, false, "Complete valid personal and address details are required");
    }
    const allowedDocuments = ["PAN_CARD", "VOTER_ID", "DRIVING_LICENCE", "PASSPORT", "OTHER_GOVERNMENT_ID"];
    if (!allowedDocuments.includes(document.type) || !document.number || !document.nameOnDocument || !front || !selfie) {
      return sendResponse(res, 400, false, "Document details, front image and live selfie are required");
    }
    const duplicate = await KycVerificationRequest.exists({ userId: req.user!.id, overallStatus: { $in: activeStatuses } });
    if (duplicate) return sendResponse(res, 409, false, "A KYC request is already pending");
    if (bank?.accountNumber && bank.accountNumber !== bank.confirmAccountNumber) {
      return sendResponse(res, 400, false, "Account numbers do not match");
    }
    const attempts = await KycVerificationRequest.countDocuments({ userId: req.user!.id });
    const version = 1;
    const storedDocument = {
      type: document.type, encryptedDocumentNumber: encryptSensitive(document.number),
      maskedDocumentNumber: maskSensitive(document.number), nameOnDocument: document.nameOnDocument,
      expiryDate: document.expiryDate || undefined, frontImageStorageKey: front.filename,
      backImageStorageKey: fileFor(req, "documentBack")?.filename,
      supportingDocumentStorageKey: fileFor(req, "supportingDocument")?.filename,
    };
    const storedBank = bank?.accountNumber ? {
      accountHolderName: bank.accountHolderName, bankName: bank.bankName,
      encryptedAccountNumber: encryptSensitive(bank.accountNumber),
      maskedAccountNumber: maskSensitive(bank.accountNumber, 0, 4),
      ifscCode: bank.ifscCode, branchName: bank.branchName, upiId: bank.upiId,
      proofImageStorageKey: fileFor(req, "bankProof")?.filename,
    } : undefined;
    const record = await KycVerificationRequest.create({
      requestId: requestId("KYC"), userId: req.user!.id,
      purpose: PURPOSES.includes(req.body.purpose) ? req.body.purpose : "PROFILE_VERIFICATION",
      personalDetails: personal, document: storedDocument,
      face: { liveSelfieStorageKey: selfie.filename },
      bankDetails: storedBank, bankStatus: storedBank ? "PENDING" : "NOT_REQUIRED",
      attemptNumber: attempts + 1, consentAccepted: true, consentAt: new Date(),
      expiresAt: new Date(Date.now() + settings.verificationExpiryDays * 86400000),
      histories: [{ version, files: {
        documentFront: front.filename, documentBack: fileFor(req, "documentBack")?.filename,
        liveSelfie: selfie.filename, supportingDocument: fileFor(req, "supportingDocument")?.filename,
        bankProof: fileFor(req, "bankProof")?.filename,
      }, fields: { personalDetails: personal, document: { ...storedDocument, encryptedDocumentNumber: undefined } } }],
    });
    await User.findByIdAndUpdate(req.user!.id, { kycVerificationStatus: "PENDING" });
    await audit(req, "KYC", record, "SUBMITTED");
    await notify(String(req.user!.id), "KYC submitted", "Your KYC is waiting for manual review.", "KYC", record.requestId);
    return sendResponse(res, 201, true, "KYC verification submitted", userView(record));
  } catch (error: any) {
    await cleanupUploadedFiles(filesOf(req));
    return sendResponse(res, error?.code === 11000 ? 409 : 500, false, error?.code === 11000 ? "A verification request is already pending" : error.message);
  }
};

export const getMyKycVerification = async (req: AuthRequest, res: Response) => {
  const record = await KycVerificationRequest.findOne({ userId: req.user!.id }).sort({ createdAt: -1 });
  return sendResponse(res, 200, true, record ? "KYC fetched" : "KYC not submitted",
    record ? userView(record) : { overallStatus: "NOT_SUBMITTED" });
};

export const getMyKycById = async (req: AuthRequest, res: Response) => {
  const record = await KycVerificationRequest.findOne({ requestId: req.params.requestId, userId: req.user!.id });
  if (!record) return sendResponse(res, 404, false, "KYC request not found");
  return sendResponse(res, 200, true, "KYC fetched", userView(record));
};

export const resubmitKycVerification = async (req: AuthRequest, res: Response) => {
  try {
    const record: any = await KycVerificationRequest.findOne({ requestId: req.params.requestId, userId: req.user!.id });
    if (!record || record.overallStatus !== "RESUBMISSION_REQUIRED") return sendResponse(res, 409, false, "This KYC cannot be resubmitted");
    const requested = new Set(record.requestedResubmissionFields || []);
    const suppliedFields = parseJson<any>(req.body.fields, {});
    const replacements: any = {};
    if (requested.has("faceSelfie") && fileFor(req, "liveSelfie")) {
      replacements["face.liveSelfieStorageKey"] = fileFor(req, "liveSelfie")!.filename;
    }
    if (requested.has("documentFront") && fileFor(req, "documentFront")) replacements["document.frontImageStorageKey"] = fileFor(req, "documentFront")!.filename;
    if (requested.has("documentBack") && fileFor(req, "documentBack")) replacements["document.backImageStorageKey"] = fileFor(req, "documentBack")!.filename;
    if (requested.has("supportingDocument") && fileFor(req, "supportingDocument")) replacements["document.supportingDocumentStorageKey"] = fileFor(req, "supportingDocument")!.filename;
    if (requested.has("bankProof") && fileFor(req, "bankProof")) replacements["bankDetails.proofImageStorageKey"] = fileFor(req, "bankProof")!.filename;
    if (requested.has("documentNumber") && suppliedFields.documentNumber) {
      replacements["document.encryptedDocumentNumber"] = encryptSensitive(suppliedFields.documentNumber);
      replacements["document.maskedDocumentNumber"] = maskSensitive(suppliedFields.documentNumber);
    }
    if (requested.has("personalDetails") && suppliedFields.personalDetails) replacements.personalDetails = suppliedFields.personalDetails;
    if (requested.has("address") && suppliedFields.address) replacements["personalDetails.address"] = suppliedFields.address;
    if (requested.has("bankDetails") && suppliedFields.bankDetails) {
      const bank = suppliedFields.bankDetails;
      if (!bank.accountHolderName || !bank.bankName || !bank.accountNumber || !bank.ifscCode) {
        return sendResponse(res, 400, false, "Complete bank details are required");
      }
      if (bank.accountNumber !== bank.confirmAccountNumber) {
        return sendResponse(res, 400, false, "Account numbers do not match");
      }
      replacements.bankDetails = {
        accountHolderName: bank.accountHolderName,
        bankName: bank.bankName,
        encryptedAccountNumber: encryptSensitive(bank.accountNumber),
        maskedAccountNumber: maskSensitive(bank.accountNumber, 0, 4),
        ifscCode: String(bank.ifscCode).toUpperCase(),
        branchName: bank.branchName,
        upiId: bank.upiId,
        proofImageStorageKey: fileFor(req, "bankProof")?.filename || record.bankDetails?.proofImageStorageKey,
      };
      replacements.bankStatus = "PENDING";
    }
    if (Object.keys(replacements).length === 0) return sendResponse(res, 400, false, "Submit at least one requested field");
    const oldStatus = record.overallStatus;
    Object.entries(replacements).forEach(([key, value]) => record.set(key, value));
    record.overallStatus = "PENDING"; record.submissionVersion += 1; record.attemptNumber += 1;
    record.submittedAt = new Date(); record.requestedResubmissionFields = [];
    record.histories.push({ version: record.submissionVersion, files: Object.fromEntries(filesOf(req).map(f => [f.fieldname, f.filename])), fields: suppliedFields });
    await record.save();
    await User.findByIdAndUpdate(req.user!.id, { kycVerificationStatus: "PENDING" });
    await audit(req, "KYC", record, "RESUBMITTED", oldStatus);
    await notify(String(req.user!.id), "KYC resubmission received", "Your updated KYC information was received.", "KYC", record.requestId);
    return sendResponse(res, 200, true, "KYC resubmitted", userView(record));
  } catch (error: any) {
    await cleanupUploadedFiles(filesOf(req));
    return sendResponse(res, error?.code === 11000 ? 409 : 500, false, error?.code === 11000 ? "A verification request is already pending" : error.message);
  }
};

const listRequests = async (req: AuthRequest, res: Response, type: "FACE" | "KYC") => {
  const permission = type === "FACE" ? "verification.face.view" : "verification.kyc.view";
  if (!await requirePermission(req, res, permission, "view")) return;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const model: any = type === "FACE" ? FaceVerificationRequest : KycVerificationRequest;
  const statusKey = type === "FACE" ? "status" : "overallStatus";
  const filter: any = {};
  if (req.query.status) filter[statusKey] = String(req.query.status);
  if (req.query.purpose) filter.purpose = String(req.query.purpose);
  if (req.query.priority) filter.priority = String(req.query.priority);
  if (req.query.assignedAdminId) filter.assignedAdminId = req.query.assignedAdminId;
  if (req.query.dateFrom || req.query.dateTo) filter.createdAt = {
    ...(req.query.dateFrom ? { $gte: new Date(String(req.query.dateFrom)) } : {}),
    ...(req.query.dateTo ? { $lte: new Date(String(req.query.dateTo)) } : {}),
  };
  const scoped = await scopedUserIds(req);
  if (scoped) filter.userId = { $in: scoped };
  const search = String(req.query.search || "").trim();
  if (search) {
    const users = await User.find({ $or: [
      { name: new RegExp(search, "i") }, { userName: new RegExp(search, "i") },
      { meethiId: new RegExp(search, "i") }, { phoneNumber: new RegExp(search, "i") },
    ] }).select("_id");
    filter.userId = { $in: users.map(u => u._id).filter(id => !scoped || scoped.some(s => String(s) === String(id))) };
  }
  const sortKey = ["createdAt", "priority", statusKey].includes(String(req.query.sortBy)) ? String(req.query.sortBy) : "createdAt";
  const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
  const [records, total] = await Promise.all([
    model.find(filter).populate("userId", "userId meethiId name userName image role phoneNumber email gender createdAt status")
      .populate("assignedAdminId", "name userName role").sort({ [sortKey]: sortOrder }).skip((page - 1) * limit).limit(limit),
    model.countDocuments(filter),
  ]);
  return sendResponse(res, 200, true, `${type} requests fetched`, {
    requests: records.map(adminView), total, page, limit, totalPages: Math.ceil(total / limit),
  });
};
export const listFaceVerifications = (req: AuthRequest, res: Response) => listRequests(req, res, "FACE");
export const listKycVerifications = (req: AuthRequest, res: Response) => listRequests(req, res, "KYC");

const detailRequest = async (req: AuthRequest, res: Response, type: "FACE" | "KYC") => {
  if (!await requirePermission(req, res, type === "FACE" ? "verification.face.view" : "verification.kyc.view", "view")) return;
  const model: any = type === "FACE" ? FaceVerificationRequest : KycVerificationRequest;
  const record = await model.findOne({ requestId: req.params.requestId })
    .populate("userId", "userId meethiId name userName image role phoneNumber email gender createdAt status")
    .populate("assignedAdminId reviewedBy", "name userName role");
  if (!record) return sendResponse(res, 404, false, "Verification request not found");
  const timeline = await VerificationAuditLog.find({ requestType: type, requestId: record.requestId })
    .populate("performedBy", "name userName role").sort({ createdAt: 1 });
  return sendResponse(res, 200, true, "Verification detail fetched", { request: adminView(record), timeline });
};
export const getAdminFaceDetail = (req: AuthRequest, res: Response) => detailRequest(req, res, "FACE");
export const getAdminKycDetail = (req: AuthRequest, res: Response) => detailRequest(req, res, "KYC");

const transition = async (req: AuthRequest, res: Response, type: "FACE" | "KYC", action: string) => {
  const base = type === "FACE" ? "verification.face" : "verification.kyc";
  const permissionAction: any = action === "APPROVE" ? "approve" : action === "ASSIGN" ? "assign" : action === "START_REVIEW" ? "review" : "reject";
  if (!await requirePermission(req, res, `${base}.${permissionAction}`, permissionAction)) return;
  const model: any = type === "FACE" ? FaceVerificationRequest : KycVerificationRequest;
  const statusKey = type === "FACE" ? "status" : "overallStatus";
  const current: any = await model.findOne({ requestId: req.params.requestId });
  if (!current) return sendResponse(res, 404, false, "Verification request not found");
  const oldStatus = current[statusKey];
  if (current.assignedAdminId && String(current.assignedAdminId) !== String(req.user!.id) &&
      !["owner", "superAdmin"].includes(req.user!.role)) {
    return sendResponse(res, 403, false, "This request is assigned to another admin");
  }
  const updates: any = {};
  if (action === "START_REVIEW") {
    if (!canVerificationTransition(oldStatus, "UNDER_REVIEW")) return sendResponse(res, 409, false, "Only pending requests can start review");
    updates[statusKey] = "UNDER_REVIEW"; updates.reviewStartedAt = new Date();
    updates.assignedAdminId = current.assignedAdminId || req.user!.id;
  } else if (action === "APPROVE") {
    if (!canVerificationTransition(oldStatus, "APPROVED")) return sendResponse(res, 409, false, "Start review before approval");
    if (type === "KYC") {
      const documentStatus = req.body.documentStatus || current.documentStatus;
      const faceStatus = req.body.faceStatus || current.faceStatus;
      const bankStatus = req.body.bankStatus || current.bankStatus;
      if (documentStatus !== "VALID" || faceStatus !== "MATCHED_MANUALLY" ||
        !["VERIFIED", "NOT_REQUIRED"].includes(bankStatus)) {
        return sendResponse(res, 409, false, "All required KYC sections must be manually approved");
      }
      updates.documentStatus = documentStatus; updates.faceStatus = faceStatus; updates.bankStatus = bankStatus;
    }
    updates[statusKey] = "APPROVED"; updates.approvedAt = new Date(); updates.reviewedAt = new Date(); updates.reviewedBy = req.user!.id;
  } else if (action === "REJECT") {
    if (!canVerificationTransition(oldStatus, "REJECTED")) return sendResponse(res, 409, false, "Only under-review requests can be rejected");
    if (!String(req.body.reason || "").trim()) return sendResponse(res, 400, false, "Rejection reason is required");
    updates[statusKey] = "REJECTED"; updates.rejectionReasonCode = req.body.reasonCode || "OTHER";
    updates.rejectionReasonText = String(req.body.reason).trim(); updates.rejectedAt = new Date(); updates.reviewedAt = new Date(); updates.reviewedBy = req.user!.id;
  } else if (action === "RESUBMIT") {
    if (!canVerificationTransition(oldStatus, "RESUBMISSION_REQUIRED")) return sendResponse(res, 409, false, "Only under-review requests can request resubmission");
    const fields = Array.isArray(req.body.fields) ? req.body.fields.filter((field: string) => allowedResubmissionFields.has(field)) : [];
    if (!fields.length || !String(req.body.instructions || "").trim()) return sendResponse(res, 400, false, "Requested fields and instructions are required");
    updates[statusKey] = "RESUBMISSION_REQUIRED"; updates.requestedResubmissionFields = fields;
    updates.resubmissionInstructions = String(req.body.instructions).trim(); updates.userVisibleMessage = req.body.userVisibleMessage;
  } else if (action === "ASSIGN") {
    if (!mongoose.isValidObjectId(req.body.adminId)) return sendResponse(res, 400, false, "Valid adminId is required");
    updates.assignedAdminId = req.body.adminId;
  }
  const record: any = await model.findOneAndUpdate(
    { _id: current._id, [statusKey]: oldStatus }, { $set: updates }, { new: true }
  );
  if (!record) return sendResponse(res, 409, false, "Request changed; refresh and try again");
  if (["APPROVE", "REJECT", "RESUBMIT"].includes(action)) {
    const summary = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "PENDING";
    await User.findByIdAndUpdate(record.userId, {
      [type === "FACE" ? "faceVerificationStatus" : "kycVerificationStatus"]: summary,
      ...(action === "APPROVE" ? { [type === "FACE" ? "faceVerifiedAt" : "kycVerifiedAt"]: new Date() } : {}),
    });
  }
  await audit(req, type, record, action, oldStatus, req.body.note || req.body.reason || req.body.instructions, { fields: req.body.fields });
  const messages: any = {
    START_REVIEW: `Your ${type === "FACE" ? "face verification" : "KYC"} review has started.`,
    APPROVE: `Your ${type === "FACE" ? "face verification" : "KYC"} has been approved.`,
    REJECT: `Your ${type === "FACE" ? "face verification" : "KYC"} was rejected. ${updates.rejectionReasonText || ""}`,
    RESUBMIT: `Your ${type === "FACE" ? "face verification" : "KYC"} requires additional information.`,
  };
  if (messages[action]) await notify(String(record.userId), `${type} verification update`, messages[action], type, record.requestId);
  return sendResponse(res, 200, true, "Verification request updated", adminView(record));
};

export const startFaceReview = (req: AuthRequest, res: Response) => transition(req, res, "FACE", "START_REVIEW");
export const approveFace = (req: AuthRequest, res: Response) => transition(req, res, "FACE", "APPROVE");
export const rejectFace = (req: AuthRequest, res: Response) => transition(req, res, "FACE", "REJECT");
export const requestFaceResubmission = (req: AuthRequest, res: Response) => transition(req, res, "FACE", "RESUBMIT");
export const assignFace = (req: AuthRequest, res: Response) => transition(req, res, "FACE", "ASSIGN");
export const startKycReview = (req: AuthRequest, res: Response) => transition(req, res, "KYC", "START_REVIEW");
export const approveKyc = (req: AuthRequest, res: Response) => transition(req, res, "KYC", "APPROVE");
export const rejectKyc = (req: AuthRequest, res: Response) => transition(req, res, "KYC", "REJECT");
export const requestKycResubmission = (req: AuthRequest, res: Response) => transition(req, res, "KYC", "RESUBMIT");
export const assignKyc = (req: AuthRequest, res: Response) => transition(req, res, "KYC", "ASSIGN");

export const updateKycSectionStatus = async (req: AuthRequest, res: Response) => {
  if (!await requirePermission(req, res, "verification.kyc.review", "review")) return;
  const allowed: any = {
    documentStatus: ["PENDING", "VALID", "INVALID", "UNCLEAR", "EXPIRED"],
    faceStatus: ["PENDING", "MATCHED_MANUALLY", "NOT_MATCHED", "UNCLEAR"],
    bankStatus: ["NOT_REQUIRED", "PENDING", "VERIFIED", "REJECTED"],
  };
  const updates: any = {};
  Object.keys(allowed).forEach(key => { if (allowed[key].includes(req.body[key])) updates[key] = req.body[key]; });
  if (!Object.keys(updates).length) return sendResponse(res, 400, false, "No valid section status supplied");
  const record = await KycVerificationRequest.findOneAndUpdate({ requestId: req.params.requestId, overallStatus: "UNDER_REVIEW" }, updates, { new: true });
  if (!record) return sendResponse(res, 409, false, "KYC must be under review");
  await audit(req, "KYC", record, "SECTION_STATUS_UPDATED", "UNDER_REVIEW", req.body.note, updates);
  return sendResponse(res, 200, true, "KYC section statuses updated", adminView(record));
};

const addNote = async (req: AuthRequest, res: Response, type: "FACE" | "KYC") => {
  if (!await requirePermission(req, res, type === "FACE" ? "verification.face.review" : "verification.kyc.review", "review")) return;
  const note = String(req.body.note || "").trim();
  if (!note) return sendResponse(res, 400, false, "Note is required");
  const model: any = type === "FACE" ? FaceVerificationRequest : KycVerificationRequest;
  const record = await model.findOneAndUpdate({ requestId: req.params.requestId }, {
    $push: { internalNotes: { note, adminId: req.user!.id, createdAt: new Date() } },
  }, { new: true });
  if (!record) return sendResponse(res, 404, false, "Verification request not found");
  await audit(req, type, record, "INTERNAL_NOTE_ADDED", undefined, note);
  return sendResponse(res, 200, true, "Internal note added");
};
export const addFaceNote = (req: AuthRequest, res: Response) => addNote(req, res, "FACE");
export const addKycNote = (req: AuthRequest, res: Response) => addNote(req, res, "KYC");

export const revealKycSensitiveData = async (req: AuthRequest, res: Response) => {
  if (!await requirePermission(req, res, "verification.sensitive_data.view", "view")) return;
  const record: any = await KycVerificationRequest.findOne({ requestId: req.params.requestId });
  if (!record) return sendResponse(res, 404, false, "KYC request not found");
  const data: any = {};
  if (req.query.field === "document") data.documentNumber = decryptSensitive(record.document.encryptedDocumentNumber);
  else if (req.query.field === "bank" && record.bankDetails?.encryptedAccountNumber) data.accountNumber = decryptSensitive(record.bankDetails.encryptedAccountNumber);
  else return sendResponse(res, 400, false, "Invalid sensitive field");
  await audit(req, "KYC", record, "SENSITIVE_DATA_VIEWED", undefined, undefined, { field: req.query.field });
  return sendResponse(res, 200, true, "Sensitive data revealed", data);
};

export const serveVerificationFile = async (req: AuthRequest, res: Response) => {
  if (!await requirePermission(req, res, "verification.document.download", "view")) return;
  try {
    const key = sanitizeStorageKey(req.params.storageKey);
    const absolute = path.resolve(VERIFICATION_STORAGE_ROOT, key);
    if (!absolute.startsWith(VERIFICATION_STORAGE_ROOT) || !fs.existsSync(absolute)) return sendResponse(res, 404, false, "File not found");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `${req.query.download === "true" ? "attachment" : "inline"}; filename="verification-image"`);
    return res.sendFile(absolute);
  } catch {
    return sendResponse(res, 400, false, "Invalid file request");
  }
};

export const getVerificationSummary = async (req: AuthRequest, res: Response) => {
  if (!await requirePermission(req, res, "verification.reports.view", "view")) return;
  const [face, kyc] = await Promise.all([
    FaceVerificationRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, avgReviewMs: { $avg: { $subtract: ["$reviewedAt", "$submittedAt"] } } } }]),
    KycVerificationRequest.aggregate([{ $group: { _id: "$overallStatus", count: { $sum: 1 }, avgReviewMs: { $avg: { $subtract: ["$reviewedAt", "$submittedAt"] } } } }]),
  ]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const submittedToday = await Promise.all([
    FaceVerificationRequest.countDocuments({ createdAt: { $gte: today } }),
    KycVerificationRequest.countDocuments({ createdAt: { $gte: today } }),
  ]);
  return sendResponse(res, 200, true, "Verification report summary", { face, kyc, submittedToday: submittedToday[0] + submittedToday[1] });
};
export const getVerificationTrends = async (req: AuthRequest, res: Response) => {
  if (!await requirePermission(req, res, "verification.reports.view", "view")) return;
  const since = new Date(Date.now() - 30 * 86400000);
  const pipeline: any[] = [{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }];
  const [face, kyc] = await Promise.all([FaceVerificationRequest.aggregate(pipeline), KycVerificationRequest.aggregate(pipeline)]);
  return sendResponse(res, 200, true, "Verification trends", { face, kyc });
};
export const getAdminPerformance = async (req: AuthRequest, res: Response) => {
  if (!await requirePermission(req, res, "verification.reports.view", "view")) return;
  const rows = await VerificationAuditLog.aggregate([
    { $match: { action: { $in: ["APPROVE", "REJECT"] } } },
    { $group: { _id: "$performedBy", reviewed: { $sum: 1 }, approvals: { $sum: { $cond: [{ $eq: ["$action", "APPROVE"] }, 1, 0] } } } },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "admin" } },
    { $unwind: { path: "$admin", preserveNullAndEmptyArrays: true } },
    { $project: { reviewed: 1, approvals: 1, name: "$admin.name", role: "$admin.role" } },
  ]);
  return sendResponse(res, 200, true, "Admin performance", rows);
};

export const exportVerificationReport = async (req: AuthRequest, res: Response) => {
  if (!await requirePermission(req, res, "verification.reports.export", "view")) return;
  const type = req.query.type === "face" ? "FACE" : "KYC";
  const model: any = type === "FACE" ? FaceVerificationRequest : KycVerificationRequest;
  const statusKey = type === "FACE" ? "status" : "overallStatus";
  const rows = await model.find({}).select(`requestId purpose ${statusKey} priority submittedAt reviewedAt`).sort({ submittedAt: -1 }).limit(10000).lean();
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [
    ["Request ID", "Type", "Purpose", "Status", "Priority", "Submitted At", "Reviewed At"].map(escape).join(","),
    ...rows.map((row: any) => [row.requestId, type, row.purpose, row[statusKey], row.priority, row.submittedAt, row.reviewedAt].map(escape).join(",")),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="verification-${type.toLowerCase()}-report.csv"`);
  return res.status(200).send(csv);
};

export const getVerificationSettings = async (req: AuthRequest, res: Response) => {
  if (!await requirePermission(req, res, "verification.settings.manage", "view")) return;
  return sendResponse(res, 200, true, "Verification settings", await getSettings());
};
export const updateVerificationSettings = async (req: AuthRequest, res: Response) => {
  if (!await requirePermission(req, res, "verification.settings.manage", "review")) return;
  const allowed = [
    "faceVerificationEnabled", "kycVerificationEnabled", "rolesRequiringFaceVerification",
    "rolesRequiringKycVerification", "faceImageMaximumSizeMb", "allowedImageFormats",
    "maximumSubmissionAttempts", "resubmissionAllowed", "verificationExpiryDays",
    "bankDetailsRequiredForWithdrawal", "manualReviewRequired", "notificationsEnabled",
    "autoAssignmentEnabled",
  ];
  const updates: any = { updatedBy: req.user!.id, automaticApprovalEnabled: false };
  allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
  const settings = await VerificationSettings.findOneAndUpdate({ singletonKey: "default" }, { $set: updates }, { upsert: true, new: true });
  return sendResponse(res, 200, true, "Verification settings updated", settings);
};
