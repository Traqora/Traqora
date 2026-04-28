"use client"

import { useState, useCallback } from 'react'
import { useWalletStore } from './stellar-wallet-connect'
import { AuthService, AuthTokens } from './auth'
import { useAuthStore } from './auth-store'
import { useRouter } from 'next/navigation'

export function useAuth() {
  const { address, isConnected, walletType } = useWalletStore()
  const { setTokens, clearTokens, setLoading, setError, isAuthenticated } = useAuthStore()
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const router = useRouter()

  const authenticate = useCallback(async () => {
    if (!isConnected || !address || !walletType) {
      setError('Wallet not connected')
      return false
    }

    setIsAuthenticating(true)
    setLoading(true)
    setError(null)

    try {
      // Get challenge from backend
      const challenge = await AuthService.getChallenge(address)

      // Sign the challenge message with the wallet
      const signature = await signChallenge(challenge.message)

      // Verify signature with backend
      const tokens: AuthTokens = await AuthService.verifySignature(
        address,
        signature,
        walletType
      )

      // Store tokens
      setTokens(tokens)

      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed'
      setError(message)
      return false
    } finally {
      setIsAuthenticating(false)
      setLoading(false)
    }
  }, [isConnected, address, walletType, setTokens, setLoading, setError])

  const logout = useCallback(async () => {
    try {
      await AuthService.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      clearTokens()
      router.push('/')
    }
  }, [clearTokens, router])

  const refreshAuth = useCallback(async () => {
    const { refreshToken } = useAuthStore.getState()
    if (!refreshToken) {
      setError('No refresh token available')
      return false
    }

    setLoading(true)
    try {
      const tokens = await AuthService.refreshToken(refreshToken)
      setTokens(tokens)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token refresh failed'
      setError(message)
      clearTokens()
      return false
    } finally {
      setLoading(false)
    }
  }, [setTokens, setLoading, setError, clearTokens])

  return {
    authenticate,
    logout,
    refreshAuth,
    isAuthenticating,
    canAuthenticate: isConnected && !!address,
    isAuthenticated,
  }
}

// Placeholder for wallet signing function
// This would need to be implemented with the actual StellarWalletsKit signing API
async function signChallenge(message: string): Promise<string> {
  const { StellarWalletsKit, getConfiguredNetwork } = await import('./stellar-wallet-connect/kit')
  const { useWalletStore } = await import('./stellar-wallet-connect')

  try {
    const { address, walletType } = useWalletStore.getState()

    if (!address || !walletType) {
      throw new Error('No wallet connected')
    }

    const network = getConfiguredNetwork()
    const networkPassphrase = network === 'testnet'
      ? 'Test SDF Network ; September 2015'
      : 'Public Global Stellar Network ; September 2015'

    // For Albedo, try to sign the message directly
    if (walletType.toLowerCase() === 'albedo') {
      // Check if StellarWalletsKit has signMessage method
      if (typeof StellarWalletsKit.signMessage === 'function') {
        const signature = await StellarWalletsKit.signMessage(message, {
          address,
          networkPassphrase
        })
        return signature
      }
    }

    // For Freighter and Rabet, or as fallback, create a transaction with the message as memo
    // This is a simplified approach - in production, you'd want to create a proper challenge transaction
    const { TransactionBuilder, Networks, Memo, Keypair } = await import('@stellar/stellar-sdk')

    const keypair = Keypair.fromPublicKey(address)
    const account = await StellarWalletsKit.getAccount(address)

    const transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase,
    })
      .addMemo(Memo.text(message))
      .setTimeout(30)
      .build()

    const xdr = transaction.toXDR()

    const signedXdr = await StellarWalletsKit.signTransaction(xdr, {
      address,
      networkPassphrase
    })

    return signedXdr
  } catch (error) {
    console.error('Error signing challenge:', error)
    throw new Error('Failed to sign authentication challenge')
  }
}