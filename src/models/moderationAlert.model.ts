import mongoose, { Schema } from 'mongoose';

const ModerationAlertSchema = new Schema({
  sourceType: { type: String, enum: ['recording', 'call', 'user', 'transaction', 'chat'], required: true, index: true },
  sourceId: { type: Schema.Types.ObjectId, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  hostId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  callId: { type: Schema.Types.ObjectId, ref: 'CoinsTransaction', index: true },
  recordingId: { type: Schema.Types.ObjectId, ref: 'CallRecording', index: true },
  category: { type: String, required: true, index: true },
  confidence: { type: Number, required: true, min: 0, max: 1 },
  riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true, index: true },
  explanation: { type: String, required: true },
  evidence: { type: Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['unreviewed', 'reviewed', 'dismissed', 'escalated'], default: 'unreviewed', index: true },
  reviewerId: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewNotes: String,
  reviewedAt: Date,
}, { timestamps: true });

ModerationAlertSchema.index({ status: 1, riskLevel: 1, createdAt: -1 });
ModerationAlertSchema.index({ sourceType: 1, sourceId: 1, category: 1 }, { unique: true });
export const ModerationAlert = mongoose.model('ModerationAlert', ModerationAlertSchema);
