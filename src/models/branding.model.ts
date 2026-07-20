import mongoose, { Schema, Document } from 'mongoose';

export interface IBranding extends Document {
    orgId?: mongoose.Types.ObjectId;
    companyName: string;
    logoUrl?: string;
    faviconUrl?: string;
    primaryColor?: string;
    accentColor?: string;
    customDomain?: string;
    emailHeaderLogoUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}

const BrandingSchema = new Schema<IBranding>({
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    companyName: { type: String, required: true, default: 'MeethiChat' },
    logoUrl: { type: String, default: '' },
    faviconUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '#4f46e5' },
    accentColor: { type: String, default: '#8b5cf6' },
    customDomain: { type: String, default: 'meethichat.live' },
    emailHeaderLogoUrl: { type: String, default: '' }
}, { timestamps: true });

export const Branding = mongoose.model<IBranding>('Branding', BrandingSchema);
