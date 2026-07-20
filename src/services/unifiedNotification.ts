import { Logger } from '../utils/logger';

export type NotificationCategory = 'recruitment' | 'security' | 'finance' | 'host' | 'agency' | 'operator' | 'support';

export interface UnifiedNotificationPayload {
    category: NotificationCategory;
    title: string;
    message: string;
    recipientEmail?: string;
    recipientPhone?: string;
    data?: Record<string, any>;
}

export async function dispatchUnifiedNotification(payload: UnifiedNotificationPayload) {
    try {
        console.log(`[Unified Notification Dispatcher] Category: ${payload.category.toUpperCase()} | Title: ${payload.title} | To: ${payload.recipientEmail || payload.recipientPhone || 'System'}`);

        // Log notification event into audit logger
        await Logger('unifiedNotificationDispatch', {
            category: payload.category,
            title: payload.title,
            recipient: payload.recipientEmail || payload.recipientPhone
        });

        return { success: true, message: 'Notification dispatched successfully' };
    } catch (error: any) {
        await Logger('dispatchUnifiedNotificationError', error);
        return { success: false, message: 'Failed to dispatch notification' };
    }
}
