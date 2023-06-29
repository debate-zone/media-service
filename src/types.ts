import { mediaSchema } from './zodSchemas';
import { z } from 'zod';

export type Media = z.infer<typeof mediaSchema>;
