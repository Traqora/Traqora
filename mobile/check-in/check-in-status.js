// mobile/check-in/check-in-status.js
const fs = require('fs');
const path = require('path');

function evaluateCheckInStatus(statusPayloadPath, contractPath) {
  console.log(`🔍 Evaluating mobile check-in status payload: ${statusPayloadPath}`);

  if (!fs.existsSync(statusPayloadPath)) {
    console.error(`❌ Error: Check-in status payload not found at ${statusPayloadPath}`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(statusPayloadPath, 'utf8'));
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

  let violations = [];

  // Check mandatory fields
  for (const field of contract.mandatoryFields) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      violations.push(`Missing mandatory check-in field: '${field}'`);
    }
  }

  // Check allowed statuses
  if (payload.status && !contract.allowedStatuses.includes(payload.status)) {
    violations.push(`Invalid check-in status: '${payload.status}'`);
  }

  // Business rule: Boarding pass issued requires valid ticket and checked_in status
  if (contract.rules.requireTicketForBoardingPass && payload.status === 'BOARDING_PASS_ISSUED') {
    if (!payload.ticketNumber || payload.ticketNumber.trim() === '') {
      violations.push(`Violation: BOARDING_PASS_ISSUED requires a valid non-empty ticketNumber.`);
    }
  }

  if (violations.length > 0) {
    console.error('❌ Check-In Status Validation Failed:');
    violations.forEach(v => console.error(`  - ${v}`));
    process.exit(1);
  }

  console.log(`✅ Check-in status view validated successfully for booking: ${payload.bookingReference}`);
  process.exit(0);
}

// Execute if run directly
const payloadFile = process.argv[2] || path.join(__dirname, 'sample-check-in.json');
const contractFile = process.argv[3] || path.join(__dirname, 'check-in-contract.json');
evaluateCheckInStatus(payloadFile, contractFile);