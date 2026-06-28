import Redis from "ioredis";

import { loadEnv } from "../../config/env.js";

const env = loadEnv();

export const redis = new Redis(env.REDIS_URL, {
  password: env.REDIS_PASSWORD || undefined,
  tls: env.REDIS_TLS ? {} : undefined,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
});
