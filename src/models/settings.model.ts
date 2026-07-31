import mongoose, { Schema, Document } from 'mongoose';

export interface ISettings extends Document {
    commissionRate: number;
    giftCommissionPercent: number;
    withdrawalPlatformFeePercent: number;
    coinPrice: number;
    minPayout: number;
    maintenanceMode: boolean;
    emailAlerts: boolean;
    userNotifications: boolean;
    systemDigest: boolean;
    callRatePerMinute: number;
    hostSharePerMinute: number;
    chatMessageCost: number;
    chatMessageLimit: number;
    agoraAppId: string;
    agoraCertificateEncrypted: string;
    privacyPolicy: string;
    termsAndConditions: string;
}

const SettingsSchema = new Schema<ISettings>({
    commissionRate: { type: Number, default: 20, min: 0, max: 100 },
    giftCommissionPercent: { type: Number, default: 20, min: 0, max: 100 },
    withdrawalPlatformFeePercent: { type: Number, default: 5, min: 0, max: 100 },
    coinPrice: { type: Number, default: 0.10, min: 0 },
    minPayout: { type: Number, default: 50, min: 0 },
    maintenanceMode: { type: Boolean, default: false },
    emailAlerts: { type: Boolean, default: true },
    userNotifications: { type: Boolean, default: true },
    systemDigest: { type: Boolean, default: true },
    callRatePerMinute: { type: Number, default: 100, min: 1 },
    hostSharePerMinute: { type: Number, default: 28, min: 0 },
    chatMessageCost: { type: Number, default: 10, min: 0 },
    chatMessageLimit: { type: Number, default: 50, min: 1, max: 5000 },
    agoraAppId: { type: String, default: '', trim: true },
    agoraCertificateEncrypted: { type: String, default: '', select: false },
    privacyPolicy: {
        type: String,
        default: "<h1>Privacy Policy</h1><br><p>This policy outlines how the MithiChat app collects, uses, and protects your information, including Camera, Microphone, and Photo Library data.</p>"
    },
    termsAndConditions: { type: String, default: "<h1>Terms & Conditions</h1><p>Welcome to MithiChat app...</p>" },
}, { timestamps: true });

export const Settings = mongoose.model<ISettings>('Settings', SettingsSchema);
