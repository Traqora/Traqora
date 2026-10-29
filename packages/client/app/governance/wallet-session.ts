export interface WalletSession {
  isConnected: boolean
  address: string
}

const PLACEHOLDER_ACCOUNTS = new Set(["current-user", "current-user-address"])

/** Connected wallet public address, or null when nothing should be submitted. */
export function activeWalletAccount(wallet: WalletSession | null | undefined): string | null {
  if (!wallet?.isConnected) return null
  const address = wallet.address?.trim() ?? ""
  if (!address || PLACEHOLDER_ACCOUNTS.has(address)) return null
  return address
}

export function isUsableGovernanceAccount(account: string | null | undefined): account is string {
  const value = account?.trim() ?? ""
  return value.length > 0 && !PLACEHOLDER_ACCOUNTS.has(value)
}

export type GovernanceDraftKind = "proposal" | "vote" | "delegation"

export interface BoundGovernanceDraft<T> {
  account: string
  kind: GovernanceDraftKind
  payload: T
}

export function bindGovernanceDraft<T>(
  account: string,
  kind: GovernanceDraftKind,
  payload: T,
): BoundGovernanceDraft<T> {
  return { account, kind, payload }
}

/**
 * A draft belongs to the account that started it. A disconnect or a switch
 * to a different account cancels it.
 */
export function retainDraftForAccount<T>(
  draft: BoundGovernanceDraft<T> | null,
  account: string | null,
): BoundGovernanceDraft<T> | null {
  if (!draft || !account || draft.account !== account) return null
  return draft
}

export const WALLET_CHANGED_MESSAGE =
  "This draft was cancelled because the connected wallet changed. Start again with the active account."

export const DISCONNECTED_WALLET_MESSAGE =
  "Connect a wallet before submitting. No transaction was sent."
