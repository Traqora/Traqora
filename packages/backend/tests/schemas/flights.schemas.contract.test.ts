// @ts-ignore
import { z } from 'zod';

// Flight search schema from routes/flights.ts
const searchQuerySchema = z
  .object({
    from: z.string().min(3).max(3).optional(),
    to: z.string().min(3).max(3).optional(),
    origin: z.string().min(3).max(3).optional(),
    destination: z.string().min(3).max(3).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    passengers: z.coerce.number().int().min(1).max(9),
    class: z.enum(['economy', 'premium_economy', 'business', 'first']).default('economy'),
    price_min: z.coerce.number().int().nonnegative().optional(),
    price_max: z.coerce.number().int().nonnegative().optional(),
    airlines: z
      .string()
      .optional()
      .transform((value: string | undefined) =>
        value ? value.split(',').map((airline: string) => airline.trim()) : undefined,
      ),
    stops: z.coerce.number().int().min(0).max(2).optional(),
    duration_max: z.coerce.number().int().min(30).max(2000).optional(),
    sort: z.enum(['price', 'duration', 'departure_time', 'rating']).default('price'),
    sort_order: z.enum(['asc', 'desc']).optional(),
    cursor: z.string().optional(),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((query, ctx) => {
    const hasFromTo = Boolean(query.from && query.to);
    const hasOriginDestination = Boolean(query.origin && query.destination);

    if (!hasFromTo && !hasOriginDestination) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either from/to or origin/destination',
      });
    }
  });

describe('Flight Search Schema Contract Tests', () => {
  const validSearch = {
    from: 'JFK',
    to: 'LAX',
    date: '2024-12-25',
    passengers: 2,
  };

  it('should accept valid search query with from/to', () => {
    const result = searchQuerySchema.safeParse(validSearch);
    expect(result.success).toBe(true);
  });

  it('should accept valid search query with origin/destination', () => {
    const result = searchQuerySchema.safeParse({
      origin: 'JFK',
      destination: 'LAX',
      date: '2024-12-25',
      passengers: 1,
    });
    expect(result.success).toBe(true);
  });

  it('should apply default class to economy', () => {
    const result = searchQuerySchema.safeParse(validSearch);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.class).toBe('economy');
    }
  });

  it('should apply default sort to price', () => {
    const result = searchQuerySchema.safeParse(validSearch);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe('price');
    }
  });

  it('should apply default page_size to 20', () => {
    const result = searchQuerySchema.safeParse(validSearch);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page_size).toBe(20);
    }
  });

  it('should reject missing date', () => {
    const { date, ...withoutDate } = validSearch;
    const result = searchQuerySchema.safeParse(withoutDate);
    expect(result.success).toBe(false);
  });

  it('should reject missing passengers', () => {
    const { passengers, ...withoutPassengers } = validSearch;
    const result = searchQuerySchema.safeParse(withoutPassengers);
    expect(result.success).toBe(false);
  });

  it('should reject when neither from/to nor origin/destination provided', () => {
    const result = searchQuerySchema.safeParse({
      date: '2024-12-25',
      passengers: 1,
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid class values', () => {
    const classes = ['economy', 'premium_economy', 'business', 'first'] as const;
    classes.forEach((travelClass) => {
      const result = searchQuerySchema.safeParse({
        ...validSearch,
        class: travelClass,
      });
      expect(result.success).toBe(true);
    });
  });

  it('should accept all valid sort values', () => {
    const sorts = ['price', 'duration', 'departure_time', 'rating'] as const;
    sorts.forEach((sort) => {
      const result = searchQuerySchema.safeParse({
        ...validSearch,
        sort,
      });
      expect(result.success).toBe(true);
    });
  });

  it('should accept sort_order asc', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      sort_order: 'asc',
    });
    expect(result.success).toBe(true);
  });

  it('should accept sort_order desc', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      sort_order: 'desc',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid date format', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      date: '12/25/2024',
    });
    expect(result.success).toBe(false);
  });

  it('should reject date in wrong format', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      date: '2024-12-25T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('should reject passengers below 1', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      passengers: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject passengers above 9', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      passengers: 10,
    });
    expect(result.success).toBe(false);
  });

  it('should accept passengers as string (coerced to number)', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      passengers: '2',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.passengers).toBe('number');
    }
  });

  it('should reject from/to not exactly 3 characters', () => {
    const result = searchQuerySchema.safeParse({
      from: 'JFKL',
      to: 'LAX',
      date: '2024-12-25',
      passengers: 1,
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional price_min', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      price_min: 100,
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional price_max', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      price_max: 500,
    });
    expect(result.success).toBe(true);
  });

  it('should accept both price_min and price_max', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      price_min: 100,
      price_max: 500,
    });
    expect(result.success).toBe(true);
  });

  it('should reject negative price_min', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      price_min: -100,
    });
    expect(result.success).toBe(false);
  });

  it('should accept airlines as comma-separated string', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      airlines: 'DL,UA,AA',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data.airlines)).toBe(true);
      expect(result.data.airlines).toEqual(['DL', 'UA', 'AA']);
    }
  });

  it('should accept stops between 0 and 2', () => {
    [0, 1, 2].forEach((stops) => {
      const result = searchQuerySchema.safeParse({
        ...validSearch,
        stops,
      });
      expect(result.success).toBe(true);
    });
  });

  it('should reject stops below 0', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      stops: -1,
    });
    expect(result.success).toBe(false);
  });

  it('should reject stops above 2', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      stops: 3,
    });
    expect(result.success).toBe(false);
  });

  it('should accept duration_max within bounds', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      duration_max: 500,
    });
    expect(result.success).toBe(true);
  });

  it('should reject duration_max below 30', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      duration_max: 29,
    });
    expect(result.success).toBe(false);
  });

  it('should reject duration_max above 2000', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      duration_max: 2001,
    });
    expect(result.success).toBe(false);
  });

  it('should accept cursor string', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      cursor: 'some_cursor_value',
    });
    expect(result.success).toBe(true);
  });

  it('should accept page_size within bounds', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      page_size: 50,
    });
    expect(result.success).toBe(true);
  });

  it('should reject page_size below 1', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      page_size: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject page_size above 100', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      page_size: 101,
    });
    expect(result.success).toBe(false);
  });

  it('should accept page_size as string (coerced to number)', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      page_size: '50',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.page_size).toBe('number');
    }
  });

  it('should accept valid ISO date', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      date: '2024-01-01',
    });
    expect(result.success).toBe(true);
  });

  it('should reject date with month > 12', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      date: '2024-13-01',
    });
    expect(result.success).toBe(false);
  });

  it('should reject date with day > 31', () => {
    const result = searchQuerySchema.safeParse({
      ...validSearch,
      date: '2024-01-32',
    });
    expect(result.success).toBe(false);
  });
});
