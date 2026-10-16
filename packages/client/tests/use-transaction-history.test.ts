import { renderHook, waitFor, act } from '@testing-library/react'
import { useTransactionHistory } from '../hooks/use-transaction-history'
import { apiClient, TransactionRecord } from '../lib/api'
import { getCachedItinerary, clearAllOfflineData } from '../lib/offline-storage'

jest.mock('@/lib/stellar-wallet-connect', () => ({
  useWalletStore: jest.fn(() => ({ address: 'GWALLET1' })),
}))

const onHandlers: Record<string, (data: any) => void> = {}
jest.mock('@/hooks/use-socket-events', () => ({
  useSocketEvents: jest.fn((options: any) => {
    if (options?.onBookingStatus) onHandlers.onBookingStatus = options.onBookingStatus
  }),
}))

const transactions: TransactionRecord[] = [
  {
    bookingId: 'booking-1',
    bookingStatus: 'confirmed',
    txHash: 'tx-1',
    explorerUrl: 'https://stellar.expert/explorer/testnet/tx/tx-1',
    contractSubmitAttempts: 1,
    lastError: null,
    updatedAt: '2026-07-01T00:00:00Z',
  },
]

describe('useTransactionHistory', () => {
  beforeEach(() => {
    clearAllOfflineData()
    jest.restoreAllMocks()
  })

  it('loads transactions on mount and caches them for offline access', async () => {
    jest.spyOn(apiClient, 'listTransactions').mockResolvedValue({ success: true, data: transactions })

    const { result } = renderHook(() => useTransactionHistory())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.transactions).toEqual(transactions)
    expect(result.current.error).toBeNull()
    expect(getCachedItinerary('booking-1')?.booking.status).toBe('confirmed')
  })

  it('surfaces an error message when the request fails', async () => {
    jest.spyOn(apiClient, 'listTransactions').mockResolvedValue({
      success: false,
      error: { message: 'Network error' },
    } as any)

    const { result } = renderHook(() => useTransactionHistory())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.transactions).toEqual([])
    expect(result.current.error).toBe('Network error')
  })

  it('refetches when a booking_status socket event arrives', async () => {
    const spy = jest.spyOn(apiClient, 'listTransactions').mockResolvedValue({ success: true, data: transactions })

    renderHook(() => useTransactionHistory())

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))

    act(() => {
      onHandlers.onBookingStatus?.({ bookingId: 'booking-1', status: 'confirmed', timestamp: new Date() })
    })

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
  })
})
