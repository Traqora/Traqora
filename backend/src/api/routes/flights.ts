import { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { FlightSearchService } from '../../services/flightSearchService';
import { CabinClass, FlightSearchCriteria, FlightSortBy, SortOrder } from '../../types/flight';
import { asyncHandler } from '../../utils/errorHandler';

const cabinClassValues: CabinClass[] = ['economy', 'premium_economy', 'business', 'first'];
const sortByValues: FlightSortBy[] = ['price', 'duration', 'departure_time', 'rating'];
const sortOrderValues: SortOrder[] = ['asc', 'desc'];

const searchQuerySchema = z.object({
  from: z.string().trim().min(3),
  to: z.string().trim().min(3),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  passengers: z.coerce.number().int().min(1).max(9),
  class: z.enum(cabinClassValues as [CabinClass, ...CabinClass[]]),
  price_min: z.coerce.number().min(0).optional(),
  price_max: z.coerce.number().min(0).optional(),
  airlines: z.string().optional(),
  stops: z.coerce.number().int().min(0).optional(),
  duration_max: z.coerce.number().int().positive().optional(),
  sort: z.enum(sortByValues as [FlightSortBy, ...FlightSortBy[]]).optional(),
  sort_order: z.enum(sortOrderValues as [SortOrder, ...SortOrder[]]).optional(),
  cursor: z.string().optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
});

const parseAirlines = (value?: string): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  const airlines = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return airlines.length > 0 ? airlines : undefined;
};

const buildCriteria = (query: z.infer<typeof searchQuerySchema>): FlightSearchCriteria => {
  return {
    from: query.from,
    to: query.to,
    date: query.date,
    passengers: query.passengers,
    travelClass: query.class,
    priceMin: query.price_min,
    priceMax: query.price_max,
    airlines: parseAirlines(query.airlines),
    stops: query.stops,
    durationMax: query.duration_max,
    sortBy: query.sort || 'price',
    sortOrder: query.sort_order,
    cursor: query.cursor,
    pageSize: query.page_size || 20,
  };
};

export const createFlightRoutes = (
  flightSearchService: FlightSearchService,
  searchRateLimiter: RequestHandler
): Router => {
  const router = Router();

  router.get(
    '/search',
    searchRateLimiter,
    asyncHandler(async (req, res) => {
      const parsed = searchQuerySchema.safeParse(req.query);

      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid search query parameters',
            details: parsed.error.flatten(),
          },
        });
      }

      const criteria = buildCriteria(parsed.data);
      const response = await flightSearchService.searchFlights(criteria);

      return res.status(200).json(response);
    })
  );

  return router;
};