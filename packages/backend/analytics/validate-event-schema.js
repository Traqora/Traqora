// packages/backend/analytics/validate-event-schema.js
const fs = require('fs');
const path = require('path');

function validateAnalyticsEvent(eventPayloadPath, contractPath) {
  console.log(`🔍 Validating analytics event payload: ${eventPayloadPath}`);

  if (!fs.existsSync(eventPayloadPath)) {
    console.error(`❌ Error: Event payload file not found at ${eventPayloadPath}`);
    process.exit(1);
  }

  const event = JSON.parse(fs.readFileSync(eventPayloadPath, 'utf8'));
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

  let violations = [];

  // Check mandatory header fields
  for (const field of contract.mandatoryHeaderFields) {
    if (!event[field]) {
      violations.push(`Missing mandatory event header field: '${field}'`);
    }
  }

  // Check allowed event types
  if (event.eventType && !contract.allowedEventTypes.includes(event.eventType)) {
    violations.push(`Disallowed or unknown eventType: '${event.eventType}'`);
  }

  // Check type-specific payload requirements
  if (event.eventType && contract.payloadRules[event.eventType]) {
    const requiredPayloadKeys = contract.payloadRules[event.eventType];
    const payload = event.payload || {};
    for (const key of requiredPayloadKeys) {
      if (payload[key] === undefined || payload[key] === null) {
        violations.push(`Missing required payload field '${key}' for eventType '${event.eventType}'`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('❌ Analytics Event Schema Validation Failed:');
    violations.forEach(v => console.error(`  - ${v}`));
    process.exit(1);
  }

  console.log('✅ Analytics event schema validated successfully!');
  process.exit(0);
}

// Execute if run directly
const eventFile = process.argv[2] || path.join(__dirname, 'sample-event.json');
const contractFile = process.argv[3] || path.join(__dirname, 'event-schema-contract.json');
validateAnalyticsEvent(eventFile, contractFile);