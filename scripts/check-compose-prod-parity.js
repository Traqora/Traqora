'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_SERVICES = ['api', 'frontend', 'postgres', 'redis'];
const HOST_PORT_RE = /^\s*-\s*["']?\d+:\d+/m;

function loadCompose(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function hasService(text, name) {
  return new RegExp(`^  ${name}:`, 'm').test(text);
}

function serviceBlock(text, name) {
  const start = text.search(new RegExp(`^  ${name}:`, 'm'));
  if (start === -1) return '';
  const rest = text.slice(start + 1);
  const next = rest.search(/^  [A-Za-z0-9_-]+:/m);
  return text.slice(start, next === -1 ? undefined : start + 1 + next);
}

function checkComposeProdParity(filePath) {
  const errors = [];
  if (!fs.existsSync(filePath)) {
    return { ok: false, errors: [`missing compose file: ${filePath}`] };
  }

  const text = loadCompose(filePath);

  for (const name of REQUIRED_SERVICES) {
    if (!hasService(text, name)) {
      errors.push(`missing required production service: ${name}`);
      continue;
    }
    const block = serviceBlock(text, name);
    if (!/healthcheck:/m.test(block)) {
      errors.push(`${name} is missing a healthcheck`);
    }
    if (name === 'api' || name === 'frontend') {
      if (!/NODE_ENV=production/.test(block)) {
        errors.push(`${name} must set NODE_ENV=production`);
      }
    }
  }

  const apiBlock = serviceBlock(text, 'api');
  if (apiBlock && /JWT_SECRET=\$\{JWT_SECRET:-/.test(apiBlock)) {
    errors.push('api JWT_SECRET must not have a default value');
  }
  if (apiBlock && !/JWT_SECRET=\$\{JWT_SECRET\}/.test(apiBlock)) {
    errors.push('api must require JWT_SECRET');
  }

  for (const name of ['postgres', 'redis']) {
    const block = serviceBlock(text, name);
    if (block && HOST_PORT_RE.test(block)) {
      errors.push(`${name} must not publish host ports in production`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function main() {
  const target = process.argv[2] || path.join(__dirname, '..', 'docker-compose.prod.yml');
  const result = checkComposeProdParity(target);
  if (!result.ok) {
    console.error('Compose prod parity check failed:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Compose prod parity check passed for ${target}`);
}

if (require.main === module) {
  main();
}

module.exports = { checkComposeProdParity, REQUIRED_SERVICES };
