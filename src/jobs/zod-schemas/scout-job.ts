import { z } from 'zod';

export const ScoutJobTypeSchema = z.enum(['PROCESS_GIT_REPO', 'UPDATE_STATUS']);

export const GitProviderTypeSchema = z.enum([
  'GITHUB_CLOUD',
  'GITHUB_SERVER',
  'GITLAB_CLOUD',
  'GITLAB_SELF_MANAGED',
]);

export const ScoutJobStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);

export const CommitCheckStatusSchema = z.enum([
  'IN_PROGRESS',
  'SUCCEEDED',
  'FAILED',
]);

export const CommitCheckSchema = z.object({
  name: z.string(),
  status: CommitCheckStatusSchema,
  description: z.string().optional(),
  targetUrl: z.string().optional(),
  logs: z
    .array(
      z.object({
        log: z.string(),
        date: z.date(),
      }),
    )
    .optional(),
});

export const ScoutJobSchema = z.object({
  id: z.string(),
  status: ScoutJobStatusSchema,
  type: ScoutJobTypeSchema,
  organizationId: z.string(),
  portalId: z.string(),
  providerId: z.string(),
  providerType: GitProviderTypeSchema,
  namespaceId: z.string(),
  repositoryId: z.string(),
  branch: z.string(),
  isMainBranch: z.boolean().default(false),
  commitSha: z.string(),
  prId: z.string().optional(),
  attempts: z.number(),
  parentJobId: z.string().optional(),
  checks: z.array(CommitCheckSchema).optional(),
  startedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
