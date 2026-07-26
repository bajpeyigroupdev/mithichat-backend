import mongoose, { Schema, Document } from 'mongoose';

export interface ITransferHistory extends Document {
  targetUserId: mongoose.Types.ObjectId;
  transferType: 'Agency_Transfer' | 'Host_Transfer' | 'Operator_Transfer' | 'Admin_Transfer' | 'Role_Transfer';
  oldParentId?: mongoose.Types.ObjectId;
  oldParentRole?: string;
  newParentId?: mongoose.Types.ObjectId;
  newParentRole?: string;
  transferredBy?: mongoose.Types.ObjectId;
  transferDate: Date;
  reason?: string;
  status: 'Approved' | 'Pending' | 'Rejected';
}

const TransferHistorySchema = new Schema<ITransferHistory>(
  {
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    transferType: {
      type: String,
      enum: ['Agency_Transfer', 'Host_Transfer', 'Operator_Transfer', 'Admin_Transfer', 'Role_Transfer'],
      required: true
    },
    oldParentId: { type: Schema.Types.ObjectId, ref: 'User' },
    oldParentRole: { type: String, default: '' },
    newParentId: { type: Schema.Types.ObjectId, ref: 'User' },
    newParentRole: { type: String, default: '' },
    transferredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    transferDate: { type: Date, default: Date.now },
    reason: { type: String, default: '' },
    status: { type: String, enum: ['Approved', 'Pending', 'Rejected'], default: 'Approved' }
  },
  {
    timestamps: true
  }
);

TransferHistorySchema.index({ targetUserId: 1 });
TransferHistorySchema.index({ transferDate: -1 });

export const TransferHistory = mongoose.model<ITransferHistory>('TransferHistory', TransferHistorySchema);
