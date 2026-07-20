import mongoose, { Schema, Document } from 'mongoose';

export enum RequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export interface IRequest extends Document {
  userId?: number; // Applicant userId if they exist (or will be generated upon approval)
  requestType: string; // E.g., 'Agency Request', 'Admin Request', 'Super Admin Request', 'Operator Request', 'Seller Request', 'Support Request', 'Host Request', 'KYC Request', 'Withdrawal Request'
  data: Record<string, any>; // Dynamic payloads like name, email, phone, documents, bank details, withdrawal amounts
  status: RequestStatus;
  workflowSteps: string[]; // Copy of workflow steps at creation time
  currentStepIndex: number; // Current active role index in workflowSteps
  appliedDate: Date;
  approvedDate?: Date;
  rejectedDate?: Date;
  passwordBeforeApproval?: string; // Hashed or clear-text password that can be edited by owner/approver before final approval
  approvedBy?: Array<{
    userId: mongoose.Types.ObjectId;
    role: string;
    date: Date;
    comments?: string;
  }>;
  rejectedBy?: {
    userId: mongoose.Types.ObjectId;
    role: string;
    date: Date;
    reason: string;
  };
  createdBy: mongoose.Types.ObjectId | string; // Person who initiated (could be a referrer or applicant)
  createdByRole?: string;
  createdAt: Date;
  updatedAt: Date;
}

const requestSchema = new Schema<IRequest>(
  {
    userId: { type: Number },
    requestType: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: Object.values(RequestStatus),
      default: RequestStatus.PENDING,
    },
    workflowSteps: { type: [String], default: [] },
    currentStepIndex: { type: Number, default: 0 },
    appliedDate: { type: Date, default: Date.now },
    approvedDate: { type: Date },
    rejectedDate: { type: Date },
    passwordBeforeApproval: { type: String },
    approvedBy: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        role: { type: String },
        date: { type: Date, default: Date.now },
        comments: { type: String },
      },
    ],
    rejectedBy: {
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      role: { type: String },
      date: { type: Date },
      reason: { type: String },
    },
    createdBy: { type: Schema.Types.Mixed }, // User ID or email or 'self'
    createdByRole: { type: String },
  },
  { timestamps: true }
);

requestSchema.index({ status: 1 });
requestSchema.index({ requestType: 1 });

export const Request = mongoose.model<IRequest>('Request', requestSchema);
