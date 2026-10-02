import mongoose, { Schema } from 'mongoose';

const InboundWebhookEventSchema = new Schema({
  provider: { type: String, required: true },
  eventId: { type: String, required: true },
  eventType: String,
  receivedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 86400000) },
}, { timestamps: false });

InboundWebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
InboundWebhookEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const InboundWebhookEvent = mongoose.model('InboundWebhookEvent', InboundWebhookEventSchema);
