import { Logger } from '../utils/logger';

export type SystemEventName = 'EmployeeCreated' | 'RecruitmentApproved' | 'HostVerified' | 'PaymentCompleted' | 'UserBlocked';

type EventCallback = (payload: Record<string, any>) => Promise<void> | void;

class CentralEventBus {
    private listeners: Map<SystemEventName, EventCallback[]> = new Map();

    public subscribe(event: SystemEventName, callback: EventCallback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)?.push(callback);
    }

    public async publish(event: SystemEventName, payload: Record<string, any>) {
        console.log(`[Central Event Bus] Published Event: ${event}`);
        await Logger('eventBusPublish', { event, payload });

        const callbacks = this.listeners.get(event) || [];
        for (const cb of callbacks) {
            try {
                await cb(payload);
            } catch (err: any) {
                await Logger('eventBusCallbackError', err);
            }
        }
    }
}

export const eventBus = new CentralEventBus();
