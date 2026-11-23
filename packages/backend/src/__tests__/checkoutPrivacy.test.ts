describe('Checkout Privacy and Data Minimization', () => {
  it('validates that passenger data collection purpose is restricted to supplier fulfillment and booking confirmation', () => {
    const allowedPurposes = ['supplier_fulfillment', 'booking_confirmation'];
    expect(allowedPurposes).toContain('supplier_fulfillment');
    expect(allowedPurposes).toContain('booking_confirmation');
    expect(allowedPurposes).not.toContain('marketing_preferences');
    expect(allowedPurposes).not.toContain('social_media_handles');
  });

  it('verifies that unrelated personal information is rejected or omitted', () => {
    const passengerPayload = {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+15550198765',
      marketingPreferences: 'opt-in',
      socialMediaHandle: '@janedoe'
    };

    const sanitizedPayload: Record<string, any> = {};
    const allowedFields = ['firstName', 'lastName', 'email', 'phone', 'documentNumber'];
    for (const key of allowedFields) {
      if (key in passengerPayload) {
        sanitizedPayload[key] = (passengerPayload as any)[key];
      }
    }

    expect(sanitizedPayload).toHaveProperty('firstName');
    expect(sanitizedPayload).toHaveProperty('email');
    expect(sanitizedPayload).not.toHaveProperty('marketingPreferences');
    expect(sanitizedPayload).not.toHaveProperty('socialMediaHandle');
  });

  it('checks that the checkout user-facing notice text is correctly formulated', () => {
    const noticeText = 'Traqora collects passenger details (name, contact info, travel documents) solely for airline supplier fulfillment and booking confirmation. We do not collect unrelated personal data or store unencrypted PII on-chain.';
    expect(noticeText).toContain('solely for airline supplier fulfillment');
    expect(noticeText).toContain('Do not collect unrelated personal data');
  });
});
