// monitoring/alertmanager/test-routing.js
const fs = require('fs');
const path = require('path');

function testAlertmanagerRouting(configPath, contractPath) {
  console.log(`🔍 Testing Alertmanager routing config: ${configPath}`);

  if (!fs.existsSync(configPath)) {
    console.error(`❌ Error: Alertmanager config not found at ${configPath}`);
    process.exit(1);
  }

  // For robust dependency-free parsing in test harness, we accept JSON or structured config mock
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

  let violations = [];

  const receivers = (config.receivers || []).map(r => r.name);
  for (const mandatoryReceiver of contract.mandatoryReceivers) {
    if (!receivers.includes(mandatoryReceiver)) {
      violations.push(`Missing mandatory receiver: '${mandatoryReceiver}'`);
    }
  }

  const routes = config.route?.routes || [];
  for (const requiredRoute of contract.requiredRoutes) {
    const matchedRoute = routes.find(
      r => r.match?.severity === requiredRoute.match.severity && r.receiver === requiredRoute.receiver
    );
    if (!matchedRoute) {
      violations.push(`Missing or incorrect route for severity '${requiredRoute.match.severity}' targeting receiver '${requiredRoute.receiver}'`);
    }
  }

  if (violations.length > 0) {
    console.error('❌ Alertmanager Routing Contract Validation Failed:');
    violations.forEach(v => console.error(`  - ${v}`));
    process.exit(1);
  }

  console.log('✅ Alertmanager routing configuration validated successfully!');
  process.exit(0);
}

// Execute if run directly
const configFile = process.argv[2] || path.join(__dirname, 'alertmanager.json');
const contractFile = process.argv[3] || path.join(__dirname, 'routing-contract.json');
testAlertmanagerRouting(configFile, contractFile);