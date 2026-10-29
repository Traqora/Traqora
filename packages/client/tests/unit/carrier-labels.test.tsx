import { render, screen } from '@testing-library/react'
import { CarrierLabels, formatCarrierLabels } from '@/components/flight-search/carrier-labels'

describe('carrier labels (#903)', () => {
  it('renders marketing and operating carriers separately on a codeshare', () => {
    render(<CarrierLabels marketingCarrier="AA" operatingCarrier="BA" />)

    expect(screen.getByText('Marketed by AA')).toBeInTheDocument()
    expect(screen.getByText('Operated by BA')).toBeInTheDocument()
  })

  it('still labels both carriers when they are the same airline', () => {
    const labels = formatCarrierLabels({ marketingCarrier: 'dl', operatingCarrier: 'DL' })
    expect(labels).toEqual({
      marketedBy: 'Marketed by DL',
      operatedBy: 'Operated by DL',
      isCodeshare: false,
    })
  })

  it('returns null when the marketing carrier is missing', () => {
    expect(formatCarrierLabels({ marketingCarrier: '  ', operatingCarrier: 'BA' })).toBeNull()
  })
})
