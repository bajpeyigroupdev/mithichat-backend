import mongoose, { Schema, Document } from 'mongoose';

export interface IPluginRoute {
    path: string;
    label: string;
    icon: string;
}

export interface IPluginManifest extends Document {
    pluginId: string;
    name: string;
    version: string;
    description: string;
    author: string;
    isEnabled: boolean;
    category: 'hr' | 'finance' | 'crm' | 'compliance' | 'lms' | 'ai';
    routes: IPluginRoute[];
    requiredPermissions: string[];
    configSettings: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const PluginManifestSchema = new Schema<IPluginManifest>({
    pluginId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    version: { type: String, default: '1.0.0' },
    description: { type: String, default: '' },
    author: { type: String, default: 'Enterprise SaaS Engine' },
    isEnabled: { type: Boolean, default: true, index: true },
    category: {
        type: String,
        enum: ['hr', 'finance', 'crm', 'compliance', 'lms', 'ai'],
        default: 'hr'
    },
    routes: [{
        path: { type: String, required: true },
        label: { type: String, required: true },
        icon: { type: String, default: 'Box' }
    }],
    requiredPermissions: [{ type: String }],
    configSettings: { type: Schema.Types.Mixed, default: {} }
}, { timestamps: true });

export const PluginManifest = mongoose.model<IPluginManifest>('PluginManifest', PluginManifestSchema);
