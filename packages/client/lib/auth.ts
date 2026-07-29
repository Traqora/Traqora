"use client"

import { api } from "@/lib/api"
import { API_BASE_URL } from "@/lib/api"

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

export interface BiometricCredential {
  id: string
  credentialId: string
  type: "fingerprint" | "face"
  deviceName: string | null
  enrolledAt: string
  lastUsedAt: string | null
}

export interface WebAuthnRegistrationOptions {
  challenge: string
  rp: { name: string; id: string }
  user: { id: string; name: string; displayName: string }
  pubKeyCredParams: Array<{ type: "public-key"; alg: number }>
  timeout: number
  attestation: "none" | "direct" | "indirect"
  authenticatorSelection: {
    authenticatorAttachment: "platform" | "cross-platform"
    residentKey: "preferred" | "required" | "discouraged"
    userVerification: "required" | "preferred" | "discouraged"
  }
}

export interface WebAuthnAuthenticationOptions {
  challenge: string
  timeout: number
  rpId: string
  allowCredentials: Array<{
    type: "public-key"
    id: string
    transports?: string[]
  }>
  userVerification: "required" | "preferred" | "discouraged"
}

function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials !== "undefined"
  )
}

function base64urlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/")
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4))
  const binary = atob(base64 + pad)
  const buffer = new ArrayBuffer(binary.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i)
  }
  return buffer
}

function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export class AuthService {
  private static readonly CHALLENGE_ENDPOINT = '/api/v1/auth/challenge'
  private static readonly VERIFY_ENDPOINT = '/api/v1/auth/verify'
  private static readonly VERIFY_2FA_ENDPOINT = '/api/v1/auth/verify-2fa'
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

