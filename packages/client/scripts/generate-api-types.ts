import openapiTS from 'openapi-typescript';
import fs from 'fs';
import path from 'path';

async function generateApiTypes() {
  try {
    const specUrl = process.env.OPENAPI_SPEC_URL || 'http://localhost:3001/api/openapi.json';
    
    console.log(`📡 Fetching OpenAPI spec from: ${specUrl}`);
    
    // Generate TypeScript types from OpenAPI spec
    const output = await openapiTS(specUrl, {
      // Use fetch client for better compatibility
      httpClient: 'fetch',
      // Add type transformations
      transform: (schema: any, name: string) => {
        // Custom transformation for better type names
        if (name === 'paths') {
          return 'ApiPaths';
        }
        return name;
      },
    });
    
    // Ensure output directory exists
    const outputPath = path.join(__dirname, '../lib/generated/api.ts');
    const outputDir = path.dirname(outputPath);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, output);
    console.log(`✅ API types generated successfully at: ${outputPath}`);
  } catch (error) {
    console.error('❌ Failed to generate API types:', error);
    
    // Exit with error code if in CI environment
    if (process.env.CI) {
      process.exit(1);
    }
  }
}

generateApiTypes();