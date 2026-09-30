export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CursorPaginationMeta {
  next_cursor: string | null;
  has_more: boolean;
  page_size: number;
}

export type PaginationEnvelope<T> = 
  | { data: T[]; pagination: PaginationMeta }
  | { data: T[]; pagination: CursorPaginationMeta };

export function createPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export function createCursorPaginationMeta(
  nextCursor: string | null,
  hasMore: boolean,
  pageSize: number,
): CursorPaginationMeta {
  return {
    next_cursor: nextCursor,
    has_more: hasMore,
    page_size: pageSize,
  };
}

export function normalizePaginationParams(params: PaginationParams): {
  page: number;
  limit: number;
  cursor?: string;
} {
  const page = Math.max(params.page ?? 1, 1);
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  return { page, limit, cursor: params.cursor };
}