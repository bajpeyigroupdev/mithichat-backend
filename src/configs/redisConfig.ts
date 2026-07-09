import Redis from 'ioredis';
import { config } from './envConfig';

const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('connect', () => {
  console.log('Redis Connected');
});

redis.on('error', (err) => {
  console.error('Redis Error:', err);
});

export default redis;