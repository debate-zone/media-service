import { z } from 'zod';
import { idObjectIdsSchema } from '../../debate-zone-micro-service-common-library/src/zod/baseZodSchema';

export const mediaSchema = z.object({
    debateZoneId: idObjectIdsSchema,
    hostUserId: z.string(),
    savePath: z.string(),
});
