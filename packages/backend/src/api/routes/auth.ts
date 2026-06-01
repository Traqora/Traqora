// @ts-ignore
import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/authService';
import { requireAuth } from '../../middleware/authMiddleware';
import { AppDataSource } from '../../db/dataSource';
import { UnauthorizedError } from '../../utils/errors';

export const authRoutes = Router();



// Since AuthService depends on DataSource, we initialize it lazily or singleton-based.
const getAuthService = () => new AuthService(AppDataSource);

authRoutes.post('/challenge', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { walletAddress } = req.body;
        const authService = getAuthService();
        const result = await authService.generateChallenge(walletAddress);
        res.json(result);
    } catch (err: any) {
        next(err);
    }
});

authRoutes.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { walletAddress, signature, walletType } = req.body;
        const authService = getAuthService();

        const result = await authService.verifySignature(walletAddress, signature, walletType);
        res.json(result);
    } catch (err: any) {
        if (
            err.message.includes('Invalid signature') ||
            err.message.includes('Nonce missing or expired') ||
            err.message.includes('Unsupported wallet')
        ) {
            next(new UnauthorizedError(err.message));
        } else {
            next(err);
        }
    }
});

authRoutes.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { refreshToken } = req.body;
        const authService = getAuthService();

        const result = await authService.refreshTokens(refreshToken);
        res.json(result);
    } catch (err: any) {
        next(new UnauthorizedError(err.message));
    }
});

authRoutes.post('/logout', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const walletAddress = req.user?.walletAddress;
        if (!walletAddress) {
            throw new UnauthorizedError();
        }
        const authService = getAuthService();
        await authService.logout(walletAddress);
        res.json({ message: 'Logged out successfully' });
    } catch (err) {
        next(err);
    }
});
