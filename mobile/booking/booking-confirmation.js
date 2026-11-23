// mobile/booking/booking-confirmation.js
const fs = require('fs');
const path = require('path');

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// Builds the support-facing summary for a booking. Only the booking reference and
// the support route are included; no unrelated customer data is exposed.
function buildSupportContact(payload, contract) {
  const support = contract.support || {};
  return {
    bookingReference: payload.bookingReference,
    supportEmail: isNonEmptyString(support.email) ? support.email : null,
    supportPhone: isNonEmptyString(support.phone) ? support.phone : null,
    supportUrl: isNonEmptyString(support.url) ? support.url : null
  };
}

function validateSupportContact(contract, violations) {
  const support = contract.support;
  if (!support || typeof support !== 'object') {
    violations.push("Missing support contact configuration: 'support'");
    return;
  }
  const hasRoute = ['email', 'phone', 'url'].some(k => isNonEmptyString(support[k]));
  if (!hasRoute) {
    violations.push('Support contact configuration must include at least one of: email, phone, url');
  }
  if (isNonEmptyString(support.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(support.email)) {
    violations.push(`Invalid support email: '${support.email}'`);
  }
}

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

  // Verify support contact route is configured and valid
  validateSupportContact(contract, violations);

  if (violations.length > 0) {
    console.error('❌ Mobile Booking Confirmation Validation Failed:');
    violations.forEach(v => console.error(`  - ${v}`));
    process.exit(1);
  }

  const supportContact = buildSupportContact(payload, contract);
  console.log(`✅ Mobile booking confirmation validated successfully for reference: ${payload.bookingReference}`);
  console.log(`📞 Support contact for booking ${supportContact.bookingReference}: ${JSON.stringify({
    email: supportContact.supportEmail,
    phone: supportContact.supportPhone,
    url: supportContact.supportUrl
  })}`);
  process.exit(0);
}

module.exports = { buildSupportContact, validateSupportContact };

// Execute if run directly
if (require.main === module) {
  const payloadFile = process.argv[2] || path.join(__dirname, 'sample-confirmation.json');
  const contractFile = process.argv[3] || path.join(__dirname, 'confirmation-contract.json');
  validateBookingConfirmation(payloadFile, contractFile);
}
