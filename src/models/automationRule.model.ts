import mongoose, { Schema, Document } from 'mongoose';

export type AutomationTrigger = 'application_approved' | 'application_rejected' | 'employee_created' | 'host_level_up';

export interface IAutomationAction {
    actionType: 'create_employee' | 'dispatch_offer_letter' | 'send_notification' | 'assign_role' | 'award_badge';
    config: Record<string, any>;
}

export interface IAutomationRule extends Document {
    ruleName: string;
    trigger: AutomationTrigger;
    actions: IAutomationAction[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const AutomationRuleSchema = new Schema<IAutomationRule>({
    ruleName: { type: String, required: true },
    trigger: {
        type: String,
        required: true,
        enum: ['application_approved', 'application_rejected', 'employee_created', 'host_level_up'],
        index: true
    },
    actions: [{
        actionType: { type: String, required: true },
        config: { type: Schema.Types.Mixed, default: {} }
    }],
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const AutomationRule = mongoose.model<IAutomationRule>('AutomationRule', AutomationRuleSchema);
