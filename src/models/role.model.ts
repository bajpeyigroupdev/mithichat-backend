import mongoose, { Schema, Document } from 'mongoose';

export interface IRole extends Document {
  roleName: string;
  description?: string;
  parentRoleInherit?: string;
  isCustom: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema<IRole>(
  {
    roleName: { type: String, required: true, unique: true },
    description: { type: String },
    parentRoleInherit: { type: String },
    isCustom: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const Role = mongoose.model<IRole>('Role', roleSchema);
