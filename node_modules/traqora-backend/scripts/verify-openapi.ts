import { openApiDocument } from '../src/api/openapi/generator';

console.log('✅ OpenAPI document loaded successfully');
console.log(`Found ${Object.keys(openApiDocument.paths).length} API paths`);
console.log(`OpenAPI version: ${openApiDocument.openapi}`);
console.log(`Info title: ${openApiDocument.info.title}`);

// Basic validation
let hasErrors = false;

try {
  if (!openApiDocument.paths || Object.keys(openApiDocument.paths).length === 0) {
    console.error('❌ No API paths found in OpenAPI document');
    hasErrors = true;
  }
} catch (e) {
  console.error('❌ Error checking API paths:', e);
  hasErrors = true;
}

try {
  if (!openApiDocument.info || !openApiDocument.info.title) {
    console.error('❌ OpenAPI info section is missing or invalid');
    hasErrors = true;
  }
} catch (e) {
  console.error('❌ Error checking OpenAPI info:', e);
  hasErrors = true;
}

if (hasErrors) {
  console.log('❌ OpenAPI integration verification failed');
} else {
  console.log('✅ OpenAPI integration verification passed');
}
