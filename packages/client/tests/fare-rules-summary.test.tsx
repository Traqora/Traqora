import { fireEvent, render, screen } from '@testing-library/react'
import { FareRulesSummary, FareRule } from '@/components/booking/fare-rules-summary'

const fareRule: FareRule = {
  fareClass: 'economy',
  fareBasisCode: 'Y26',
  airline: 'TQ',
  changeable: true,
  refundable: false,
  changeFeeCents: 5000,
  cancellationFeeCents: 2500,
  upgradeFeeCents: 0,
  noShowPenalty: 100,
  noShowGracePeriodMinutes: 15,
  restrictions: { advancePurchaseRequired: false },
  rebookingAllowed: true,
  nameChangeAllowed: false,
  nameChangeFeeCents: 0,
  standbyAllowed: false,
  standbyFeeCents: 0,
}

describe('FareRulesSummary cancellation policy explainer', () => {
  it('explains non-refundable fares, cancellation fees, and no-show penalties', () => {
    render(<FareRulesSummary fareRules={[fareRule]} />)
    fireEvent.click(screen.getByRole('button', { name: /Economy/ }))

    const explanation = screen.getByTestId('cancellation-policy-explainer')
    expect(explanation).toHaveTextContent('This fare is non-refundable.')
    expect(explanation).toHaveTextContent('Cancellation fee: $25.00 per passenger.')
    expect(explanation).toHaveTextContent('No-show: 100% penalty after 15 minutes.')
  })

  it('states when refunds are permitted', () => {
    render(<FareRulesSummary fareRules={[{ ...fareRule, refundable: true }]} />)
    fireEvent.click(screen.getByRole('button', { name: /Economy/ }))

    expect(screen.getByTestId('cancellation-policy-explainer'))
      .toHaveTextContent('Refunds are permitted.')
  })
})