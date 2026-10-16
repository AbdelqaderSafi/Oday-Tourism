import { z } from 'zod';
import { DestinatiosnEnum } from 'generated/prisma/client';
import { DestinationQuery } from '../types/destination.dto';

export const destinationParamSchema = z.enum(DestinatiosnEnum);

export const destinationQuerySchema = z.object({
  type: z.enum(['hotels', 'trips']).optional(),
}) satisfies z.ZodType<DestinationQuery>;
