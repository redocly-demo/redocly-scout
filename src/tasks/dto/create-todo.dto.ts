import { z } from 'zod';
import {
  GitProviderTypeSchema,
  ScoutJobTypeSchema,
} from '../../jobs/zod-schemas/scout-job';

const ProcessGitRepoJobSchema = z
  .object({
    type: ScoutJobTypeSchema.extract(['PROCESS_GIT_REPO']),
    providerId: z.string(),
    providerType: GitProviderTypeSchema,
    namespaceId: z.string(),
    repositoryId: z.string(),
    branch: z.string(),
    isMainBranch: z.boolean().default(false),
    commitSha: z.string(),
    commitMessage: z.string().optional(),
    prId: z.string().optional(),
  })
  .strict();

export type ProcessGitRepoTodoType = z.infer<typeof ProcessGitRepoJobSchema>;
