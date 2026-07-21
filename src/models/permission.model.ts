import mongoose, { Schema, Document } from 'mongoose';

export interface IPermissionVersion {
  version: number;
  actions: string[];
  fields: Record<string, boolean>;
  updatedBy: string;
  savedAt: Date;
}

export interface IPermission extends Document {
  targetType: 'role' | 'user';
  targetId: string;
  menus: string[];
  pages: string[];
  modules: string[];
  actions: string[];
  fields: Map<string, boolean>;
  buttons: string[];
  columns: Map<string, string[]>;
  dashboardWidgets: string[];
  exports: string[];
  imports: string[];
  reports: string[];
  notifications: string[];
  finance: string[];
  settings: string[];
  developer: string[];
  isTemplate: boolean;
  templateName?: string;
  isCustomRole?: boolean;
  customRoleDescription?: string;
  parentRoleInherit?: string;
  expiresAt?: Date;
  versionHistory?: IPermissionVersion[];
  organizationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const permissionSchema = new Schema<IPermission>(
  {
    targetType: { type: String, enum: ['role', 'user'], required: true },
    targetId: { type: String, required: true },
    menus: { type: [String], default: [] },
    pages: { type: [String], default: [] },
    modules: { type: [String], default: [] },
    actions: { type: [String], default: [] },
    fields: { type: Map, of: Boolean, default: () => new Map() },
    buttons: { type: [String], default: [] },
    columns: { type: Map, of: [String], default: () => new Map() },
    dashboardWidgets: { type: [String], default: [] },
    exports: { type: [String], default: [] },
    imports: { type: [String], default: [] },
    reports: { type: [String], default: [] },
    notifications: { type: [String], default: [] },
    finance: { type: [String], default: [] },
    settings: { type: [String], default: [] },
    developer: { type: [String], default: [] },
    isTemplate: { type: Boolean, default: false },
    templateName: { type: String },
    isCustomRole: { type: Boolean, default: false },
    customRoleDescription: { type: String },
    parentRoleInherit: { type: String },
    expiresAt: { type: Date },
    versionHistory: [
      {
        version: { type: Number },
        actions: { type: [String] },
        fields: { type: Map, of: Boolean },
        updatedBy: { type: String },
        savedAt: { type: Date, default: Date.now },
      },
    ],
    organizationId: { type: String },
  },
  { timestamps: true }
);

permissionSchema.index({ targetType: 1, targetId: 1 }, { unique: true });

export const Permission = mongoose.model<IPermission>('Permission', permissionSchema);
