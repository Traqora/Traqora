import { render, screen } from '@testing-library/react'
import {
  airportChangeNotices,
  segmentsFromFlight,
} from '@/app/search/airport-change'
import { AirportChangeWarning } from '@/app/search/airport-change-warning'

describe('airportChangeNotices (#900)', () => {
  it('warns when adjacent legs use different airports in the same metro and includes distance', () => {
    const notices = airportChangeNotices([
      { origin: 'BOS', destination: 'JFK' },
      { origin: 'EWR', destination: 'LAX' },
    ])
    expect(notices).toEqual([
      {
        arrivedAt: 'JFK',
        departsFrom: 'EWR',
        metro: 'New York',
        distanceKm: 34,
        requiresGroundTransfer: true,
      },
    ])
  })

  it('FAILURE MODE: same-airport connections and unknown metros produce no warning', () => {
    expect(
      airportChangeNotices([
        { origin: 'JFK', destination: 'ORD' },
        { origin: 'ORD', destination: 'SFO' },
      ]),
    ).toEqual([])
    expect(
      airportChangeNotices([
        { origin: 'BOS', destination: 'JFK' },
        { origin: 'JFK', destination: 'LAX' },
      ]),
    ).toEqual([])
    expect(airportChangeNotices([{ origin: 'JFK', destination: 'LAX' }])).toEqual([])
    expect(airportChangeNotices(null)).toEqual([])
    expect(segmentsFromFlight({})).toEqual([])
  })

  it('omits kilometres when the pair is in-metro but the distance table has no entry', () => {
    const notices = airportChangeNotices([
      { origin: 'BOS', destination: 'STN' },
      { origin: 'LTN', destination: 'CDG' },
    ])
    expect(notices).toHaveLength(1)
    expect(notices[0].metro).toBe('London')
    expect(notices[0].distanceKm).toBeNull()
    expect(notices[0].requiresGroundTransfer).toBe(true)
  })
})

describe('AirportChangeWarning', () => {
  it('renders the transfer requirement and distance, and hides when there is nothing to warn', () => {
    const { rerender } = render(
      <AirportChangeWarning
        notices={[
          {
            arrivedAt: 'JFK',
            departsFrom: 'EWR',
            metro: 'New York',
            distanceKm: 34,
            requiresGroundTransfer: true,
          },
        ]}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Change airports in New York')
    expect(screen.getByRole('status')).toHaveTextContent('34 km')
    expect(screen.getByRole('status')).toHaveTextContent('Ground transfer required')

    rerender(<AirportChangeWarning notices={[]} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
