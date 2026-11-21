// @ts-ignore
import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/authService';
import { TwoFactorService } from '../../services/twoFactorService';
import { requireAuth } from '../../middleware/authMiddleware';
import { AppDataSource } from '../../db/dataSource';


// @ts-ignore
import type { Router as ExpressRouter } from 'express';

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
        next(err);
    }
});

// Complete login with 2FA token
authRoutes.post('/verify-2fa', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { walletAddress, token, isBackupCode } = req.body;
        const authService = getAuthService();

        try {
            const result = await authService.verifyTwoFactorAndIssueTokens(
                walletAddress,
                token,
                isBackupCode || false
            );
            res.json(result);
        } catch (authErr: any) {
            if (
                authErr.message.includes('Invalid TOTP token') ||
                authErr.message.includes('Invalid backup code') ||
                authErr.message.includes('2FA not enabled')
            ) {
                next(new UnauthorizedError(authErr.message));
            } else {
                next(authErr);
            }
        }
    } catch (err: any) {
        next(err);
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
