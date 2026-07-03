import NodeCache from 'node-cache';

// Initialize cache with default TTL of 5 minutes
const cache = new NodeCache({
    stdTTL: 300, // 5 minutes
    checkperiod: 60, // Check for expired keys every minute
    useClones: false, // Better performance, but be careful with mutations
});

/**
 * Cache service for improving API performance
 */
class CacheService {
    /**
     * Get value from cache
     */
    get<T>(key: string): T | undefined {
        return cache.get<T>(key);
    }

    /**
     * Set value in cache with optional TTL
     */
    set<T>(key: string, value: T, ttl?: number): boolean {
        if (ttl) {
            return cache.set(key, value, ttl);
        }
        return cache.set(key, value);
    }

    /**
     * Delete value from cache
     */
    del(key: string | string[]): number {
        return cache.del(key);
    }

    /**
     * Clear all cache
     */
    flush(): void {
        cache.flushAll();
    }

    /**
     * Get or set pattern - fetch from cache or execute function and cache result
     */
    async getOrSet<T>(
        key: string,
        fetchFn: () => Promise<T>,
        ttl?: number
    ): Promise<T> {
        const cached = this.get<T>(key);
        if (cached !== undefined) {
            return cached;
        }

        const fresh = await fetchFn();
        this.set(key, fresh, ttl);
        return fresh;
    }

    /**
     * Invalidate cache by pattern (useful for related data)
     */
    invalidatePattern(pattern: string): void {
        const keys = cache.keys();
        const matchingKeys = keys.filter(key => key.includes(pattern));
        if (matchingKeys.length > 0) {
            cache.del(matchingKeys);
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return cache.getStats();
    }
}

export const cacheService = new CacheService();
export default cacheService;
