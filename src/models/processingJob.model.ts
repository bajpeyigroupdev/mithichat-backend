import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IProcessingJob extends Document {
  type: 'recording_start' | 'recording_finalize' | 'transcription' | 'ai_analysis' | 'retention_cleanup';
  entityType: 'recording' | 'system';
  entityId?: Types.ObjectId;
  fingerprint: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'dead_letter';
  attempts: number;
  maxAttempts: number;
  nextRunAt: Date;
  lockedAt?: Date;
  lockedBy?: string;
  lastError?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProcessingJobSchema = new Schema<IProcessingJob>({
  type: { type: String, enum: ['recording_start', 'recording_finalize', 'transcription', 'ai_analysis', 'retention_cleanup'], required: true, index: true },
  entityType: { type: String, enum: ['recording', 'system'], required: true },
  entityId: { type: Schema.Types.ObjectId, index: true },
  fingerprint: { type: String, required: true, unique: true },
  payload: { type: Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['queued', 'processing', 'completed', 'failed', 'dead_letter'], default: 'queued', index: true },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 5 },
  nextRunAt: { type: Date, default: Date.now, index: true },
  lockedAt: Date,
  lockedBy: String,
  lastError: String,
  completedAt: Date,
}, { timestamps: true });

ProcessingJobSchema.index({ status: 1, nextRunAt: 1, createdAt: 1 });
export const ProcessingJob = mongoose.model<IProcessingJob>('ProcessingJob', ProcessingJobSchema);
