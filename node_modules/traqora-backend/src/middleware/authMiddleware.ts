import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

export const requireAuth: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = String(res.locals?.requestId || 'unknown');
    const respondUnauthorized = (code: string) => {
        res.status(401).json({
            success: false,
            error: {
                code,
                message: 'Unauthorized',
                retryable: false,
                requestId,
                timestamp: new Date().toISOString(),
            },
        });
    };

    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            respondUnauthorized('TOKEN_MISSING');
            return;
        }

        const token = authHeader.split(' ')[1];

        if (!token) {
            respondUnauthorized('TOKEN_MISSING');
            return;
        }

        // Verify token
        jwt.verify(token, config.jwtSecret, (err: any, decoded: any) => {
            if (err) {
                if (err.name === 'TokenExpiredError') {
                    respondUnauthorized('TOKEN_EXPIRED');
                    return;
                }

                respondUnauthorized('TOKEN_INVALID');
                return;
            }

            const payload = decoded as { walletAddress: string; walletType: string };

            // Attach to request
            req.user = {
                walletAddress: payload.walletAddress,
                walletType: payload.walletType,
            };

            next();
        });
    } catch (error) {
        logger.error('Auth middleware error', {
            error: error instanceof Error ? error.message : String(error),
            requestId,
            operation: `${req.method} ${req.originalUrl || req.path}`,
            userId: req.user?.walletAddress || 'anonymous',
        });
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal Server Error',
                retryable: false,
                requestId,
                timestamp: new Date().toISOString(),
            },
        });
    }
};
