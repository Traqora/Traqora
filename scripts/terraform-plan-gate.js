// scripts/terraform-plan-gate.js
const fs = require('fs');

function evaluatePlan(planJsonPath, contractPath) {
  console.log(`🔍 Evaluating Terraform plan file: ${planJsonPath}`);
  
  if (!fs.existsSync(planJsonPath)) {
    console.error(`❌ Error: Plan JSON file not found at ${planJsonPath}`);
    process.exit(1);
  }

  const plan = JSON.parse(fs.readFileSync(planJsonPath, 'utf8'));
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

  let violations = [];

  const resourceChanges = plan.resource_changes || [];

  for (const change of resourceChanges) {
    const actions = change.change.actions;
    const resourceType = change.type;

    // Check for destructive changes (e.g., delete)
    if (contract.rules.blockDestructiveChanges && actions.includes('delete') && !actions.includes('create')) {
      violations.push(`Destructive action 'delete' detected on resource: ${change.address} (${resourceType})`);
    }

    // Check against allowed resource types
    if (!contract.rules.allowedResourceTypes.includes(resourceType)) {
      violations.push(`Unauthorized resource type detected: ${resourceType} (${change.address})`);
    }
  }

  if (violations.length > 0) {
    console.error('❌ Terraform Plan CI Gate Failed with violations:');
    violations.forEach((v) => console.error(`  - ${v}`));
    process.exit(1);
  }

  console.log('✅ Terraform Plan CI Gate passed successfully!');
  process.exit(0);
}

// Execute if run directly
const planFile = process.argv[2] || 'tfplan.json';
const contractFile = process.argv[3] || 'scripts/tf-gate-contract.json';
evaluatePlan(planFile, contractFile);