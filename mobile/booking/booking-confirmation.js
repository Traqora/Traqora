// mobile/booking/booking-confirmation.js
const fs = require('fs');
const path = require('path');

function validateBookingConfirmation(payloadPath, contractPath) {
  console.log(`🔍 Validating mobile booking confirmation payload: ${payloadPath}`);

  if (!fs.existsSync(payloadPath)) {
    console.error(`❌ Error: Booking confirmation payload not found at ${payloadPath}`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

  let violations = [];

  // Verify mandatory header fields
  for (const field of contract.mandatoryFields) {
    if (!payload[field] || payload[field].toString().trim() === '') {
      violations.push(`Missing or empty mandatory field: '${field}'`);
    }
  }

  // Verify payment status
  if (payload.paymentStatus && !contract.allowedPaymentStatuses.includes(payload.paymentStatus)) {
    violations.push(`Invalid payment status: '${payload.paymentStatus}' (Must be one of: ${contract.allowedPaymentStatuses.join(', ')})`);
  }

  // Verify Stellar transaction hash rule
  if (contract.rules.requireStellarTxHashForConfirmation) {
    if (!payload.stellarTxHash || payload.stellarTxHash.length < 32) {
      violations.push(`Violation: Mobile booking confirmation requires a valid Stellar transaction hash.`);
    }
  }

  if (violations.length > 0) {
    console.error('❌ Mobile Booking Confirmation Validation Failed:');
    violations.forEach(v => console.error(`  - ${v}`));
    process.exit(1);
  }

  console.log(`✅ Mobile booking confirmation validated successfully for reference: ${payload.bookingReference}`);
  process.exit(0);
}

// Execute if run directly
const payloadFile = process.argv[2] || path.join(__dirname, 'sample-confirmation.json');
const contractFile = process.argv[3] || path.join(__dirname, 'confirmation-contract.json');
validateBookingConfirmation(payloadFile, contractFile);