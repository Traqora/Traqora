import { logger } from '../utils/logger';
// axios removed since the service uses mock data internally


// Interface for price data
export interface FlightPrice {
  flightId: string;
  price: number;
  currency: string;
  timestamp: Date;
  source: string;
}

export class PriceOracleService {
  private static instance: PriceOracleService;
  // API configuration (currently unused in mock implementation)
  // private readonly API_URL = process.env.ORACLE_API_URL || 'https://api.mock-airline-oracle.com/v1/prices';
  // private readonly API_KEY = process.env.ORACLE_API_KEY || 'mock-key';

  private constructor() {}

  public static getInstance(): PriceOracleService {
    if (!PriceOracleService.instance) {
      PriceOracleService.instance = new PriceOracleService();
    }
    return PriceOracleService.instance;
  }

  /**
   * Fetches current price for a list of flights
   * Implements retry logic with exponential backoff
   */
  public async fetchPrices(flightIds: string[]): Promise<FlightPrice[]> {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        // In a real scenario, we would batch requests or make parallel calls
        // Here we simulate a single batch call
        const response = await this.mockApiCall(flightIds);
        return response;
      } catch (error) {
        retries++;
        const delay = Math.pow(2, retries) * 1000;
        logger.warn(`Failed to fetch prices. Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
        if (retries === maxRetries) {
          logger.error('Max retries reached. Failed to fetch prices from Oracle.', error);
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return [];
  }

  // Simulate API call for demonstration
  private async mockApiCall(flightIds: string[]): Promise<FlightPrice[]> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Randomly generate prices based on a base price to simulate fluctuations
    return flightIds.map(id => ({
      flightId: id,
      price: 100 + Math.random() * 50, // Random price between 100 and 150
      currency: 'USD',
      timestamp: new Date(),
      source: 'MockOracle'
    }));
  }
}
