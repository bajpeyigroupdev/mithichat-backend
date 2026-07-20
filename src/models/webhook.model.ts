import mongoose, { Schema, Document } from 'mongoose';

export interface IWebhook extends Document {
    name: string;
    targetUrl: string;
    secretKey: string;
    events: string[]; // E.g., ['recruitment.approved', 'employee.joined', 'host.verified']
    isActive: boolean;
    createdAt: Date;
}

const WebhookSchema = new Schema<IWebhook>({
    name: { type: String, required: true },
    targetUrl: { type: String, required: true },
    secretKey: { type: String, required: true },
    events: [{ type: String, required: true }],
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const Webhook = mongoose.model<IWebhook>('Webhook', WebhookSchema);
