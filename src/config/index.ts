import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().min(1).default(8080),
  MAX_CONCURRENT_JOBS: z.coerce.number().min(1).default(2),
  AUTO_MERGE: z.coerce.boolean().default(false),
  SCOUT_VERSION: z.string().trim().min(1),
  REDOCLY_API_URL: z.string().trim(),
  REDOCLY_API_KEY: z.string().trim(),
  REDOCLY_ORG_ID: z.string().trim(),
  REDOCLY_PORTAL_ID: z.string().trim(),
  PORTAL_APIS_FOLDER: z.string().trim().default('/'),
  DATA_FOLDER: z.string().trim(),
  API_FOLDER: z.string().trim().default('/'),
  GITHUB_APP_ID: z.string().trim().optional(),
  GITHUB_APP_USER_ID: z.coerce.number().optional(),
  GITHUB_SERVER_URL: z.string().trim().optional(),
  GITHUB_PRIVATE_KEY: z.string().trim().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().trim().optional(),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
});

export type ConfigSchema = z.infer<typeof configSchema>;

export function validateConfig(config: Record<string, any>): ConfigSchema {
  return configSchema.parse(config);
}
