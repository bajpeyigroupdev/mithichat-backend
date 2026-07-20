import mongoose, { Schema, Document } from 'mongoose';

export interface IFormFieldConfig {
    fieldKey: string;
    label: string;
    fieldType: 'text' | 'textarea' | 'dropdown' | 'checkbox' | 'radio' | 'upload' | 'date' | 'multi-select';
    required: boolean;
    options?: string[];
    placeholder?: string;
    stepId: string;
}

export interface IFormStepConfig {
    id: string;
    title: string;
    description?: string;
}

export interface IRecruitmentRoleConfig extends Document {
    role: string;
    hostname: string;
    title: string;
    subtitle: string;
    badgeText: string;
    themeGradient: string;
    accentColor: string;
    formSteps: IFormStepConfig[];
    fields: IFormFieldConfig[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const RecruitmentRoleConfigSchema = new Schema<IRecruitmentRoleConfig>({
    role: { type: String, required: true, unique: true, index: true },
    hostname: { type: String, required: true },
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    badgeText: { type: String, default: 'Recruitment Portal' },
    themeGradient: { type: String, default: 'from-slate-950 via-purple-950 to-indigo-950' },
    accentColor: { type: String, default: 'purple' },
    formSteps: [{
        id: { type: String, required: true },
        title: { type: String, required: true },
        description: { type: String }
    }],
    fields: [{
        fieldKey: { type: String, required: true },
        label: { type: String, required: true },
        fieldType: {
            type: String,
            required: true,
            enum: ['text', 'textarea', 'dropdown', 'checkbox', 'radio', 'upload', 'date', 'multi-select']
        },
        required: { type: Boolean, default: false },
        options: [{ type: String }],
        placeholder: { type: String },
        stepId: { type: String, required: true }
    }],
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const RecruitmentRoleConfig = mongoose.model<IRecruitmentRoleConfig>('RecruitmentRoleConfig', RecruitmentRoleConfigSchema);
