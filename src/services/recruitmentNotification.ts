import { Logger } from '../utils/logger';

export interface NotificationPayload {
    applicantName: string;
    applicantEmail: string;
    applicationId: string;
    role: string;
    status: string;
    customNote?: string;
}

export async function sendRecruitmentWorkflowNotification(payload: NotificationPayload) {
    try {
        console.log(`[Notification Service] Dispatching ${payload.status.toUpperCase()} notification to ${payload.applicantEmail} for ${payload.applicationId}`);

        // Notification templates per status trigger
        let subject = `[MithiChat EMS] Application Update: ${payload.applicationId}`;
        let body = `Hello ${payload.applicantName},\n\nYour application (${payload.applicationId}) status has been updated to: ${payload.status.toUpperCase()}.\n`;

        if (payload.status === 'interview_scheduled') {
            subject = `[MithiChat EMS] Interview Scheduled - ${payload.applicationId}`;
            body += `\nOur HR board has scheduled an interview for your ${payload.role.toUpperCase()} application. Details will be sent shortly.`;
        } else if (payload.status === 'approved') {
            subject = `🎉 Congratulations! Your ${payload.role.toUpperCase()} Application is Approved!`;
            body += `\nWelcome to MithiChat! Your partner onboarding is approved. Check your portal for credentials.`;
        } else if (payload.status === 'rejected') {
            subject = `[MithiChat EMS] Application Status Update - ${payload.applicationId}`;
            body += `\nThank you for applying. At this time, we are unable to move forward with your application.`;
        }

        if (payload.customNote) {
            body += `\n\nNotes from Reviewer: ${payload.customNote}`;
        }

        // Log notification trigger dispatch
        await Logger('recruitmentNotification', { subject, to: payload.applicantEmail, applicationId: payload.applicationId });
        return { success: true, message: 'Notification dispatched' };
    } catch (error: any) {
        await Logger('sendRecruitmentWorkflowNotificationError', error);
        return { success: false, message: 'Failed to send notification' };
    }
}
