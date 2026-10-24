import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import DashboardPage from '../app/dashboard/page'
import { getTransactionReceiptPdf } from '../lib/api'
import type { TransactionRecord } from '../lib/api'

jest.mock('../lib/api', () => ({
  getTransactionReceiptPdf: jest.fn(),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}))

jest.mock('@/components/nav-wallet-button', () => ({
  NavWalletButton: () => <div data-testid="nav-wallet-button" />,
}))

jest.mock('@/lib/stellar-wallet-connect', () => ({
  useWalletStore: () => ({ address: '', isConnected: false, network: '', walletType: '' }),
  useWallet: () => ({ handleConnect: jest.fn() }),
}))

jest.mock('@/components/offline-provider', () => ({
  useOffline: () => ({ isOnline: true }),
}))

jest.mock('@/components/offline-itinerary-view', () => ({
  OfflineItineraryView: () => <div data-testid="offline-itinerary-view" />,
}))

const confirmedTx: TransactionRecord = {
  bookingId: 'booking-abc',
  bookingStatus: 'confirmed',
  txHash: 'tx-abc',
  explorerUrl: 'https://stellar.expert/explorer/testnet/tx/tx-abc',
  contractSubmitAttempts: 1,
  lastError: null,
  updatedAt: '2026-07-01T00:00:00Z',
}

jest.mock('@/hooks/use-transaction-history', () => ({
  useTransactionHistory: jest.fn(() => ({
    transactions: [confirmedTx],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  })),
}))

describe('DashboardPage receipt download', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = jest.fn()
  })

  it('downloads a receipt PDF when "Download Receipt" is clicked', async () => {
    const blob = new Blob(['%PDF-1.4 mock'], { type: 'application/pdf' })
    ;(getTransactionReceiptPdf as jest.Mock).mockResolvedValue(blob)

    render(<DashboardPage />)

    const button = await screen.findByRole('button', { name: /download receipt/i })
    fireEvent.click(button)

    await waitFor(() => expect(getTransactionReceiptPdf).toHaveBeenCalledWith('booking-abc'))
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('shows an error toast when the download fails', async () => {
    ;(getTransactionReceiptPdf as jest.Mock).mockRejectedValue(new Error('boom'))
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { toast } = jest.requireMock('sonner')

    render(<DashboardPage />)

    const button = await screen.findByRole('button', { name: /download receipt/i })
    fireEvent.click(button)

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })
})
