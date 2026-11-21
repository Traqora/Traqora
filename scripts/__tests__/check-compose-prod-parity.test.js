'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkComposeProdParity } = require('../check-compose-prod-parity');

const ROOT = path.join(__dirname, '..', '..');

describe('compose prod parity', () => {
  it('accepts docker-compose.prod.yml', () => {
    const result = checkComposeProdParity(path.join(ROOT, 'docker-compose.prod.yml'));
    assert.equal(result.ok, true, result.errors.join('; '));
  });

  it('fails when a production compose publishes database ports', () => {
    const tmp = path.join(os.tmpdir(), `compose-prod-${Date.now()}.yml`);
    fs.writeFileSync(
      tmp,
      `
services:
  api:
    environment:
      - NODE_ENV=production
      - JWT_SECRET=\${JWT_SECRET}
    healthcheck:
      test: ["CMD", "true"]
  frontend:
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "true"]
  postgres:
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD", "true"]
  redis:
    healthcheck:
      test: ["CMD", "true"]
`,
    );
    const result = checkComposeProdParity(tmp);
    fs.unlinkSync(tmp);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /postgres.*host ports/.test(error)));
  });
});
