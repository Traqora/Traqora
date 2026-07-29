// @ts-ignore
import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/authService';
import { TwoFactorService } from '../../services/twoFactorService';
import { requireAuth } from '../../middleware/authMiddleware';
import { AppDataSource } from '../../db/dataSource';


export const authRoutes = Router();

const getAuthService = () => new AuthService(AppDataSource);
const getTwoFactorService = () => new TwoFactorService(AppDataSource.getRepository(User));

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


    } catch (err: any) {
        next(err);
    }
});


        } else {
            next(err);
        }
    }
});


    } catch (err: any) {
        next(err);
    }
});
