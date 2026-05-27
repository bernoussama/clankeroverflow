import { TRPCError } from "@trpc/server";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

export function assertRateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (current.count >= limit) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again later.",
    });
  }

  current.count += 1;
}

export function resetRateLimits() {
  buckets.clear();
}
