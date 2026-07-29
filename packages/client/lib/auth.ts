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
  private static readonly REFRESH_ENDPOINT = '/api/v1/auth/refresh'
  private static readonly LOGOUT_ENDPOINT = '/api/v1/auth/logout'
  private static readonly BIOMETRIC_REGISTER_BEGIN = '/api/v1/auth/biometric/register/begin'
  private static readonly BIOMETRIC_REGISTER_COMPLETE = '/api/v1/auth/biometric/register/complete'
  private static readonly BIOMETRIC_AUTH_BEGIN = '/api/v1/auth/biometric/authenticate/begin'
  private static readonly BIOMETRIC_AUTH_COMPLETE = '/api/v1/auth/biometric/authenticate/complete'
  private static readonly BIOMETRIC_CREDENTIALS = '/api/v1/auth/biometric/credentials'

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

  static async isWebAuthnSupported(): Promise<boolean> {
    return isWebAuthnAvailable()
  }

  static async registerBiometric(
    walletAddress: string,
    deviceName?: string
  ): Promise<BiometricCredential> {
    if (!isWebAuthnAvailable()) {
      throw new Error('WebAuthn is not available on this device')
    }

    const authToken = getAccessToken()
    if (!authToken) {
      throw new Error('Not authenticated')
    }

    const beginResponse = await fetch(
      `${API_BASE_URL}${this.BIOMETRIC_REGISTER_BEGIN}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ walletAddress }),
      }
    )

    if (!beginResponse.ok) {
      const err = await beginResponse.json()
      throw new Error(err.error?.message || 'Failed to start biometric registration')
    }

    const options: WebAuthnRegistrationOptions = await beginResponse.json()

    const publicKey: PublicKeyCredentialCreationOptions = {
      challenge: base64urlToArrayBuffer(options.challenge),
      rp: options.rp,
      user: {
        ...options.user,
        id: base64urlToArrayBuffer(options.user.id),
      },
      pubKeyCredParams: options.pubKeyCredParams,
      timeout: options.timeout,
      attestation: options.attestation,
      authenticatorSelection: options.authenticatorSelection,
    }

    const credential = (await navigator.credentials.create({
      publicKey,
    })) as PublicKeyCredential

    if (!credential) {
      throw new Error('Biometric registration was cancelled')
    }

    const response = credential.response as AuthenticatorAttestationResponse

    const credentialData = {
      id: credential.id,
      rawId: arrayBufferToBase64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
        attestationObject: arrayBufferToBase64url(response.attestationObject),
        transports: response.getTransports ? response.getTransports() : undefined,
      },
    }

    const completeResponse = await fetch(
      `${API_BASE_URL}${this.BIOMETRIC_REGISTER_COMPLETE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          credential: credentialData,
          deviceName: deviceName || getDeviceName(),
        }),
      }
    )

    if (!completeResponse.ok) {
      const err = await completeResponse.json()
      throw new Error(err.error?.message || 'Failed to complete biometric registration')
    }

    const result = await completeResponse.json()
    return result.credential
  }

  static async authenticateBiometric(
    walletAddress: string
  ): Promise<AuthTokens> {
    if (!isWebAuthnAvailable()) {
      throw new Error('WebAuthn is not available on this device')
    }

    const beginResponse = await fetch(
      `${API_BASE_URL}${this.BIOMETRIC_AUTH_BEGIN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      }
    )

    if (!beginResponse.ok) {
      const err = await beginResponse.json()
      throw new Error(err.error?.message || 'Failed to start biometric authentication')
    }

    const options: WebAuthnAuthenticationOptions = await beginResponse.json()

    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge: base64urlToArrayBuffer(options.challenge),
      timeout: options.timeout,
      rpId: options.rpId,
      allowCredentials: options.allowCredentials.map((cred) => ({
        ...cred,
        id: base64urlToArrayBuffer(cred.id),
      })),
      userVerification: options.userVerification,
    }

    const assertion = (await navigator.credentials.get({
      publicKey,
    })) as PublicKeyCredential

    if (!assertion) {
      throw new Error('Biometric authentication was cancelled')
    }

    const response = assertion.response as AuthenticatorAssertionResponse

    const assertionData = {
      id: assertion.id,
      rawId: arrayBufferToBase64url(assertion.rawId),
      type: assertion.type,
      response: {
        clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
        authenticatorData: arrayBufferToBase64url(response.authenticatorData),
        signature: arrayBufferToBase64url(response.signature),
        userHandle: response.userHandle
          ? arrayBufferToBase64url(response.userHandle)
          : undefined,
      },
    }

    const completeResponse = await fetch(
      `${API_BASE_URL}${this.BIOMETRIC_AUTH_COMPLETE}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          assertion: assertionData,
        }),
      }
    )

    if (!completeResponse.ok) {
      const err = await completeResponse.json()
      throw new Error(err.error?.message || 'Biometric verification failed')
    }

    const result = await completeResponse.json()
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    }
  }

  static async getEnrolledBiometrics(): Promise<BiometricCredential[]> {
    const authToken = getAccessToken()
    if (!authToken) {
      throw new Error('Not authenticated')
    }

    const response = await fetch(
      `${API_BASE_URL}${this.BIOMETRIC_CREDENTIALS}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    )

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error?.message || 'Failed to fetch biometric credentials')
    }

    const result = await response.json()
    return result.credentials
  }

  static async removeBiometric(credentialId: string): Promise<void> {
    const authToken = getAccessToken()
    if (!authToken) {
      throw new Error('Not authenticated')
    }

    const response = await fetch(
      `${API_BASE_URL}${this.BIOMETRIC_CREDENTIALS}/${credentialId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    )

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error?.message || 'Failed to remove biometric credential')
    }
  }
}

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem('traqora-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.accessToken || null
  } catch {
    return null
  }
}

function getDeviceName(): string {
  if (typeof window === 'undefined') return 'Unknown Device'
  const ua = navigator.userAgent
  if (/Android/.test(ua)) return 'Android Device'
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS Device'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows Device'
  if (/Linux/.test(ua)) return 'Linux Device'
  return 'Unknown Device'
}
