/**
 * Sliding Window Rate Limiter Utility
 * Aligned with docs/saas-core-blueprint.md Section 4.1.
 */

export interface RateLimitRule {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  max: number;
  retryAfterMs: number;
}

class SlidingWindowRateLimiter {
  // Map of client identifier (IP or Account UUID) -> Array of request timestamps (ms)
  private buckets = new Map<string, number[]>();

  /**
   * Check if a request should be rate-limited
   */
  public limit(key: string, rule: RateLimitRule): RateLimitResult {
    const now = Date.now();
    const windowStart = now - rule.windowMs;

    // Retrieve previous timestamps
    let timestamps = this.buckets.get(key) || [];

    // Filter out timestamps that are outside the sliding window
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= rule.max) {
      // Find oldest timestamp in current window to calculate when retry is allowed
      const oldestTimestamp = timestamps[0];
      const timeSinceOldest = now - oldestTimestamp;
      const retryAfterMs = Math.max(0, rule.windowMs - timeSinceOldest);

      // Save the cleaned array back
      this.buckets.set(key, timestamps);

      return {
        allowed: false,
        currentCount: timestamps.length,
        max: rule.max,
        retryAfterMs,
      };
    }

    // Register current request timestamp
    timestamps.push(now);
    this.buckets.set(key, timestamps);

    return {
      allowed: true,
      currentCount: timestamps.length,
      max: rule.max,
      retryAfterMs: 0,
    };
  }

  /**
   * Clear old buckets to free up memory (can be run periodically)
   */
  public prune(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.buckets.entries()) {
      // If the latest request was more than 1 hour ago, delete the entry
      if (timestamps.length === 0 || now - timestamps[timestamps.length - 1] > 3600000) {
        this.buckets.delete(key);
      }
    }
  }
}

// Singleton instance for different rate limit rules
export const rateLimiter = new SlidingWindowRateLimiter();

// Predefined rules from saas-core-blueprint.md
export const RATE_LIMIT_RULES = {
  // Handshake / connection rate limits
  websocket: { windowMs: 60000, max: 120 }, // 120 per minute
  
  // High-weight creations (Workspaces, Rooms, etc.)
  roomIP: { windowMs: 60000, max: 20 },      // 20 per minute per IP
  roomUser: { windowMs: 60000, max: 10 },    // 10 per minute per Account
  
  // Heavy computation operations (AI coaching, database generation)
  aiIP: { windowMs: 60000, max: 10 },        // 10 per minute per IP
  aiUser: { windowMs: 60000, max: 5 },       // 5 per minute per Account
};
