import mongoose, { Schema, Document } from 'mongoose';

export enum RequestStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  READY_FOR_INTERVIEW = 'ready_for_interview',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export interface ITimelineEntry {
  action: string;
  actor: string;
  actorRole: string;
  date: Date;
  remarks?: string;
}

export interface IRequest extends Document {
  userId?: number;
  requestType: string;
  role: string;
  data: Record<string, any>;
  status: RequestStatus;
  workflowSteps: string[];
  currentStepIndex: number;
  appliedDate: Date;
  approvedDate?: Date;
  rejectedDate?: Date;
  passwordBeforeApproval?: string;
  roleCode?: string;
  generatedUserId?: number;
  mustChangePassword: boolean;
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
  timeline: ITimelineEntry[];
  createdBy: mongoose.Types.ObjectId | string;
  createdByRole?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TimelineEntrySchema = new Schema<ITimelineEntry>(
  {
    action: { type: String, required: true },
    actor: { type: String, required: true },
    actorRole: { type: String, default: 'system' },
    date: { type: Date, default: Date.now },
    remarks: { type: String },
  },
  { _id: false }
);

const requestSchema = new Schema<IRequest>(
  {
    userId: { type: Number },
    requestType: { type: String, required: true },
    role: { type: String, default: '' },
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
    roleCode: { type: String },
    generatedUserId: { type: Number },
    mustChangePassword: { type: Boolean, default: true },
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
    timeline: { type: [TimelineEntrySchema], default: [] },
    createdBy: { type: Schema.Types.Mixed },
    createdByRole: { type: String },
  },
  { timestamps: true }
);

requestSchema.index({ status: 1 });
requestSchema.index({ requestType: 1 });
requestSchema.index({ role: 1 });
requestSchema.index({ createdAt: -1 });
requestSchema.index({ 'data.email': 1 });
requestSchema.index({ 'data.name': 1 });

export const Request = mongoose.model<IRequest>('Request', requestSchema);
