// @ts-ignore
import { generateOpenApiDocument } from 'zod-to-openapi';
import { challengeSchema, verifySchema, refreshSchema, createBookingSchema, createRefundSchema } from '../schemas';

// @ts-ignore
import type { OpenAPIObject } from 'zod-to-openapi';

// Define OpenAPI document configuration
const openApiDocument = generateOpenApiDocument({
  info: {
    title: 'Traqora Backend API',
    version: '1.0.0',
    description: 'Traqora Backend API - Stellar blockchain travel booking platform',
  },
  // Add security schemes for JWT authentication
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      apiKey: {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
      },
      adminApiKey: {
        type: 'apiKey',
        name: 'X-Admin-API-Key',
        in: 'header',
      },
    },
  },
  // Define paths and operations
  paths: {
    '/api/v1/auth/challenge': {
      post: {
        operationId: 'authChallenge',
        summary: 'Generate authentication challenge',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: challengeSchema,
            },
          },
        },
        responses: {
          '200': {
            description: 'Challenge generated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    challenge: { type: 'string' },
                    expiresAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    error: {
                      type: 'object',
                      properties: {
                        message: { type: 'string' },
                        code: { type: 'string' },
                        details: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/verify': {
      post: {
        operationId: 'authVerify',
        summary: 'Verify authentication signature',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: verifySchema,
            },
          },
        },
        responses: {
          '200': {
            description: 'Authentication successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' },
                    refreshToken: { type: 'string' },
                    expiresAt: { type: 'string', format: 'date-time' },
                    user: {
                      type: 'object',
                      properties: {
                        walletAddress: { type: 'string' },
                        walletType: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    error: {
                      type: 'object',
                      properties: {
                        message: { type: 'string' },
                        code: { type: 'string' },
                        details: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Invalid signature or unauthorized',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        operationId: 'authRefresh',
        summary: 'Refresh authentication tokens',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: refreshSchema,
            },
          },
        },
        responses: {
          '200': {
            description: 'Tokens refreshed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' },
                    refreshToken: { type: 'string' },
                    expiresAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    error: {
                      type: 'object',
                      properties: {
                        message: { type: 'string' },
                        code: { type: 'string' },
                        details: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Invalid refresh token',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/bookings': {
      post: {
        operationId: 'createBooking',
        summary: 'Create a new booking',
        security: [
          { bearerAuth: [] },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: createBookingSchema,
            },
          },
        },
        responses: {
          '201': {
            description: 'Booking created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        flightId: { type: 'string' },
                        status: { type: 'string', enum: ['pending', 'confirmed', 'failed'] },
                        price: { type: 'string' },
                        currency: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    error: {
                      type: 'object',
                      properties: {
                        message: { type: 'string' },
                        code: { type: 'string' },
                        details: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/refunds/request': {
      post: {
        operationId: 'requestRefund',
        summary: 'Request a refund',
        security: [
          { bearerAuth: [] },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: createRefundSchema,
            },
          },
        },
        responses: {
          '201': {
            description: 'Refund request created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        bookingId: { type: 'string' },
                        status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'processing', 'completed', 'failed'] },
                        reason: { type: 'string' },
                        requestedAt: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    error: {
                      type: 'object',
                      properties: {
                        message: { type: 'string' },
                        code: { type: 'string' },
                        details: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

// Export for use in other modules
export { openApiDocument };
