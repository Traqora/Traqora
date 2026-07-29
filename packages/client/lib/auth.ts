"use client"

import { api } from "@/lib/api"

export interface AuthChallenge {
  nonce: string
  expiresIn: number
  message: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface TwoFactorSetup {
  secret: string
  qrCode: string
  backupCodes: string[]
}

export interface AuthResponse {
  success: boolean
  data?: AuthTokens
  error?: {
    code: string
    message: string
  }
}

export class AuthService {
  private static readonly CHALLENGE_ENDPOINT = '/api/v1/auth/challenge'
  private static readonly VERIFY_ENDPOINT = '/api/v1/auth/verify'
  private static readonly VERIFY_2FA_ENDPOINT = '/api/v1/auth/verify-2fa'
  private static readonly REFRESH_ENDPOINT = '/api/v1/auth/refresh'
  private static readonly LOGOUT_ENDPOINT = '/api/v1/auth/logout'
  private static readonly TWO_FACTOR_SETUP_ENDPOINT = '/api/v1/auth/2fa/setup'
  private static readonly TWO_FACTOR_ENABLE_ENDPOINT = '/api/v1/auth/2fa/enable'
  private static readonly TWO_FACTOR_DISABLE_ENDPOINT = '/api/v1/auth/2fa/disable'
  private static readonly TWO_FACTOR_STATUS_ENDPOINT = '/api/v1/auth/2fa/status'
  private static readonly TWO_FACTOR_REGENERATE_ENDPOINT = '/api/v1/auth/2fa/regenerate-backup-codes'

  static async getChallenge(walletAddress: string): Promise<AuthChallenge> {
    const response = await api.post(this.CHALLENGE_ENDPOINT, {
      walletAddress,
    })

    if (!response.ok) {
      throw new Error('Failed to get auth challenge')
    }

    const data = await response.json()
    return data.data
  }

  static async verifySignature(
    walletAddress: string,
    signature: string,
    walletType: string
  ): Promise<AuthTokens | { requiresTwoFactor: boolean; walletAddress: string }> {
    const response = await api.post(this.VERIFY_ENDPOINT, {
      walletAddress,
      signature,
      walletType,
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error?.message || 'Authentication failed')
    }

    const data = await response.json()
    return data
  }

  static async verifyTwoFactor(
    walletAddress: string,
    token: string,
    isBackupCode: boolean = false
  ): Promise<AuthTokens> {
    const response = await api.post(this.VERIFY_2FA_ENDPOINT, {
      walletAddress,
      token,
      isBackupCode,
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error?.message || '2FA verification failed')
    }

    const data = await response.json()
    return data
  }

  static async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const response = await api.post(this.REFRESH_ENDPOINT, {
      refreshToken,
    })

    if (!response.ok) {
      throw new Error('Token refresh failed')
    }

    const data = await response.json()
    return data.data
  }

  static async logout(): Promise<void> {
    const response = await api.post(this.LOGOUT_ENDPOINT, {})

    if (!response.ok) {
      throw new Error('Logout failed')
    }
  }

  static async setupTwoFactor(): Promise<TwoFactorSetup> {
    const response = await api.post(this.TWO_FACTOR_SETUP_ENDPOINT, {})

    if (!response.ok) {
      throw new Error('Failed to setup 2FA')
    }

    const data = await response.json()
    return data
  }

  static async enableTwoFactor(token: string): Promise<void> {
    const response = await api.post(this.TWO_FACTOR_ENABLE_ENDPOINT, { token })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error?.message || 'Failed to enable 2FA')
    }
  }

  static async disableTwoFactor(): Promise<void> {
    const response = await api.post(this.TWO_FACTOR_DISABLE_ENDPOINT, {})

    if (!response.ok) {
      throw new Error('Failed to disable 2FA')
    }
  }

  static async getTwoFactorStatus(): Promise<{ enabled: boolean }> {
    const response = await api.get(this.TWO_FACTOR_STATUS_ENDPOINT)

    if (!response.ok) {
      throw new Error('Failed to get 2FA status')
    }

    const data = await response.json()
    return data
  }

  static async regenerateBackupCodes(): Promise<{ backupCodes: string[] }> {
    const response = await api.post(this.TWO_FACTOR_REGENERATE_ENDPOINT, {})

    if (!response.ok) {
      throw new Error('Failed to regenerate backup codes')
    }

    const data = await response.json()
    return data
  }
}