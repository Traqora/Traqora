import { requireAuth } from '../../src/middleware/authMiddleware';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config';

describe('authMiddleware', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockRequest = {
            headers: {},
        };
        mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        mockNext = jest.fn();
    });

    it('should return 401 if Authorization header is missing', async () => {
        await requireAuth(mockRequest as Request, mockResponse as Response, mockNext);
        expect(mockResponse.status).toHaveBeenCalledWith(401);
        expect(mockResponse.json).toHaveBeenCalledWith({
            error: 'Unauthorized',
            code: 'TOKEN_MISSING'
        });
    });

    it('should populate req.user if token is valid', async () => {
        const validToken = jwt.sign({ walletAddress: 'G123', walletType: 'freighter' }, config.jwtSecret);
        mockRequest.headers = { authorization: `Bearer ${validToken}` };

        await requireAuth(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect((mockRequest as Request).user).toMatchObject({
            walletAddress: 'G123',
            walletType: 'freighter'
        });
    });

    it('should return 401 if token is expired', async () => {
        const expiredToken = jwt.sign({ walletAddress: 'G123', walletType: 'freighter' }, config.jwtSecret, { expiresIn: '-1s' });
        mockRequest.headers = { authorization: `Bearer ${expiredToken}` };

        await requireAuth(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockResponse.status).toHaveBeenCalledWith(401);
        expect(mockResponse.json).toHaveBeenCalledWith({
            error: 'Unauthorized',
            code: 'TOKEN_EXPIRED'
        });
    });
});
