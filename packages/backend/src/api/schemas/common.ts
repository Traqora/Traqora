import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminPaginationSchema = paginationSchema.extend({
  status: z.string().optional(),
  flightId: z.string().uuid().optional(),
  passengerId: z.string().uuid().optional(),
});

export type PaginationParams = z.infer<typeof paginationSchema>;
export type CursorPaginationParams = z.infer<typeof cursorPaginationSchema>;
export type AdminPaginationParams = z.infer<typeof adminPaginationSchema>;
