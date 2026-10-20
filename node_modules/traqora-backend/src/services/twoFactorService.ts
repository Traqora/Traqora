import * as otp from 'otplib';
import * as QRCode from 'qrcode';
import crypto from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../db/entities/User';

// Configure TOTP
otp.authenticator.options = {
  step: 30, // 30 second window
  window: 1, // allow 1 step before and after for clock skew
  digits: 6,
};

export interface TwoFactorSetupResponse {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export class TwoFactorService {
  private userRepository: Repository<User>;

  constructor(userRepository: Repository<User>) {
    this.userRepository = userRepository;
  }

  /**
   * Generate a new TOTP secret and backup codes for a user
   */
  async generateTwoFactorSetup(walletAddress: string): Promise<TwoFactorSetupResponse> {
    const user = await this.userRepository.findOne({ where: { walletAddress } });
    if (!user) {
      throw new Error('User not found');
    }

    // Generate TOTP secret
    const secret = otp.authenticator.generateSecret();

    // Generate QR code URI
    const qrCodeUri = otp.authenticator.keyuri(
      walletAddress,
      'Traqora',
      secret
    );

    // Generate QR code as data URL
    const qrCode = await QRCode.toDataURL(qrCodeUri);

    // Generate 10 backup codes
    const backupCodes = this.generateBackupCodes();

    // Store secret and backup codes temporarily (not enabled yet)
    user.twoFactorSecret = secret;
    user.backupCodes = backupCodes;
    user.twoFactorEnabled = false; // Not enabled until verified
    await this.userRepository.save(user);

    return {
      secret,
      qrCode,
      backupCodes,
    };
  }

  /**
   * Enable 2FA by verifying the TOTP code
   */
  async enableTwoFactor(walletAddress: string, token: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { walletAddress } });
    if (!user || !user.twoFactorSecret) {
      throw new Error('2FA setup not initiated');
    }

    const isValid = otp.authenticator.verify({
      token,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      throw new Error('Invalid TOTP token');
    }

    // Enable 2FA
    user.twoFactorEnabled = true;
    await this.userRepository.save(user);

    return true;
  }

  /**
   * Verify a TOTP token during login
   */
  async verifyTwoFactorToken(walletAddress: string, token: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { walletAddress } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new Error('2FA not enabled for this user');
    }

    const isValid = otp.authenticator.verify({
      token,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      throw new Error('Invalid TOTP token');
    }

    return true;
  }

  /**
   * Verify a backup code
   */
  async verifyBackupCode(walletAddress: string, code: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { walletAddress } });
    if (!user || !user.twoFactorEnabled || !user.backupCodes) {
      throw new Error('2FA not enabled for this user');
    }

    const codeIndex = user.backupCodes.indexOf(code);
    if (codeIndex === -1) {
      throw new Error('Invalid backup code');
    }

    // Remove the used backup code
    user.backupCodes.splice(codeIndex, 1);
    await this.userRepository.save(user);

    return true;
  }

  /**
   * Disable 2FA for a user
   */
  async disableTwoFactor(walletAddress: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { walletAddress } });
    if (!user) {
      throw new Error('User not found');
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.backupCodes = [];
    await this.userRepository.save(user);
  }

  /**
   * Generate 10 random backup codes
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      // Generate 8-character alphanumeric codes
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Generate new backup codes for an existing 2FA setup
   */
  async regenerateBackupCodes(walletAddress: string): Promise<string[]> {
    const user = await this.userRepository.findOne({ where: { walletAddress } });
    if (!user || !user.twoFactorEnabled) {
      throw new Error('2FA not enabled for this user');
    }

    const newBackupCodes = this.generateBackupCodes();
    user.backupCodes = newBackupCodes;
    await this.userRepository.save(user);

    return newBackupCodes;
  }

  /**
   * Check if user has 2FA enabled
   */
  async isTwoFactorEnabled(walletAddress: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { walletAddress } });
    return user?.twoFactorEnabled || false;
  }
}
