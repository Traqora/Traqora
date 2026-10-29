"use client"

import { useEffect, useRef, useState } from "react"
import { useWalletStore } from "@/lib/stellar-wallet-connect"
import {
  DISCONNECTED_WALLET_MESSAGE,
  WALLET_CHANGED_MESSAGE,
  activeWalletAccount,
  bindGovernanceDraft,
  retainDraftForAccount,
  type BoundGovernanceDraft,
  type GovernanceDraftKind,
} from "./wallet-session"

export function useGovernanceWallet() {
  const { isConnected, address } = useWalletStore()
  return {
    isConnected,
    address,
    account: activeWalletAccount({ isConnected, address }),
  }
}

/**
 * Binds an in-progress governance action to the wallet that started it.
 * A disconnect or account switch clears the draft instead of letting it
 * continue under a different account.
 */
export function useBoundGovernanceDraft<T>(kind: GovernanceDraftKind) {
  const { account } = useGovernanceWallet()
  const [draft, setDraft] = useState<BoundGovernanceDraft<T> | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const previousAccount = useRef<string | null>(account)

  useEffect(() => {
    const previous = previousAccount.current
    previousAccount.current = account
    if (!draft) return
    const retained = retainDraftForAccount(draft, account)
    if (retained) return
    setDraft(null)
    setNotice(previous && account && previous !== account ? WALLET_CHANGED_MESSAGE : DISCONNECTED_WALLET_MESSAGE)
  }, [account, draft])

  return {
    account,
    draft,
    notice,
    clearNotice: () => setNotice(null),
    startDraft: (payload: T) => {
      if (!account) {
        setNotice(DISCONNECTED_WALLET_MESSAGE)
        return null
      }
      const next = bindGovernanceDraft(account, kind, payload)
      setDraft(next)
      setNotice(null)
      return next
    },
    requireAccount: () => {
      if (!account) {
        setNotice(DISCONNECTED_WALLET_MESSAGE)
        return null
      }
      if (draft && draft.account !== account) {
        setDraft(null)
        setNotice(WALLET_CHANGED_MESSAGE)
        return null
      }
      return account
    },
  }
}
