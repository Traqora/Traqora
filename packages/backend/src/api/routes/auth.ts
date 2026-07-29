// @ts-ignore
import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/authService';
import { TwoFactorService } from '../../services/twoFactorService';
import { requireAuth } from '../../middleware/authMiddleware';
import { AppDataSource } from '../../db/dataSource';
import { User } from '../../db/entities/User';

// @ts-ignore
import type { Router as ExpressRouter } from 'express';

export const authRoutes = Router();



// Since AuthService depends on DataSource, we initialize it lazily or singleton-based.
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

        // Auth errors should generally result in 401
        try {
            const result = await authService.verifySignature(walletAddress, signature, walletType);
            res.json(result);
        } catch (authErr: any) {
            if (
                authErr.message.includes('Invalid signature') ||
                authErr.message.includes('Nonce missing or expired') ||
                authErr.message.includes('Unsupported wallet')
            ) {
                res.status(401).json({ error: authErr.message });
            } else if (authErr.message === 'TWO_FACTOR_REQUIRED') {
                res.status(200).json({ requiresTwoFactor: true, walletAddress });
            } else {
                throw authErr;
            }
        }
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
                res.status(401).json({ error: authErr.message });
            } else {
                throw authErr;
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

        try {
            const result = await authService.refreshTokens(refreshToken);
            res.json(result);
        } catch (authErr: any) {
            res.status(401).json({ error: authErr.message });
        }
    } catch (err: any) {
        next(err);
    }
});

authRoutes.post('/logout', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const walletAddress = req.user?.walletAddress;
        if (!walletAddress) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const authService = getAuthService();
        await authService.logout(walletAddress);
        res.json({ message: 'Logged out successfully' });
    } catch (err) {
        next(err);
    }
});

// 2FA Setup - Generate secret and QR code
authRoutes.post('/2fa/setup', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const walletAddress = req.user?.walletAddress;
        if (!walletAddress) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const twoFactorService = getTwoFactorService();
        const result = await twoFactorService.generateTwoFactorSetup(walletAddress);
        res.json(result);
    } catch (err: any) {
        next(err);
    }
});

// 2FA Enable - Verify TOTP token and enable 2FA
authRoutes.post('/2fa/enable', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const walletAddress = req.user?.walletAddress;
        if (!walletAddress) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { token } = req.body;
        if (!token) {
            res.status(400).json({ error: 'Token is required' });
            return;
        }
        const twoFactorService = getTwoFactorService();
        await twoFactorService.enableTwoFactor(walletAddress, token);
        res.json({ message: '2FA enabled successfully' });
    } catch (err: any) {
        if (err.message.includes('Invalid TOTP token')) {
            res.status(400).json({ error: err.message });
        } else {
            next(err);
        }
    }
});

// 2FA Verify - Verify TOTP token during login
authRoutes.post('/2fa/verify', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { walletAddress, token } = req.body;
        if (!walletAddress || !token) {
            res.status(400).json({ error: 'Wallet address and token are required' });
            return;
        }
        const twoFactorService = getTwoFactorService();
        await twoFactorService.verifyTwoFactorToken(walletAddress, token);
        res.json({ verified: true });
    } catch (err: any) {
        if (err.message.includes('Invalid TOTP token') || err.message.includes('2FA not enabled')) {
            res.status(401).json({ error: err.message });
        } else {
            next(err);
        }
    }
});

// 2FA Verify Backup Code
authRoutes.post('/2fa/verify-backup', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { walletAddress, code } = req.body;
        if (!walletAddress || !code) {
            res.status(400).json({ error: 'Wallet address and backup code are required' });
            return;
        }
        const twoFactorService = getTwoFactorService();
        await twoFactorService.verifyBackupCode(walletAddress, code);
        res.json({ verified: true, message: 'Backup code used. Please regenerate your backup codes.' });
    } catch (err: any) {
        if (err.message.includes('Invalid backup code') || err.message.includes('2FA not enabled')) {
            res.status(401).json({ error: err.message });
        } else {
            next(err);
        }
    }
});

// 2FA Disable
authRoutes.post('/2fa/disable', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const walletAddress = req.user?.walletAddress;
        if (!walletAddress) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const twoFactorService = getTwoFactorService();
        await twoFactorService.disableTwoFactor(walletAddress);
        res.json({ message: '2FA disabled successfully' });
    } catch (err: any) {
        next(err);
    }
});

// 2FA Regenerate Backup Codes
authRoutes.post('/2fa/regenerate-backup-codes', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const walletAddress = req.user?.walletAddress;
        if (!walletAddress) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const twoFactorService = getTwoFactorService();
        const newBackupCodes = await twoFactorService.regenerateBackupCodes(walletAddress);
        res.json({ backupCodes: newBackupCodes });
    } catch (err: any) {
        if (err.message.includes('2FA not enabled')) {
            res.status(400).json({ error: err.message });
        } else {
            next(err);
        }
    }
});

// 2FA Status
authRoutes.get('/2fa/status', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const walletAddress = req.user?.walletAddress;
        if (!walletAddress) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const twoFactorService = getTwoFactorService();
        const isEnabled = await twoFactorService.isTwoFactorEnabled(walletAddress);
        res.json({ enabled: isEnabled });
    } catch (err: any) {
        next(err);
    }
});
