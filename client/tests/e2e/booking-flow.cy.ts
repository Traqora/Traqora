describe('Flight Booking Flow', () => {
  beforeEach(() => {
    cy.visit('/search');
  });

  it('should complete a full booking flow', () => {
    // 1. Search for flights
    cy.get('input[id="from-airport"]').type('JFK');
    cy.get('input[id="to-airport"]').type('LAX');
    cy.get('input[id="departure-date"]').type('2024-12-15');
    cy.get('button[type="submit"]').click();

    // 2. Select a flight
    cy.get('a[aria-label^="Book flight"]').first().click();

    // 3. Review flight details and proceed to seats
    cy.contains('Review your flight details').should('be.visible');
    cy.get('button').contains('Select Seats').click();

    // 4. Select a seat
    cy.contains('Select Your Seat').should('be.visible');
    cy.get('button[title^="Seat"]').first().click();
    cy.get('button').contains('Continue to Payment').click();

    // 5. Connect wallet
    cy.contains('Secure Your Booking').should('be.visible');
    cy.get('button').contains('Connect Stellar Wallet').click();

    // 6. Confirm and pay
    cy.contains('Payment Method').should('be.visible');
    cy.get('button').contains('Confirm & Pay').click();

    // 7. Success
    cy.contains('Booking Confirmed!').should('be.visible');
    cy.get('p').contains('TRAQ-').should('be.visible');
    cy.get('button').contains('Go to Dashboard').should('be.visible');
  });

  it('should be accessible', () => {
    cy.injectAxe();
    cy.checkA11y();
  });
});
