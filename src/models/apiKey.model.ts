import mongoose, { Schema, Document } from 'mongoose';

export interface IApiKey extends Document {
    keyName: string;
    apiKey: string;
    secretHash: string;
    allowedScopes: string[];
    rateLimitPerMin: number;
    isActive: boolean;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
}

const ApiKeySchema = new Schema<IApiKey>({
    keyName: { type: String, required: true },
    apiKey: { type: String, required: true, unique: true, index: true },
    secretHash: { type: String, required: true },
    allowedScopes: [{ type: String }],
    rateLimitPerMin: { type: Number, default: 60 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

export const ApiKey = mongoose.model<IApiKey>('ApiKey', ApiKeySchema);
