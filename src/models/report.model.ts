import mongoose, { Schema, Document } from 'mongoose';

export interface IReport extends Document {
  reportId: string;
  reporterId: Schema.Types.ObjectId;
  reportedUserId: Schema.Types.ObjectId;
  reportedType: 'user' | 'host' | 'content';
  reason: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  createdAt: Date;
  updatedAt: Date;
  resolvedBy?: Schema.Types.ObjectId;
  resolvedAt?: Date;
  actionTaken?: string;
}

const reportSchema = new Schema<IReport>(
  {
    reportId: { type: String, required: true, unique: true },
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reportedUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reportedType: {
      type: String,
      enum: ['user', 'host', 'content'],
      default: 'user',
    },
    reason: { type: String, required: true },
    description: { type: String, required: true },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['pending', 'reviewing', 'resolved', 'dismissed'],
      default: 'pending',
    },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    actionTaken: { type: String },
  },
  { timestamps: true }
);

// Indexes for performance
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporterId: 1 });
reportSchema.index({ reportedUserId: 1 });
reportSchema.index({ severity: 1, status: 1 });

export const Report = mongoose.model<IReport>('Report', reportSchema);
