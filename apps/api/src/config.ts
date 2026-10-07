import { z } from 'zod';
const schema = z.object({
  AI_SUMMARIES_ENABLED: z.enum(['true','false']).default('false'),
  AI_INTERNAL_TOKEN: z.string().default(''),
  AUTH_ORIGINS: z.string().default('http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173'),
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AI_SERVICE_URL: z.string().url(),
  LOG_LEVEL: z.enum(['fatal','error','warn','info','debug','trace','silent']).default('info')
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid configuration keys: ${result.error.issues.map(i => i.path.join('.')).join(', ')}`);
  }
  return result.data;
}
