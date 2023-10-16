import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ScoutJobStatusSchema } from '../../jobs/zod-schemas/scout-job';

const taskMetadataSchema = z.object({
  errorMessage: z.string().optional(),
  errorStack: z.string().optional(),
  remoteIds: z.array(z.string()).optional(),
});

export class UpdateTaskStatusDto extends createZodDto(
  z.object({
    id: z.string(),
    status: ScoutJobStatusSchema.extract(['COMPLETED', 'FAILED']),
    metadata: taskMetadataSchema.optional(),
  }),
) {}

export class TaskMetadata extends createZodDto(taskMetadataSchema) {}
