import mongoose, { Schema, Document } from 'mongoose';

export interface IPermissionVersion {
  version: number;
  menus?: string[];
  pages?: string[];
  modules?: string[];
  actions?: string[];
  fields?: Record<string, boolean>;
  buttons?: string[];
  columns?: Record<string, string[]>;
  changedBy: string;
  changedAt: Date;
  reason: string;
}

export interface IABACRule {
  logical?: 'AND' | 'OR';
  field?: string;
  operator?: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'startsWith' | 'endsWith';
  value?: any;
  conditions?: IABACRule[];
  action?: string;
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
  orgId?: mongoose.Types.ObjectId;
  abacRules?: IABACRule[];
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
        menus: { type: [String] },
        pages: { type: [String] },
        modules: { type: [String] },
        actions: { type: [String] },
        fields: { type: Map, of: Boolean },
        buttons: { type: [String] },
        columns: { type: Map, of: [String] },
        changedBy: { type: String },
        changedAt: { type: Date, default: Date.now },
        reason: { type: String, default: '' },
      },
    ],
    organizationId: { type: String },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    abacRules: { type: Schema.Types.Mixed, default: [] }
  },
  { timestamps: true }
);

permissionSchema.index({ targetType: 1, targetId: 1 }, { unique: true });

export const Permission = mongoose.model<IPermission>('Permission', permissionSchema);
