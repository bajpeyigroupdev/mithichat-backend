
import redis from "../configs/redisConfig";
import { sendMessage } from "./chat.service";

/**
 * Chat Write-Behind Queue
 * - Buffers incoming messages in Redis
 * - Flushes to MongoDB in batches
 * - Prevents DB lock during high concurrency
 */

const QUEUE_KEY = "chat:message_queue";
const BATCH_SIZE = 50; // Process 50 msgs per tick

export class ChatQueueService {

    // Add message to Redis Queue
    static async addMessage(payload: any) {
        // We just push to Redis list. Stringify standardizes format.
        // We add a 'timestamp' just in case.
        await redis.rpush(QUEUE_KEY, JSON.stringify({ ...payload, queuedAt: Date.now() }));
    }

    // Process Queue (Called by Cron or Worker)
    static async flushQueue() {
        // Fetch BATCH_SIZE items
        // Redis 'lpop' with count is atomic.
        // Needs IoRedis > v4. 
        // If older, we loop. Assuming IoRedis modern environment.

        // Fetch up to 50 items
        const rawMessages = await redis.lpop(QUEUE_KEY, BATCH_SIZE);

        if (!rawMessages || rawMessages.length === 0) return;

        console.log(`📨 Flushing ${rawMessages.length} messages from Chat Queue...`);

        // In a real high-scale system, we might use 'bulkWrite' for Mongo.
        // But 'sendMessage' service has logic (create conversation if null).
        // So we just parallelize the calls.

        const promises = rawMessages.map(async (raw) => {
            try {
                const data = JSON.parse(raw);
                // Call the existing service
                await sendMessage({
                    senderId: data.senderId,
                    receiverId: data.receiverId,
                    content: data.content
                });
            } catch (err) {
                console.error("❌ Failed to process queued message:", err);
                // In production: Push to 'Dead Letter Queue' (DLQ) in Redis
                // await redis.rpush("chat:dlq", raw);
            }
        });

        await Promise.all(promises);
        console.log(`✅ Flushed batch.`);
    }
}
