import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkflowStep {
  stepIndex: number;
  roleRequired: string; // E.g., 'admin', 'superAdmin', 'operator', 'owner'
  title: string;
  autoApproveMinutes?: number;
}

export interface IWorkflow extends Document {
  requestType: string; // E.g., 'Recruitment Onboarding', 'Withdrawal Request', 'KYC Request', 'Finance Approval'
  category: 'recruitment' | 'finance' | 'host_kyc' | 'support' | 'system_settings';
  steps: IWorkflowStep[];
  autoApprove: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const workflowSchema = new Schema<IWorkflow>(
  {
    requestType: { type: String, required: true, unique: true },
    category: {
      type: String,
      required: true,
      enum: ['recruitment', 'finance', 'host_kyc', 'support', 'system_settings'],
      default: 'recruitment'
    },
    steps: [{
      stepIndex: { type: Number, required: true },
      roleRequired: { type: String, required: true },
      title: { type: String, required: true },
      autoApproveMinutes: { type: Number, default: 0 }
    }],
    autoApprove: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Workflow = mongoose.model<IWorkflow>('Workflow', workflowSchema);
