import {
  DISCONNECTED_WALLET_MESSAGE,
  WALLET_CHANGED_MESSAGE,
  activeWalletAccount,
  bindGovernanceDraft,
  isUsableGovernanceAccount,
  retainDraftForAccount,
} from '@/app/governance/wallet-session'

describe('activeWalletAccount (#897)', () => {
  it('uses the connected wallet address for governance actions', () => {
    expect(
      activeWalletAccount({ isConnected: true, address: 'GABC123CONNECTED' }),
    ).toBe('GABC123CONNECTED')
    expect(isUsableGovernanceAccount('GABC123CONNECTED')).toBe(true)
  })

  it('FAILURE MODE: disconnected, blank, and placeholder accounts are not submitted', () => {
    expect(activeWalletAccount({ isConnected: false, address: 'GABC123CONNECTED' })).toBeNull()
    expect(activeWalletAccount({ isConnected: true, address: '' })).toBeNull()
    expect(activeWalletAccount({ isConnected: true, address: 'current-user-address' })).toBeNull()
    expect(activeWalletAccount({ isConnected: true, address: 'current-user' })).toBeNull()
    expect(activeWalletAccount(null)).toBeNull()
    expect(isUsableGovernanceAccount('current-user-address')).toBe(false)
  })
})

describe('retainDraftForAccount (#898)', () => {
  const draft = bindGovernanceDraft('GACCOUNT1', 'vote', { support: true })

  it('keeps a draft for the account that started it', () => {
    expect(retainDraftForAccount(draft, 'GACCOUNT1')).toEqual(draft)
  })

  it('FAILURE MODE: a wallet switch or disconnect cancels the draft', () => {
    expect(retainDraftForAccount(draft, 'GACCOUNT2')).toBeNull()
    expect(retainDraftForAccount(draft, null)).toBeNull()
    expect(WALLET_CHANGED_MESSAGE).toMatch(/wallet changed/i)
    expect(DISCONNECTED_WALLET_MESSAGE).toMatch(/no transaction was sent/i)
  })
})
