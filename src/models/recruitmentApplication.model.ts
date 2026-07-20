import mongoose, { Schema, Document } from 'mongoose';

export type RecruitmentRole = 'agency' | 'operator' | 'admin' | 'customer-service' | 'super-admin';
export type ApplicationStatus =
    | 'draft'
    | 'submitted'
    | 'pending'
    | 'under_review'
    | 'assigned'
    | 'interview_scheduled'
    | 'interview_completed'
    | 'document_verification'
    | 'background_verification'
    | 'approved'
    | 'rejected'
    | 'hold'
    | 'joined'
    | 'cancelled';

export interface IDocumentItem {
    name: string;
    documentType: string;
    url: string;
}

export interface IReviewNote {
    authorName: string;
    authorId?: mongoose.Types.ObjectId;
    text: string;
    statusChange?: ApplicationStatus;
    timestamp: Date;
}

export interface IRecruitmentApplication extends Document {
    applicationId: string;
    role: RecruitmentRole;
    status: ApplicationStatus;
    applicant: {
        name: string;
        email: string;
        phone: string;
        gender?: string;
        country?: string;
        city?: string;
        address?: string;
        experienceYears?: string;
    };
    roleData: Record<string, any>;
    documents: IDocumentItem[];
    referrer?: {
        code: string;
        referrerId?: mongoose.Types.ObjectId;
        referrerRole?: string;
        referrerName?: string;
    };
    reviewNotes: IReviewNote[];
    createdAt: Date;
    updatedAt: Date;
}

const RecruitmentApplicationSchema = new Schema<IRecruitmentApplication>({
    applicationId: { type: String, required: true, unique: true, index: true },
    role: {
        type: String,
        required: true,
        enum: ['agency', 'operator', 'admin', 'customer-service', 'super-admin'],
        index: true
    },
    status: {
        type: String,
        required: true,
        enum: [
            'draft', 'submitted', 'pending', 'under_review', 'assigned',
            'interview_scheduled', 'interview_completed', 'document_verification',
            'background_verification', 'approved', 'rejected', 'hold', 'joined', 'cancelled'
        ],
        default: 'pending',
        index: true
    },
    applicant: {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, trim: true, lowercase: true, index: true },
        phone: { type: String, required: true, trim: true, index: true },
        gender: { type: String, default: 'other' },
        country: { type: String, default: 'India' },
        city: { type: String, default: '' },
        address: { type: String, default: '' },
        experienceYears: { type: String, default: '' }
    },
    roleData: { type: Schema.Types.Mixed, default: {} },
    documents: [{
        name: { type: String, required: true },
        documentType: { type: String, required: true },
        url: { type: String, required: true }
    }],
    referrer: {
        code: { type: String, default: '' },
        referrerId: { type: Schema.Types.ObjectId, ref: 'User' },
        referrerRole: { type: String, default: '' },
        referrerName: { type: String, default: '' }
    },
    reviewNotes: [{
        authorName: { type: String, required: true },
        authorId: { type: Schema.Types.ObjectId, ref: 'User' },
        text: { type: String, required: true },
        statusChange: { type: String },
        timestamp: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

RecruitmentApplicationSchema.index({ role: 1, status: 1 });
RecruitmentApplicationSchema.index({ createdAt: -1 });

export const RecruitmentApplication = mongoose.model<IRecruitmentApplication>('RecruitmentApplication', RecruitmentApplicationSchema);
