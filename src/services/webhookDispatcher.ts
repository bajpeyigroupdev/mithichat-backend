import { Webhook } from '../models/webhook.model';
import { Logger } from '../utils/logger';

export async function dispatchWebhookEvent(event: string, payload: Record<string, any>) {
    try {
        console.log(`[Webhook Dispatcher] Event triggered: ${event}`);

        const webhooks = await Webhook.find({ events: event, isActive: true }).lean();

        for (const hook of webhooks) {
            console.log(`[Webhook Dispatcher] Sending payload to ${hook.targetUrl} for event ${event}`);
            // Fire-and-forget background HTTP POST
            fetch(hook.targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Event': event,
                    'X-Webhook-Secret': hook.secretKey
                },
                body: JSON.stringify({ event, timestamp: new Date(), data: payload })
            }).catch(() => {});
        }

        return { success: true, count: webhooks.length };
    } catch (error: any) {
        await Logger('dispatchWebhookEvent', error);
        return { success: false, message: error.message };
    }
}
