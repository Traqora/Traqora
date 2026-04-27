import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { requireAuth } from '../../middleware/authMiddleware';
import { initDataSource } from '../../db/dataSource';
import { DataSource } from 'typeorm';
import { logger } from '../../utils/logger';
import { 
  AirlineAdapterRegistry, 
  LufthansaAdapter, 
  AirFranceAdapter, 
  BritishAirwaysAdapter 
} from '../../services/amadeus/airlineAdapters';
import { AirlineFlightData } from '../../types/flightSync';

const router = Router();

// Initialize airline adapter registry
const registry = new AirlineAdapterRegistry();

// Register default adapters (in production, these would be loaded from config)
registry.register(new LufthansaAdapter(process.env.LUFTHANSA_API_KEY || 'demo-key'));
registry.register(new AirFranceAdapter(process.env.AIRFRANCE_API_KEY || 'demo-key'));
registry.register(new BritishAirwaysAdapter(process.env.BRITISH_AIRWAYS_API_KEY || 'demo-key'));

// Validation schemas
const flightQuerySchema = z.object({
  airlineCode: z.string().length(2).optional(),
  flightNumber: z.string().optional(),
  departureAirport: z.string().length(3).optional(),
  arrivalAirport: z.string().length(3).optional(),
  date: z.string().datetime().optional(),
  status: z.enum(['SCHEDULED', 'DELAYED', 'CANCELLED', 'BOARDING', 'DEPARTED', 'ARRIVED']).optional(),
});

const flightStatusSchema = z.object({
  flightNumber: z.string().min(1),
  departureDate: z.string().datetime(),
});

const airlineConfigSchema = z.object({
  name: z.string().min(1).max(100),
  airlineCode: z.string().length(2),
  apiKey: z.string().min(1),
  apiEndpoint: z.string().url().optional(),
  priority: z.number().int().min(1).max(10).default(5),
  enabled: z.boolean().default(true),
});

// Helper function to get database connection
async function getDataSource(): Promise<DataSource> {
  return await initDataSource();
}

/**
 * GET /api/v1/airlines
 * Get all supported airlines
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const adapters = registry.getAllAdapters();
  
  const airlines = adapters.map(adapter => ({
    code: adapter.airlineCode,
    name: adapter.name,
    priority: adapter.priority,
    metadata: adapter.getMetadata(),
    status: 'active', // In a real implementation, this would come from health checks
  }));

  return res.json({
    success: true,
    data: airlines,
    count: airlines.length,
  });
}));

/**
 * GET /api/v1/airlines/:code
 * Get specific airline information
 */
router.get('/:code', asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.params;
  
  const adapter = registry.getAdapter(code.toUpperCase());
  
  if (!adapter) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Airline not found',
        code: 'AIRLINE_NOT_FOUND',
      },
    });
  }

  const isHealthy = await adapter.healthCheck();
  
  return res.json({
    success: true,
    data: {
      code: adapter.airlineCode,
      name: adapter.name,
      priority: adapter.priority,
      metadata: adapter.getMetadata(),
      status: isHealthy ? 'healthy' : 'unhealthy',
      lastHealthCheck: new Date().toISOString(),
    },
  });
}));

/**
 * GET /api/v1/airlines/:code/flights
 * Get flights for a specific airline
 */
router.get('/:code/flights', asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.params;
  const query = flightQuerySchema.parse(req.query);
  
  const adapter = registry.getAdapter(code.toUpperCase());
  
  if (!adapter) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Airline not found',
        code: 'AIRLINE_NOT_FOUND',
      },
    });
  }

  try {
    const filters: any = {};
    if (query.airlineCode) filters.airline = query.airlineCode;
    if (query.flightNumber) filters.flightPattern = query.flightNumber;
    if (query.date) filters.date = query.date;
    
    const flights = await adapter.fetchFlights(filters);
    
    // Apply additional filtering if needed
    let filteredFlights = flights;
    
    if (query.departureAirport) {
      filteredFlights = filteredFlights.filter(f => 
        f.departureAirport === query.departureAirport.toUpperCase()
      );
    }
    
    if (query.arrivalAirport) {
      filteredFlights = filteredFlights.filter(f => 
        f.arrivalAirport === query.arrivalAirport.toUpperCase()
      );
    }
    
    if (query.status) {
      filteredFlights = filteredFlights.filter(f => 
        f.status === query.status
      );
    }

    return res.json({
      success: true,
      data: filteredFlights,
      count: filteredFlights.length,
      filters: query,
    });
  } catch (error: any) {
    logger.error(`Failed to fetch flights for airline ${code}`, error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch flights',
        code: 'FLIGHT_FETCH_FAILED',
        details: error.message,
      },
    });
  }
}));

/**
 * GET /api/v1/airlines/:code/flights/:flightNumber
 * Get specific flight information
 */
router.get('/:code/flights/:flightNumber', asyncHandler(async (req: Request, res: Response) => {
  const { code, flightNumber } = req.params;
  const { date } = req.query;
  
  if (!date || typeof date !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Departure date is required (date parameter)',
        code: 'MISSING_DATE',
      },
    });
  }

  const adapter = registry.getAdapter(code.toUpperCase());
  
  if (!adapter) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Airline not found',
        code: 'AIRLINE_NOT_FOUND',
      },
    });
  }

  try {
    const flightData = await adapter.fetchFlightData(flightNumber, date);
    
    if (!flightData) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Flight not found',
          code: 'FLIGHT_NOT_FOUND',
        },
      });
    }

    return res.json({
      success: true,
      data: flightData,
    });
  } catch (error: any) {
    logger.error(`Failed to fetch flight ${flightNumber} for airline ${code}`, error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch flight data',
        code: 'FLIGHT_DATA_FAILED',
        details: error.message,
      },
    });
  }
}));

/**
 * GET /api/v1/airlines/:code/flights/:flightNumber/status
 * Get flight status
 */
router.get('/:code/flights/:flightNumber/status', asyncHandler(async (req: Request, res: Response) => {
  const { code, flightNumber } = req.params;
  const { date } = req.query;
  
  if (!date || typeof date !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Departure date is required (date parameter)',
        code: 'MISSING_DATE',
      },
    });
  }

  const adapter = registry.getAdapter(code.toUpperCase());
  
  if (!adapter) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Airline not found',
        code: 'AIRLINE_NOT_FOUND',
      },
    });
  }

  try {
    const flightStatus = await adapter.fetchFlightStatus(flightNumber, date);
    
    if (!flightStatus) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Flight status not found',
          code: 'FLIGHT_STATUS_NOT_FOUND',
        },
      });
    }

    return res.json({
      success: true,
      data: {
        flightNumber,
        airlineCode: code.toUpperCase(),
        departureDate: date,
        ...flightStatus,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error(`Failed to fetch flight status for ${flightNumber} (${code})`, error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch flight status',
        code: 'FLIGHT_STATUS_FAILED',
        details: error.message,
      },
    });
  }
}));

/**
 * GET /api/v1/airlines/health
 * Health check for all airline adapters
 */
router.get('/health', asyncHandler(async (_req: Request, res: Response) => {
  const adapters = registry.getAllAdapters();
  
  const healthChecks = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        const isHealthy = await adapter.healthCheck();
        return {
          code: adapter.airlineCode,
          name: adapter.name,
          status: isHealthy ? 'healthy' : 'unhealthy',
          responseTime: isHealthy ? '<1000ms' : 'timeout',
          lastChecked: new Date().toISOString(),
        };
      } catch (error) {
        return {
          code: adapter.airlineCode,
          name: adapter.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          lastChecked: new Date().toISOString(),
        };
      }
    })
  );

  const healthyCount = healthChecks.filter(h => h.status === 'healthy').length;
  const overallStatus = healthyCount === healthChecks.length ? 'healthy' : 'degraded';

  return res.json({
    success: true,
    data: {
      overallStatus,
      healthyCount,
      totalCount: healthChecks.length,
      adapters: healthChecks,
    },
  });
}));

/**
 * GET /api/v1/airlines/search
 * Search flights across all airlines
 */
router.get('/search', asyncHandler(async (req: Request, res: Response) => {
  const query = flightQuerySchema.parse(req.query);
  const adapters = registry.getAllAdapters();
  
  const allFlights: AirlineFlightData[] = [];
  const errors: Array<{ airline: string; error: string }> = [];

  // Query all adapters in parallel
  await Promise.all(
    adapters.map(async (adapter) => {
      try {
        const filters: any = {};
        if (query.airlineCode && query.airlineCode === adapter.airlineCode) {
          filters.airline = query.airlineCode;
        }
        if (query.flightNumber) filters.flightPattern = query.flightNumber;
        if (query.date) filters.date = query.date;
        
        const flights = await adapter.fetchFlights(filters);
        allFlights.push(...flights);
      } catch (error: any) {
        errors.push({
          airline: adapter.name,
          error: error.message || 'Unknown error',
        });
        logger.warn(`Failed to search flights for ${adapter.name}`, error);
      }
    })
  );

  // Apply additional filtering
  let filteredFlights = allFlights;
  
  if (query.airlineCode) {
    filteredFlights = filteredFlights.filter(f => 
      f.airlineCode === query.airlineCode.toUpperCase()
    );
  }
  
  if (query.departureAirport) {
    filteredFlights = filteredFlights.filter(f => 
      f.departureAirport === query.departureAirport.toUpperCase()
    );
  }
  
  if (query.arrivalAirport) {
    filteredFlights = filteredFlights.filter(f => 
      f.arrivalAirport === query.arrivalAirport.toUpperCase()
    );
  }
  
  if (query.status) {
    filteredFlights = filteredFlights.filter(f => 
      f.status === query.status
    );
  }

  return res.json({
    success: true,
    data: {
      flights: filteredFlights,
      count: filteredFlights.length,
      searchedAirlines: adapters.length,
      errors: errors.length > 0 ? errors : undefined,
      filters: query,
    },
  });
}));

/**
 * POST /api/v1/airlines/:code/refresh
 * Refresh flight data for a specific airline (admin only)
 */
router.post('/:code/refresh', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.params;
  
  // Check if user has admin privileges (simplified check)
  const walletAddress = (req as any).user?.walletAddress;
  const isAdmin = process.env.ADMIN_WALLETS?.split(',').includes(walletAddress);
  
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Admin privileges required',
        code: 'INSUFFICIENT_PRIVILEGES',
      },
    });
  }
  
  const adapter = registry.getAdapter(code.toUpperCase());
  
  if (!adapter) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Airline not found',
        code: 'AIRLINE_NOT_FOUND',
      },
    });
  }

  try {
    // Trigger a refresh by fetching recent flights
    const today = new Date().toISOString().split('T')[0];
    const flights = await adapter.fetchFlights({ date: today });
    
    logger.info(`Refreshed flight data for airline ${code}: ${flights.length} flights`);
    
    return res.json({
      success: true,
      data: {
        message: 'Flight data refreshed successfully',
        airline: code.toUpperCase(),
        flightsUpdated: flights.length,
        refreshedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error(`Failed to refresh flight data for airline ${code}`, error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to refresh flight data',
        code: 'REFRESH_FAILED',
        details: error.message,
      },
    });
  }
}));

export { router as airlineRoutes };
