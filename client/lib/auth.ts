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
  private static readonly REFRESH_ENDPOINT = '/api/v1/auth/refresh'
  private static readonly LOGOUT_ENDPOINT = '/api/v1/auth/logout'

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
  ): Promise<AuthTokens> {
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
    return data.data
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
}