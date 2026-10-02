import mongoose, { Document, Schema, Types } from 'mongoose';

export type RecordingStatus = 'awaiting_consent' | 'starting' | 'recording' | 'stopping' | 'completed' | 'failed' | 'expired' | 'deleted';
export type ProcessingStatus = 'not_started' | 'queued' | 'processing' | 'completed' | 'failed' | 'not_configured';
export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface ICallRecording extends Document {
  recordingId: string;
  callId: Types.ObjectId;
  callerId: Types.ObjectId;
  hostId: Types.ObjectId;
  roomId?: Types.ObjectId;
  callType: 'voice' | 'video' | 'room';
  startedAt?: Date;
  endedAt?: Date;
  durationSeconds: number;
  status: RecordingStatus;
  consent: {
    caller: { granted: boolean; grantedAt?: Date; policyVersion?: string };
    host: { granted: boolean; grantedAt?: Date; policyVersion?: string };
  };
  provider: string;
  providerState?: Record<string, unknown>;
  storage?: {
    provider: string;
    bucket: string;
    key: string;
    region?: string;
    format?: string;
    sizeBytes?: number;
    checksum?: string;
  };
  processingStatus: ProcessingStatus;
  transcriptionStatus: ProcessingStatus;
  analysisStatus: ProcessingStatus;
  transcript?: {
    language?: string;
    confidence?: number;
    provider?: string;
    model?: string;
    text?: string;
    segments?: Array<{ start: number; end: number; speaker?: string; text: string; confidence?: number }>;
  };
  analysis?: {
    summary?: string;
    topics?: string[];
    sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
    detections?: Array<{ category: string; confidence: number; explanation: string; start?: number; end?: number }>;
    provider?: string;
    model?: string;
  };
  riskLevel: RiskLevel;
  riskScore: number;
  flags: string[];
  internalNotes: Array<{ adminId: Types.ObjectId; note: string; createdAt: Date }>;
  reviewStatus: 'unreviewed' | 'in_review' | 'reviewed' | 'escalated' | 'dismissed';
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  retentionDeleteAt?: Date;
  deletedAt?: Date;
  deletionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const processingStates = ['not_started', 'queued', 'processing', 'completed', 'failed', 'not_configured'];

const CallRecordingSchema = new Schema<ICallRecording>({
  recordingId: { type: String, required: true, unique: true, index: true },
  callId: { type: Schema.Types.ObjectId, ref: 'CoinsTransaction', required: true, unique: true },
  callerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  roomId: { type: Schema.Types.ObjectId, ref: 'Room', index: true },
  callType: { type: String, enum: ['voice', 'video', 'room'], required: true, index: true },
  startedAt: Date,
  endedAt: Date,
  durationSeconds: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['awaiting_consent', 'starting', 'recording', 'stopping', 'completed', 'failed', 'expired', 'deleted'],
    default: 'awaiting_consent',
    index: true,
  },
  consent: {
    caller: { granted: { type: Boolean, default: false }, grantedAt: Date, policyVersion: String },
    host: { granted: { type: Boolean, default: false }, grantedAt: Date, policyVersion: String },
  },
  provider: { type: String, default: 'agora' },
  providerState: { type: Schema.Types.Mixed, select: false },
  storage: {
    provider: String,
    bucket: String,
    key: String,
    region: String,
    format: String,
    sizeBytes: Number,
    checksum: String,
  },
  processingStatus: { type: String, enum: processingStates, default: 'not_started', index: true },
  transcriptionStatus: { type: String, enum: processingStates, default: 'not_started', index: true },
  analysisStatus: { type: String, enum: processingStates, default: 'not_started', index: true },
  transcript: {
    language: String,
    confidence: Number,
    provider: String,
    model: String,
    text: String,
    segments: [{ start: Number, end: Number, speaker: String, text: String, confidence: Number, _id: false }],
  },
  analysis: {
    summary: String,
    topics: [String],
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative', 'mixed'] },
    detections: [{ category: String, confidence: Number, explanation: String, start: Number, end: Number, _id: false }],
    provider: String,
    model: String,
  },
  riskLevel: { type: String, enum: ['none', 'low', 'medium', 'high', 'critical'], default: 'none', index: true },
  riskScore: { type: Number, default: 0, min: 0, max: 100 },
  flags: [{ type: String }],
  internalNotes: [{ adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, note: { type: String, required: true }, createdAt: { type: Date, default: Date.now }, _id: false }],
  reviewStatus: { type: String, enum: ['unreviewed', 'in_review', 'reviewed', 'escalated', 'dismissed'], default: 'unreviewed', index: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  retentionDeleteAt: { type: Date, index: true },
  deletedAt: Date,
  deletionReason: String,
}, { timestamps: true, minimize: false });

CallRecordingSchema.index({ createdAt: -1, status: 1 });
CallRecordingSchema.index({ callerId: 1, createdAt: -1 });
CallRecordingSchema.index({ hostId: 1, createdAt: -1 });
CallRecordingSchema.index({ riskLevel: 1, reviewStatus: 1, createdAt: -1 });
CallRecordingSchema.index({ 'analysis.topics': 1, createdAt: -1 });
CallRecordingSchema.index({ 'transcript.text': 'text' }, { name: 'recording_transcript_text' });

export const CallRecording = mongoose.model<ICallRecording>('CallRecording', CallRecordingSchema);
