import { z } from 'zod';

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const adminPaginationSchema = paginationSchema.extend({
  status: z.string().optional(),
  flightId: z.string().uuid().optional(),
  passengerId: z.string().uuid().optional(),
});
