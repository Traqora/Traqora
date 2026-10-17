// monitoring/grafana/provision-dashboards.js
const fs = require('fs');
const path = require('path');

function provisionDashboards(dashboardsDir, contractPath) {
  console.log(`🔍 Provisioning and validating dashboards from: ${dashboardsDir}`);

  if (!fs.existsSync(dashboardsDir)) {
    console.error(`❌ Error: Dashboards directory not found at ${dashboardsDir}`);
    process.exit(1);
  }

  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const dashboardFiles = fs.readdirSync(dashboardsDir).filter(file => file.endsWith('.json'));
  
  let violations = [];

  for (const file of dashboardFiles) {
    const filePath = path.join(dashboardsDir, file);
    const dashboard = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Check UID naming convention
    const uidRegex = new RegExp(contract.allowedUidRegex);
    if (!dashboard.uid || !uidRegex.test(dashboard.uid)) {
      violations.push(`Dashboard '${file}' has invalid or missing UID (must match ${contract.allowedUidRegex})`);
    }

    // Check required panels
    const panelTitles = (dashboard.panels || []).map(p => p.title);
    for (const requiredPanel of contract.requiredPanels) {
      if (!panelTitles.includes(requiredPanel)) {
        violations.push(`Dashboard '${file}' is missing required panel: '${requiredPanel}'`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('❌ Dashboard Provisioning Validation Failed:');
    violations.forEach(v => console.error(`  - ${v}`));
    process.exit(1);
  }

  console.log('✅ All Grafana dashboards provisioned and validated successfully!');
  process.exit(0);
}

// Execute if run directly
const dir = process.argv[2] || path.join(__dirname, 'dashboards');
const contractFile = process.argv[3] || path.join(__dirname, 'dashboards-contract.json');
provisionDashboards(dir, contractFile);