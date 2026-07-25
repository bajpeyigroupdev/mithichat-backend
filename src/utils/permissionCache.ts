import redis from '../configs/redisConfig';

const localCache = new Map<string, { value: any; expiry: number }>();

export class PermissionCache {
  private static CACHE_TTL = 3600; // 1 hour in seconds
  private static LOCAL_TTL = 60000; // 1 minute in milliseconds

  private static getCacheKey(targetType: string, targetId: string, orgId?: string): string {
    return `iam_cache:${targetType}:${targetId}${orgId ? `:${orgId}` : ''}`;
  }

  /**
   * Fetch active policy from local cache -> Redis -> MongoDB callback
   */
  public static async getOrSet(
    targetType: string,
    targetId: string,
    orgId: string | undefined,
    dbFetchCallback: () => Promise<any>
  ): Promise<any> {
    const key = this.getCacheKey(targetType, targetId, orgId);

    // 1. Check local memory cache
    const cachedLocal = localCache.get(key);
    if (cachedLocal && cachedLocal.expiry > Date.now()) {
      return cachedLocal.value;
    }

    // 2. Check Redis cache
    try {
      const cachedRedis = await redis.get(key);
      if (cachedRedis) {
        const parsed = JSON.parse(cachedRedis);
        // Populate local cache
        localCache.set(key, { value: parsed, expiry: Date.now() + this.LOCAL_TTL });
        return parsed;
      }
    } catch (err) {
      console.error('[Permission Cache] Redis lookup failed, falling back to database:', err);
    }

    // 3. Fallback to Database
    const dbValue = await dbFetchCallback();
    const cleanValue = dbValue && typeof dbValue.toObject === 'function' ? dbValue.toObject() : dbValue;

    // 4. Populate caches
    if (cleanValue) {
      localCache.set(key, { value: cleanValue, expiry: Date.now() + this.LOCAL_TTL });
      try {
        await redis.setex(key, this.CACHE_TTL, JSON.stringify(cleanValue));
      } catch (err) {
        console.error('[Permission Cache] Redis write failed:', err);
      }
    }

    return cleanValue;
  }

  /**
   * Invalidate policy from caches
   */
  public static async invalidate(targetType: string, targetId: string, orgId?: string): Promise<void> {
    const key = this.getCacheKey(targetType, targetId, orgId);
    
    // Clear local memory
    localCache.delete(key);

    // Clear Redis
    try {
      await redis.del(key);
      console.log(`[Permission Cache] Invalidated cache key: ${key}`);
    } catch (err) {
      console.error('[Permission Cache] Redis deletion failed during invalidation:', err);
    }
  }

  /**
   * Clear entire memory and Redis cache (e.g. for complete syncs)
   */
  public static async clearAll(): Promise<void> {
    localCache.clear();
    try {
      const keys = await redis.keys('iam_cache:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      console.log('[Permission Cache] Invalidated all IAM cache entries');
    } catch (err) {
      console.error('[Permission Cache] Failed to clear all Redis keys:', err);
    }
  }
}
