import { platform } from "./platform";
import type { PostureType } from "./pose/types";

const API_KEY_STORAGE = "anthropic_api_key";
const ENABLED_STORAGE = "llm_coaching_enabled";

export function loadApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) ?? "";
}

export function saveApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key.trim());
}

export function isCoachingEnabled(): boolean {
  return localStorage.getItem(ENABLED_STORAGE) === "true";
}

export function setCoachingEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_STORAGE, String(enabled));
}

interface RecentCacheEntry {
  message: string;
  at: number;
}
const recentByType = new Map<PostureType, RecentCacheEntry>();
const RECENT_TTL_MS = 5 * 60 * 1000;

/**
 * Returns a coaching message via Claude API. Returns null when LLM coaching
 * is disabled, the API key is missing, the rate limit hit, or any error
 * occurred — caller should fall back to a default message.
 */
export async function fetchCoachingMessage(opts: {
  postureType: PostureType;
  durationSecs: number;
  todayCountForType: number;
}): Promise<string | null> {
  if (!isCoachingEnabled()) return null;
  const apiKey = loadApiKey();
  if (!apiKey) return null;

  const cached = recentByType.get(opts.postureType);
  if (cached && Date.now() - cached.at < RECENT_TTL_MS) {
    return cached.message;
  }

  const message = await platform.generateCoachingMessage({
    apiKey,
    postureType: opts.postureType,
    durationSecs: opts.durationSecs,
    todayCountForType: opts.todayCountForType,
    hour: new Date().getHours(),
  });
  if (message) {
    recentByType.set(opts.postureType, { message, at: Date.now() });
  }
  return message;
}
