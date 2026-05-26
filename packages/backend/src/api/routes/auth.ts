import { Router } from 'express';
import { z } from 'zod';
import { AuthService } from '../../services/authService';
import { requireAuth } from '../../middleware/authMiddleware';
import { AppDataSource } from '../../db/dataSource';

export const authRoutes = Router();

// Zod schemas for request validation
const challengeSchema = z.object({
    walletAddress: z.string().min(56).max(56).startsWith('G'),
});

const verifySchema = z.object({
    walletAddress: z.string().min(56).max(56).startsWith('G'),
    signature: z.string().min(1),
    walletType: z.enum(['freighter', 'albedo', 'rabet']),
});

const refreshSchema = z.object({
    refreshToken: z.string().min(1),
});

// Since AuthService depends on DataSource, we initialize it lazily or singleton-based.
const getAuthService = () => new AuthService(AppDataSource);

authRoutes.post('/challenge', async (req, res, next) => {
    try {
        const { walletAddress } = challengeSchema.parse(req.body);
        const authService = getAuthService();
        const result = await authService.generateChallenge(walletAddress);
        res.json(result);
    } catch (err: any) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation Error', issues: err.errors });
        } else {
            next(err);
        }
    }
});

authRoutes.post('/verify', async (req, res, next) => {
    try {
        const { walletAddress, signature, walletType } = verifySchema.parse(req.body);
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
            } else {
                throw authErr;
            }
        }
    } catch (err: any) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation Error', issues: err.errors });
        } else {
            next(err);
        }
    }
});

authRoutes.post('/refresh', async (req, res, next) => {
    try {
        const { refreshToken } = refreshSchema.parse(req.body);
        const authService = getAuthService();

        try {
            const result = await authService.refreshTokens(refreshToken);
            res.json(result);
        } catch (authErr: any) {
            res.status(401).json({ error: authErr.message });
        }
    } catch (err: any) {
        if (err instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation Error', issues: err.errors });
        } else {
            next(err);
        }
    }
});

authRoutes.post('/logout', requireAuth, async (req, res, next) => {
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
