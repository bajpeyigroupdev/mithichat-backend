import mongoose, { Schema, Document } from 'mongoose';

export interface ISettings extends Document {
    commissionRate: number;
    coinPrice: number;
    minPayout: number;
    maintenanceMode: boolean;
    emailAlerts: boolean;
    userNotifications: boolean;
    systemDigest: boolean;
    callRatePerMinute: number;
    hostSharePerMinute: number;
    chatMessageCost: number;
    privacyPolicy: string;
    termsAndConditions: string;
}

const SettingsSchema = new Schema<ISettings>({
    commissionRate: { type: Number, default: 20 },
    coinPrice: { type: Number, default: 0.10 },
    minPayout: { type: Number, default: 50 },
    maintenanceMode: { type: Boolean, default: false },
    emailAlerts: { type: Boolean, default: true },
    userNotifications: { type: Boolean, default: true },
    systemDigest: { type: Boolean, default: true },
    callRatePerMinute: { type: Number, default: 100 },
    hostSharePerMinute: { type: Number, default: 28 },
    chatMessageCost: { type: Number, default: 10 },
    privacyPolicy: { 
        type: String, 
        default: "<h1>Privacy Policy</h1><br><p>This policy outlines how the  MithiChat  app collects, uses, and protects your information, including explicitly how we handle Camera, Microphone, and Photo Library data.</p><h3>Data Collection & Usage</h3><ul><li><strong>Camera & Microphone:</strong> We require camera and microphone access to enable real-time 1-on-1 video and audio calls with hosts. Your audio and video streams are securely transmitted and are only used for real-time communication. We do not store or record your video/audio streams.</li><li><strong>Photo Library / Storage:</strong> We require read access to your photo library to allow you to upload KYC documents for verification and select a profile avatar. No other photos are accessed.</li></ul><h3>Account Deletion & Data Retention</h3><p>We retain your personal data for as long as your account is active. You may request full deletion of your account and all associated personal data by contacting our support team or using the delete option inside the application. Upon request, all personally identifiable information, KYC documents, and logs will be expunged from our servers within 14 days.</p><h3>Contact Us</h3><p>For privacy queries, please reach out via our support portal.</p>" 
    },
    termsAndConditions: { type: String, default: "<h1>Terms & Conditions</h1><p>Welcome to MithiChat app...</p>" },
}, { timestamps: true });

export const Settings = mongoose.model<ISettings>('Settings', SettingsSchema);
