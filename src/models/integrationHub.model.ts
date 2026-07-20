import mongoose, { Schema, Document } from 'mongoose';

export type ThirdPartyService = 'google_workspace' | 'microsoft_365' | 'slack' | 'zoom' | 'teams';

export interface IIntegrationHub extends Document {
    serviceName: ThirdPartyService;
    displayName: string;
    isConnected: boolean;
    config: Record<string, any>;
    lastSyncedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const IntegrationHubSchema = new Schema<IIntegrationHub>({
    serviceName: {
        type: String,
        required: true,
        unique: true,
        enum: ['google_workspace', 'microsoft_365', 'slack', 'zoom', 'teams'],
        index: true
    },
    displayName: { type: String, required: true },
    isConnected: { type: Boolean, default: false },
    config: { type: Schema.Types.Mixed, default: {} },
    lastSyncedAt: { type: Date }
}, { timestamps: true });

export const IntegrationHub = mongoose.model<IIntegrationHub>('IntegrationHub', IntegrationHubSchema);
