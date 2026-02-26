import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

export const requireAuth: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                error: 'Unauthorized',
                code: 'TOKEN_MISSING',
            });
            return;
        }

        const token = authHeader.split(' ')[1];

        if (!token) {
            res.status(401).json({
                error: 'Unauthorized',
                code: 'TOKEN_MISSING',
            });
            return;
        }

        // Verify token
        jwt.verify(token, config.jwtSecret, (err, decoded) => {
            if (err) {
                if (err.name === 'TokenExpiredError') {
                    res.status(401).json({
                        error: 'Unauthorized',
                        code: 'TOKEN_EXPIRED',
                    });
                    return;
                }

                res.status(401).json({
                    error: 'Unauthorized',
                    code: 'TOKEN_INVALID',
                });
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
        logger.error('Auth middleware error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
