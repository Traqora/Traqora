import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { BookingConfirmation } from '@/components/booking/booking-confirmation'
import { getTransactionReceiptPdf } from '@/lib/api'
import { getStellarExpertUrl } from '@/lib/wallet'

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getTransactionReceiptPdf: jest.fn(),
}))

jest.mock('@/lib/wallet', () => ({
  getStellarExpertUrl: jest.fn(
    (txHash: string) => `https://stellar.expert/explorer/testnet/tx/${txHash}`,
  ),
}))

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), info: jest.fn(), success: jest.fn() },
}))
import { toast } from 'sonner'

const toastMock = toast as unknown as { error: jest.Mock; info: jest.Mock; success: jest.Mock }

const mockedReceipt = getTransactionReceiptPdf as jest.MockedFunction<typeof getTransactionReceiptPdf>
const mockedExplorerUrl = getStellarExpertUrl as jest.MockedFunction<typeof getStellarExpertUrl>

function renderConfirmation(overrides: Partial<React.ComponentProps<typeof BookingConfirmation>> = {}) {
  const props = {
    bookingId: 'TRAQ-ABC123',
    booking: { id: 'booking-db-1', sorobanTxHash: 'tx-hash-1' },
    passengerName: 'Ada Lovelace',
    seatNumber: '12A',
    departureDate: 'December 15, 2024',
    departureTime: '08:30',
    destinationCity: 'Los Angeles',
    onGoToDashboard: jest.fn(),
    ...overrides,
  }
  return render(<BookingConfirmation {...props} />)
}

describe('Booking confirmation view (issue #664)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.URL as any).createObjectURL = jest.fn(() => 'blob:receipt')
    ;(global.URL as any).revokeObjectURL = jest.fn()
  })

  it('renders the real passenger name and booking reference instead of placeholders', () => {
    renderConfirmation()

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument()
    expect(screen.getByText('TRAQ-ABC123')).toBeInTheDocument()
    expect(screen.getByText('12A')).toBeInTheDocument()
  })

  it('downloads the receipt for the backend booking when Receipt is clicked', async () => {
    mockedReceipt.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))

    renderConfirmation()
    fireEvent.click(screen.getByRole('button', { name: /receipt/i }))

    await waitFor(() => {
      expect(mockedReceipt).toHaveBeenCalledWith('booking-db-1')
    })
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('surfaces an error toast when the receipt download fails', async () => {
    mockedReceipt.mockRejectedValue(new Error('not found'))

    renderConfirmation()
    fireEvent.click(screen.getByRole('button', { name: /receipt/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        'Failed to download receipt',
        expect.objectContaining({ description: 'not found' }),
      )
    })
  })

  it('opens Stellar Expert when an on-chain hash is available', () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)

    renderConfirmation()
    fireEvent.click(screen.getByRole('button', { name: /explorer/i }))

    expect(mockedExplorerUrl).toHaveBeenCalledWith('tx-hash-1', 'testnet')
    expect(openSpy).toHaveBeenCalledWith(
      'https://stellar.expert/explorer/testnet/tx/tx-hash-1',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('shows the provider offer identifier on confirmation', () => {
    renderConfirmation({
      booking: { id: 'booking-db-1', sorobanTxHash: 'tx-hash-1', providerOfferId: 'AMA-OFFER-99' },
    })

    expect(screen.getByText('Provider offer')).toBeInTheDocument()
    expect(screen.getByText('AMA-OFFER-99')).toBeInTheDocument()
  })

  it('explains that the on-chain receipt is unavailable when there is no hash', () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)

    renderConfirmation({ booking: { id: 'booking-db-1', sorobanTxHash: null } })
    fireEvent.click(screen.getByRole('button', { name: /explorer/i }))

    expect(openSpy).not.toHaveBeenCalled()
    expect(toastMock.info).toHaveBeenCalled()
  })
})
