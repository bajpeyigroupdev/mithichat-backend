import mongoose, { Schema, Document } from 'mongoose';

export interface IPermission extends Document {
  targetType: 'role' | 'user';
  targetId: string; // E.g., 'admin' or string representation of user's MongoDB ObjectId or userId
  menus: string[];
  pages: string[];
  modules: string[];
  actions: string[];
  fields: Map<string, boolean>; // Field-level visibility: e.g. Map { "coins": false, "email": false }
  buttons: string[];
  columns: Map<string, string[]>; // Visible columns per table, e.g. Map { "user": ["UID", "Name", "Age"] }
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
  },
  { timestamps: true }
);

permissionSchema.index({ targetType: 1, targetId: 1 }, { unique: true });

export const Permission = mongoose.model<IPermission>('Permission', permissionSchema);
