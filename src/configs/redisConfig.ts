import Redis from 'ioredis';
import { config } from './envConfig';

const redisConfig = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
};

const redis = new Redis(config.REDIS_URL, redisConfig);

redis.on('connect', () => {
    console.log('✅ Redis Connected');
});

redis.on('error', (err) => {
    console.error('❌ Redis Connection Error:', err);
});

export default redis;
