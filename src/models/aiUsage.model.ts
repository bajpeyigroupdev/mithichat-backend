import mongoose, { Schema } from 'mongoose';

const AIUsageSchema = new Schema({
  provider: { type: String, required: true, index: true },
  model: { type: String, required: true, index: true },
  feature: { type: String, required: true, index: true },
  entityType: String,
  entityId: Schema.Types.ObjectId,
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  audioSeconds: { type: Number, default: 0 },
  estimatedCostUsd: { type: Number, default: 0 },
  status: { type: String, enum: ['succeeded', 'failed'], required: true },
  errorCode: String,
}, { timestamps: { createdAt: true, updatedAt: false } });

AIUsageSchema.index({ createdAt: -1, feature: 1 });
export const AIUsage = mongoose.model('AIUsage', AIUsageSchema);
