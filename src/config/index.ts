import { z } from 'zod';

const githubConfigSchema = z.object({
  url: z.string().trim().optional(),
  appId: z.string().trim(),
  appUserId: z.coerce.number(),
  privateKey: z.string().trim(),
  webhookSecret: z.string().trim(),
});

const gitlabConfigSchema = z.object({
  url: z.string().trim().optional(),
  userId: z.coerce.number(),
  privateToken: z.string().trim(),
  webhookSecret: z.string().trim(),
});

const configSchema = z.object({
  PORT: z.coerce.number().min(1).default(8080),
  MAX_CONCURRENT_JOBS: z.coerce.number().min(1).default(2),
  AUTO_MERGE: z
    .enum(['true', 'false', ''])
    .transform((value) => value === 'true'),
  SCOUT_VERSION: z.string().trim().min(1),
  REDOCLY_API_URL: z.string().trim(),
  REDOCLY_API_KEY: z.string().trim(),
  REDOCLY_ORG_ID: z.string().trim(),
  REDOCLY_PORTAL_ID: z.string().trim(),
  REDOCLY_DEST_FOLDER_PATH: z
    .string()
    .trim()
    .default('apis/{metadata.team}/{repoId}/{title}')
    .refine(validateApiDestinationPath, {
      message: 'Invalid destination path variables',
    }),
  DATA_FOLDER: z.string().trim(),
  REDOCLY_JOB_CONTEXT: z.string().trim().optional(),
  REDOCLY_METADATA_REQUIRED: z
    .enum(['true', 'false', ''])
    .transform((value) => value === 'true'),
  MOUNT_BRANCH_NAME: z.string().trim().default('main'),
  API_FOLDER: z.string().trim().default('/'),
  GITHUB_APP_ID: z.string().trim().optional(),
  GITHUB_APP_USER_ID: z.coerce.number().optional(),
  GITHUB_SERVER_URL: z.string().trim().optional(),
  GITHUB_PRIVATE_KEY: z.string().trim().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().trim().optional(),
  GITHUB_PROVIDERS: z
    .string()
    .trim()
    .optional()
    .transform(parseProvidersConfig)
    .pipe(z.array(githubConfigSchema)),
  GITLAB_PROVIDERS: z
    .string()
    .trim()
    .optional()
    .transform(parseProvidersConfig)
    .pipe(z.array(gitlabConfigSchema)),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
});

export type GithubConfigSchema = z.infer<typeof githubConfigSchema>;
export type GitlabConfigSchema = z.infer<typeof gitlabConfigSchema>;
export type ConfigSchema = z.infer<typeof configSchema>;

export function validateConfig(config: Record<string, any>): ConfigSchema {
  return configSchema.parse(config);
}

function parseProvidersConfig(
  str: string | undefined,
  ctx: z.RefinementCtx,
): GithubConfigSchema {
  try {
    return JSON.parse(str || '[]');
  } catch (e) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid JSON' });
    return z.NEVER;
  }
}

function validateApiDestinationPath(path: string) {
  return [...path.matchAll(/{(.+?)}/g)].every(
    ([_, variable]) => variable && isValidApiDestinationPathVariable(variable),
  );
}

function isValidApiDestinationPathVariable(variable: string) {
  return (
    variable.startsWith('metadata.') ||
    ['title', 'repoId', 'orgId'].includes(variable)
  );
}
