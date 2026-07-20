import { AutomationRule, AutomationTrigger } from '../models/automationRule.model';
import { automateEmployeeCreationOnApproval } from './employeeLifecycleService';
import { sendRecruitmentWorkflowNotification } from './recruitmentNotification';
import { Logger } from '../utils/logger';

export async function processAutomationTrigger(trigger: AutomationTrigger, payload: Record<string, any>) {
    try {
        console.log(`[Automation Engine] Processing Trigger: ${trigger.toUpperCase()}`);

        const rules = await AutomationRule.find({ trigger, isActive: true }).lean();

        // Default automated action if rules array is empty
        if (trigger === 'application_approved') {
            if (payload.applicationId) {
                await automateEmployeeCreationOnApproval(payload.applicationId);
            }
            if (payload.applicantEmail) {
                await sendRecruitmentWorkflowNotification({
                    applicantName: payload.applicantName || 'Applicant',
                    applicantEmail: payload.applicantEmail,
                    applicationId: payload.applicationId || 'APP',
                    role: payload.role || 'agency',
                    status: 'approved'
                });
            }
        }

        for (const rule of rules) {
            for (const action of rule.actions) {
                if (action.actionType === 'create_employee' && payload.applicationId) {
                    await automateEmployeeCreationOnApproval(payload.applicationId);
                } else if (action.actionType === 'send_notification' && payload.applicantEmail) {
                    await sendRecruitmentWorkflowNotification({
                        applicantName: payload.applicantName || 'Applicant',
                        applicantEmail: payload.applicantEmail,
                        applicationId: payload.applicationId || 'APP',
                        role: payload.role || 'agency',
                        status: payload.status || 'approved'
                    });
                }
            }
        }

        return { success: true, executedRulesCount: rules.length };
    } catch (error: any) {
        await Logger('processAutomationTrigger', error);
        return { success: false, message: error.message };
    }
}
