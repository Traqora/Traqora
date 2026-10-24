"use client"

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AuthTokens } from './auth'

export interface BiometricSettings {
  enabled: boolean
  preferOverWallet: boolean
  requireForPayments: boolean
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  biometric: BiometricSettings
}

interface AuthActions {
  setTokens: (tokens: AuthTokens) => void
  clearTokens: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  refreshTokens: (tokens: AuthTokens) => void
  setBiometric: (settings: Partial<BiometricSettings>) => void
  resetBiometric: () => void
}

type AuthStore = AuthState & AuthActions

const defaultBiometric: BiometricSettings = {
  enabled: false,
  preferOverWallet: false,
  requireForPayments: false,
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      biometric: { ...defaultBiometric },

      setTokens: (tokens: AuthTokens) => {
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isAuthenticated: true,
          error: null,
        })
      },

      clearTokens: () => {
        set({
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        })
      },

      setLoading: (isLoading: boolean) => {
        set({ isLoading })
      },

      setError: (error: string | null) => {
        set({ error })
      },

      refreshTokens: (tokens: AuthTokens) => {
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isAuthenticated: true,
          error: null,
        })
      },

      setBiometric: (settings: Partial<BiometricSettings>) => {
        set((state) => ({
          biometric: { ...state.biometric, ...settings },
        }))
      },

      resetBiometric: () => {
        set({ biometric: { ...defaultBiometric } })
      },
    }),
    {
      name: 'traqora-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        biometric: state.biometric,
      }),
    }
  )
)
