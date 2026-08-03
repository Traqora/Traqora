// @ts-ignore
import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/authService';
import { requireAuth } from '../../middleware/authMiddleware';
import { AppDataSource } from '../../db/dataSource';
import { UnauthorizedError, BadRequestError, NotFoundError } from '../../utils/errors';

export const authRoutes = Router();

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

authRoutes.post('/biometric/register/begin', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const walletAddress = req.user?.walletAddress;
        if (!walletAddress) {
            throw new UnauthorizedError();
        }
        const authService = getAuthService();
        const options = await authService.generateBiometricRegistrationOptions(walletAddress);
        res.json(options);
    } catch (err: any) {
        next(err);
    }
});

authRoutes.post('/biometric/register/complete', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const walletAddress = req.user?.walletAddress;
        if (!walletAddress) {
            throw new UnauthorizedError();
        }
        const { credential, deviceName, credentialType } = req.body;
        if (!credential) {
            throw new BadRequestError('Credential data is required');
        }
        if (credentialType && !['fingerprint', 'face'].includes(credentialType)) {
            throw new BadRequestError('Invalid credential type. Must be "fingerprint" or "face"');
        }
        const authService = getAuthService();
        const result = await authService.registerBiometricCredential(
            walletAddress,
            credential,
            deviceName,
            credentialType
        );
        res.json({ credential: result });
    } catch (err: any) {
        next(err);
    }
});

authRoutes.post('/biometric/authenticate/begin', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { walletAddress } = req.body;
        if (!walletAddress) {
            throw new BadRequestError('Wallet address is required');
        }
        const authService = getAuthService();
        const options = await authService.generateBiometricAuthenticationOptions(walletAddress);
        res.json(options);
    } catch (err: any) {
        if (err.message.includes('No biometric credentials')) {
            next(new NotFoundError(err.message));
        } else {
            next(err);
        }
    }
});

authRoutes.post('/biometric/authenticate/complete', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { walletAddress, assertion } = req.body;
        if (!walletAddress || !assertion) {
            throw new BadRequestError('Wallet address and assertion are required');
        }
        const authService = getAuthService();
        const result = await authService.verifyBiometricAssertion(walletAddress, assertion);

        const tokens = await authService.issueTokens(walletAddress, 'biometric');
        res.json({ ...result, ...tokens });
    } catch (err: any) {
        next(new UnauthorizedError(err.message));
    }
});

authRoutes.post('/biometric/authorize-payment', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const walletAddress = req.user?.walletAddress;
        if (!walletAddress) {
            throw new UnauthorizedError();
        }
        const { assertion, amount, destination, description } = req.body;
        if (!assertion || !amount || !destination) {
            throw new BadRequestError('Assertion, amount, and destination are required');
        }
        const authService = getAuthService();
        const result = await authService.authorizePaymentWithBiometric(
            walletAddress,
            assertion,
            { amount, destination, description }
        );
        res.json(result);
    } catch (err: any) {
        next(err);
    }
});

authRoutes.post('/biometric/authenticate/fallback/begin', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { walletAddress } = req.body;
        if (!walletAddress) {
            throw new BadRequestError('Wallet address is required');
        }
        const authService = getAuthService();
        const options = await authService.generateBiometricFallbackChallenge(walletAddress);
        res.json(options);
    } catch (err: any) {
        if (err.message.includes('No biometric credentials')) {
            next(new NotFoundError(err.message));
        } else {
            next(err);
        }
    }
});

authRoutes.post('/biometric/authenticate/fallback/complete', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { walletAddress, signature, walletType } = req.body;
        if (!walletAddress || !signature || !walletType) {
            throw new BadRequestError('Wallet address, signature, and wallet type are required');
        }
        const authService = getAuthService();
        const tokens = await authService.verifyBiometricFallback(walletAddress, signature, walletType);
        res.json(tokens);
    } catch (err: any) {
        if (
            err.message.includes('Fallback challenge missing') ||
            err.message.includes('Invalid fallback')
        ) {
            next(new UnauthorizedError(err.message));
        } else {
            next(err);
        }
    }
});

authRoutes.get('/biometric/credentials', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const walletAddress = req.user?.walletAddress;
        if (!walletAddress) {
            throw new UnauthorizedError();
        }
        const authService = getAuthService();
        const credentials = await authService.getBiometricCredentials(walletAddress);
        res.json({ credentials });
    } catch (err: any) {
        next(err);
    }
});

authRoutes.delete('/biometric/credentials/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const walletAddress = req.user?.walletAddress;
        if (!walletAddress) {
            throw new UnauthorizedError();
        }
        const authService = getAuthService();
        await authService.removeBiometricCredential(req.params.id, walletAddress);
        res.json({ message: 'Credential removed successfully' });
    } catch (err: any) {
        next(err);
    }
});
