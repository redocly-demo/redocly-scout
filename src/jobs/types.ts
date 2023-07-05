import { z } from 'zod';
import {
  CommitCheckSchema,
  CommitCheckStatusSchema,
  ScoutJobSchema,
} from './zod-schemas/scout-job';

export type ScoutJob = z.infer<typeof ScoutJobSchema>;

export type CommitCheck = z.infer<typeof CommitCheckSchema>;

export type CommitCheckStatus = z.infer<typeof CommitCheckStatusSchema>;
