import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkflow extends Document {
  requestType: string; // E.g., 'Agency Registration', 'Withdrawal Request', 'KYC Request', 'Admin Request', etc.
  steps: string[]; // E.g., ['admin', 'superAdmin', 'operator', 'owner'] - ordered array of roles
  autoApprove: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const workflowSchema = new Schema<IWorkflow>(
  {
    requestType: { type: String, required: true, unique: true },
    steps: { type: [String], default: [] },
    autoApprove: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Workflow = mongoose.model<IWorkflow>('Workflow', workflowSchema);
