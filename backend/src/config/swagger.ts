import swaggerJsdoc from 'swagger-jsdoc';
import { SwaggerDefinition } from 'swagger-jsdoc';

const swaggerDefinition: SwaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Traqora API',
    version: '1.0.0',
    description: 'Traqora Backend API - Stellar blockchain travel booking platform',
    contact: {
      name: 'Traqora Support',
      email: 'support@traqora.io',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: process.env.API_BASE_URL || 'http://localhost:3001',
      description: 'Development server',
    },
    {
      url: 'https://api.traqora.io',
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT authentication token',
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Admin-API-Key',
        description: 'Admin API key for administrative access',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Error message' },
              code: { type: 'string', description: 'Error code' },
              details: { type: 'object', description: 'Additional error details' },
            },
          },
        },
      },
      Success: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            description: 'Response data',
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          walletAddress: { type: 'string', description: 'Stellar wallet address' },
          walletType: { type: 'string', enum: ['freighter', 'albedo', 'rabet'] },
          createdAt: { type: 'string', format: 'date-time' },
          lastLoginAt: { type: 'string', format: 'date-time' },
        },
      },
      Passenger: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          sorobanAddress: { type: 'string' },
        },
      },
      Flight: {
        type: 'object',
        properties: {
          flightNumber: { type: 'string' },
          airlineCode: { type: 'string' },
          departureAirport: { type: 'string' },
          arrivalAirport: { type: 'string' },
          scheduledDeparture: { type: 'string', format: 'date-time' },
          scheduledArrival: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['SCHEDULED', 'DELAYED', 'CANCELLED', 'BOARDING', 'DEPARTED', 'ARRIVED'] },
          price: { type: 'number' },
          priceCurrency: { type: 'string' },
        },
      },
      Booking: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string' },
          flightId: { type: 'string' },
          passengers: { type: 'array', items: { $ref: '#/components/schemas/Passenger' } },
          status: { type: 'string', enum: ['pending', 'confirmed', 'cancelled'] },
          totalPrice: { type: 'number' },
          currency: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Refund: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          bookingId: { type: 'string', format: 'uuid' },
          reason: { type: 'string', enum: ['flight_cancelled', 'flight_delayed', 'customer_request', 'duplicate_booking', 'service_issue', 'other'] },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'processed'] },
          requestedAmount: { type: 'number' },
          approvedAmount: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      LoyaltyAccount: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          totalPoints: { type: 'number' },
          availablePoints: { type: 'number' },
          tier: { type: 'string', enum: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] },
          nextTier: { type: 'string' },
          progress: { type: 'object' },
        },
      },
      Wallet: {
        type: 'object',
        properties: {
          connected: { type: 'boolean' },
          address: { type: 'string' },
          balances: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                asset: { type: 'string' },
                balance: { type: 'string' },
                limit: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
  tags: [
    { name: 'Authentication', description: 'User authentication and wallet connection' },
    { name: 'Users', description: 'User profile and passenger management' },
    { name: 'Flights', description: 'Flight search and booking' },
    { name: 'Bookings', description: 'Booking management and payments' },
    { name: 'Refunds', description: 'Refund requests and processing' },
    { name: 'Loyalty', description: 'Loyalty program and points' },
    { name: 'Airlines', description: 'Airline management and flight data' },
    { name: 'Wallet', description: 'Stellar wallet operations' },
    { name: 'Admin', description: 'Administrative operations' },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: [
    './src/api/routes/*.ts',
    './src/api/routes/admin/*.ts',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
