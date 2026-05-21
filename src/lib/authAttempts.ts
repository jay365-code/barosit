/**
 * Authentication Attempt Lockout Guard
 * Aligned with docs/saas-core-blueprint.md Section 4.2.
 */

export interface AttemptRecord {
  failures: number;
  lockedUntil: number | null;
}

export interface LockoutStatus {
  isLocked: boolean;
  failures: number;
  retryAfterSecs: number; // For "Retry-After" header
  reason: "token" | "ip" | null;
}

class AuthAttemptsGuard {
  // Store attempt records: key (IP or username/token) -> AttemptRecord
  private records = new Map<string, AttemptRecord>();

  private LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  private TOKEN_FAIL_LIMIT = 5;
  private IP_FAIL_LIMIT = 15;

  /**
   * Check if a specific IP or username/token is currently locked out
   */
  public checkLockout(token: string, ip: string): LockoutStatus {
    const now = Date.now();

    // 1. Check IP lockout first (global IP block takes precedence)
    const ipRecord = this.records.get(`ip:${ip}`);
    if (ipRecord && ipRecord.lockedUntil && ipRecord.lockedUntil > now) {
      return {
        isLocked: true,
        failures: ipRecord.failures,
        retryAfterSecs: Math.ceil((ipRecord.lockedUntil - now) / 1000),
        reason: "ip",
      };
    }

    // 2. Check token (username / email) lockout
    const tokenRecord = this.records.get(`token:${token}`);
    if (tokenRecord && tokenRecord.lockedUntil && tokenRecord.lockedUntil > now) {
      return {
        isLocked: true,
        failures: tokenRecord.failures,
        retryAfterSecs: Math.ceil((tokenRecord.lockedUntil - now) / 1000),
        reason: "token",
      };
    }

    // Clean up expired locks
    if (ipRecord && ipRecord.lockedUntil && ipRecord.lockedUntil <= now) {
      this.resetAttempts(`ip:${ip}`);
    }
    if (tokenRecord && tokenRecord.lockedUntil && tokenRecord.lockedUntil <= now) {
      this.resetAttempts(`token:${token}`);
    }

    return {
      isLocked: false,
      failures: (tokenRecord?.failures || 0) + (ipRecord?.failures || 0),
      retryAfterSecs: 0,
      reason: null,
    };
  }

  /**
   * Record a failed login attempt
   */
  public recordFailure(token: string, ip: string): LockoutStatus {
    const now = Date.now();

    const tokenKey = `token:${token}`;
    const ipKey = `ip:${ip}`;

    // Update token failure record
    const tRecord = this.records.get(tokenKey) || { failures: 0, lockedUntil: null };
    tRecord.failures += 1;
    if (tRecord.failures >= this.TOKEN_FAIL_LIMIT) {
      tRecord.lockedUntil = now + this.LOCKOUT_DURATION_MS;
    }
    this.records.set(tokenKey, tRecord);

    // Update IP failure record
    const iRecord = this.records.get(ipKey) || { failures: 0, lockedUntil: null };
    iRecord.failures += 1;
    if (iRecord.failures >= this.IP_FAIL_LIMIT) {
      iRecord.lockedUntil = now + this.LOCKOUT_DURATION_MS;
    }
    this.records.set(ipKey, iRecord);

    return this.checkLockout(token, ip);
  }

  /**
   * Reset attempts upon a successful login
   */
  public recordSuccess(token: string, ip: string): void {
    this.resetAttempts(`token:${token}`);
    this.resetAttempts(`ip:${ip}`);
  }

  private resetAttempts(key: string): void {
    this.records.delete(key);
  }

  /**
   * Utility to format remaining seconds into "MM:SS" format for UX
   */
  public static formatCountdown(seconds: number): string {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    const padMin = String(min).padStart(2, "0");
    const padSec = String(sec).padStart(2, "0");
    return `${padMin}:${padSec}`;
  }
}

export const authAttemptsGuard = new AuthAttemptsGuard();
