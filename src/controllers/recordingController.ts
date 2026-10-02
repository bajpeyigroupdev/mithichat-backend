import { createHmac, timingSafeEqual } from 'crypto';
import { Response } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { AuthRequest } from '../middlewares/authorize.middleware';
import { CallRecording } from '../models/callRecording.model';
import { AuditLog } from '../models/auditLog.model';
import { User } from '../models/user.model';
import { createRecordingPlaybackUrl, deleteRecordingObject } from '../services/recordingStorage.service';
import { enqueueJob } from '../services/recordingService';
import sendResponse from '../utils/reponse';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clientIp = (req: AuthRequest) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

async function audit(req: AuthRequest, action: string, target: string, details: string, oldValue?: unknown, newValue?: unknown, reason?: string) {
  if (!req.user?.id) return;
  await AuditLog.create({ adminId: req.user.id, action, target, ipAddress: clientIp(req), details, userAgent: req.headers['user-agent'], oldValue, newValue, reason });
}

async function resolveUser(identifier: unknown) {
  const value = String(identifier || '').trim();
  if (!value) return undefined;
  const conditions: any[] = [{ meethiId: value }, { userName: value }];
  if (isValidObjectId(value)) conditions.push({ _id: value });
  if (/^\d+$/.test(value)) conditions.push({ userId: Number(value) });
  return User.findOne({ $or: conditions }).select('_id').lean();
}

export async function listRecordings(req: AuthRequest, res: Response) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const query: any = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.callType) query.callType = req.query.callType;
    if (req.query.riskLevel) query.riskLevel = req.query.riskLevel;
    if (req.query.processingStatus) query.processingStatus = req.query.processingStatus;
    if (req.query.reviewStatus) query.reviewStatus = req.query.reviewStatus;
    if (req.query.callId && isValidObjectId(String(req.query.callId))) query.callId = req.query.callId;
    if (req.query.caller) { const user = await resolveUser(req.query.caller); query.callerId = user?._id || new Types.ObjectId(); }
    if (req.query.host) { const user = await resolveUser(req.query.host); query.hostId = user?._id || new Types.ObjectId(); }
    if (req.query.from || req.query.to) {
      query.createdAt = {};
      if (req.query.from) query.createdAt.$gte = new Date(String(req.query.from));
      if (req.query.to) query.createdAt.$lte = new Date(String(req.query.to));
    }
    if (req.query.minDuration || req.query.maxDuration) {
      query.durationSeconds = {};
      if (req.query.minDuration) query.durationSeconds.$gte = Math.max(0, Number(req.query.minDuration));
      if (req.query.maxDuration) query.durationSeconds.$lte = Math.max(0, Number(req.query.maxDuration));
    }
    if (req.query.search) {
      const search = String(req.query.search).trim();
      if (search.length > 100) return sendResponse(res, 400, false, 'Search is too long');
      query.$or = [
        { recordingId: new RegExp(escapeRegex(search), 'i') },
        { 'transcript.text': { $regex: escapeRegex(search), $options: 'i' } },
        { 'analysis.topics': { $regex: escapeRegex(search), $options: 'i' } },
      ];
    }
    const [items, total] = await Promise.all([
      CallRecording.find(query).select('-transcript.text -transcript.segments -analysis.detections -internalNotes').populate('callerId', 'name userName meethiId userId image').populate('hostId', 'name userName meethiId userId image').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      CallRecording.countDocuments(query),
    ]);
    return sendResponse(res, 200, true, 'Recordings fetched', { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) { return sendResponse(res, 500, false, error?.message || 'Failed to fetch recordings'); }
}

export async function getRecording(req: AuthRequest, res: Response) {
  const identifier = String(req.params.id);
  const query = isValidObjectId(identifier) ? { $or: [{ _id: identifier }, { recordingId: identifier }] } : { recordingId: identifier };
  const recording = await CallRecording.findOne(query).populate('callerId', 'name userName meethiId userId image').populate('hostId', 'name userName meethiId userId image').populate('internalNotes.adminId', 'name employeeCode').lean();
  if (!recording) return sendResponse(res, 404, false, 'Recording not found');
  await audit(req, 'RECORDING_METADATA_VIEW', recording.recordingId, 'Viewed recording metadata');
  return sendResponse(res, 200, true, 'Recording fetched', recording);
}

export async function getPlaybackUrl(req: AuthRequest, res: Response) {
  const recording = await CallRecording.findOne({ recordingId: req.params.id, status: 'completed' }).lean();
  if (!recording?.storage?.key) return sendResponse(res, 404, false, 'Playable recording is not available');
  const expiresIn = Math.min(600, Math.max(30, Number(req.query.expiresIn) || 300));
  const url = await createRecordingPlaybackUrl(recording.storage.key, expiresIn);
  await audit(req, 'RECORDING_PLAYBACK_ACCESS', recording.recordingId, `Issued temporary playback URL (${expiresIn}s)`);
  return sendResponse(res, 200, true, 'Temporary playback access granted', { url, expiresAt: new Date(Date.now() + expiresIn * 1000) });
}

export async function addRecordingNote(req: AuthRequest, res: Response) {
  const note = String(req.body?.note || '').trim();
  if (!note || note.length > 2000) return sendResponse(res, 400, false, 'A note between 1 and 2000 characters is required');
  const recording = await CallRecording.findOneAndUpdate({ recordingId: req.params.id }, { $push: { internalNotes: { adminId: req.user!.id, note, createdAt: new Date() } } }, { new: true });
  if (!recording) return sendResponse(res, 404, false, 'Recording not found');
  await audit(req, 'RECORDING_NOTE_ADD', recording.recordingId, 'Added internal recording note');
  return sendResponse(res, 200, true, 'Note added');
}

export async function reviewRecording(req: AuthRequest, res: Response) {
  const status = String(req.body?.status || 'reviewed');
  if (!['in_review', 'reviewed', 'escalated', 'dismissed'].includes(status)) return sendResponse(res, 400, false, 'Invalid review status');
  const recording = await CallRecording.findOneAndUpdate({ recordingId: req.params.id }, { $set: { reviewStatus: status, reviewedBy: req.user!.id, reviewedAt: new Date() } }, { new: true });
  if (!recording) return sendResponse(res, 404, false, 'Recording not found');
  await audit(req, 'RECORDING_REVIEW', recording.recordingId, `Review status set to ${status}`, undefined, { reviewStatus: status }, req.body?.reason);
  return sendResponse(res, 200, true, 'Review status updated', { reviewStatus: recording.reviewStatus });
}

export async function retryRecordingProcessing(req: AuthRequest, res: Response) {
  const recording = await CallRecording.findOne({ recordingId: req.params.id });
  if (!recording) return sendResponse(res, 404, false, 'Recording not found');
  const stage = String(req.body?.stage || 'transcription');
  if (!['transcription', 'ai_analysis'].includes(stage)) return sendResponse(res, 400, false, 'Invalid processing stage');
  if (stage === 'ai_analysis' && !recording.transcript?.text) return sendResponse(res, 409, false, 'Transcript is required before AI analysis');
  await enqueueJob(stage as any, recording._id, `${stage}:manual:${recording.id}:${Date.now()}`);
  await recording.updateOne({ $set: { [stage === 'transcription' ? 'transcriptionStatus' : 'analysisStatus']: 'queued' } });
  await audit(req, 'RECORDING_PROCESSING_RETRY', recording.recordingId, `Queued ${stage}`);
  return sendResponse(res, 202, true, 'Processing queued');
}

export async function deleteRecording(req: AuthRequest, res: Response) {
  const reason = String(req.body?.reason || '').trim();
  if (req.body?.confirm !== true || reason.length < 5) return sendResponse(res, 400, false, 'Explicit confirmation and a reason are required');
  const recording = await CallRecording.findOne({ recordingId: req.params.id }).select('+providerState');
  if (!recording) return sendResponse(res, 404, false, 'Recording not found');
  const before = { status: recording.status, storageKey: recording.storage?.key ? '[REDACTED]' : undefined, retentionDeleteAt: recording.retentionDeleteAt };
  if (recording.storage?.key) await deleteRecordingObject(recording.storage.key);
  recording.status = 'deleted'; recording.deletedAt = new Date(); recording.deletionReason = reason;
  recording.storage = undefined; recording.providerState = undefined; recording.transcript = undefined; recording.analysis = undefined;
  await recording.save();
  await audit(req, 'RECORDING_DELETE', recording.recordingId, 'Deleted recording media and sensitive derived data', before, { status: 'deleted' }, reason);
  return sendResponse(res, 200, true, 'Recording securely deleted');
}

export async function handleRecordingWebhook(req: AuthRequest, res: Response) {
  const secret = process.env.RECORDING_WEBHOOK_SECRET;
  const timestamp = String(req.headers['x-recording-timestamp'] || '');
  const signature = String(req.headers['x-recording-signature'] || '');
  if (!secret || !timestamp || !signature || Math.abs(Date.now() - Number(timestamp) * 1000) > 300000) return sendResponse(res, 401, false, 'Invalid webhook authentication');
  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!rawBody) return sendResponse(res, 400, false, 'Webhook body could not be verified');
  const expected = createHmac('sha256', secret).update(timestamp).update('.').update(rawBody).digest('hex');
  const valid = expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!valid) return sendResponse(res, 401, false, 'Invalid webhook signature');
  const eventId = String(req.body?.eventId || '');
  if (!eventId) return sendResponse(res, 400, false, 'eventId is required');
  const { InboundWebhookEvent } = await import('../models/inboundWebhookEvent.model');
  try {
    await InboundWebhookEvent.create({ provider: 'recording', eventId, eventType: String(req.body?.type || req.body?.status || '') });
  } catch (error: any) {
    if (error?.code === 11000) return sendResponse(res, 200, true, 'Webhook already processed');
    throw error;
  }
  const recording = await CallRecording.findOne({ recordingId: req.body?.recordingId });
  if (!recording) return sendResponse(res, 202, true, 'Unknown recording ignored');
  if (req.body?.storageKey && !recording.storage?.key) recording.storage = { provider: 's3-compatible', bucket: process.env.RECORDING_STORAGE_BUCKET || '', key: String(req.body.storageKey), region: process.env.RECORDING_STORAGE_REGION || 'ap-south-1' };
  if (req.body?.status === 'completed') { recording.status = 'completed'; recording.processingStatus = 'completed'; }
  if (req.body?.status === 'failed') recording.status = 'failed';
  await recording.save();
  return sendResponse(res, 202, true, 'Webhook accepted');
}
