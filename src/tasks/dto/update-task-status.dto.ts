import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ScoutJobStatusSchema } from '../../jobs/zod-schemas/scout-job';

export class UpdateTaskStatusDto extends createZodDto(
  z.object({
    id: z.string(),
    status: ScoutJobStatusSchema.extract(['COMPLETED', 'FAILED']),
  }),
) {}