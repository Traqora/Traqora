// @ts-ignore
import { generateTypes } from 'openapi-typescript';

async function generateApiTypes() {
  try {
    // Generate TypeScript types from OpenAPI spec
    await generateTypes('http://localhost:3001/api/openapi.json', {
      output: './lib/generated/api.ts',
      httpClient: 'fetch',
      useOptions: true,
      transform: (schema: any, name: string) => {
        // Custom transformation for better type names
        if (name === 'paths') {
          return 'ApiPaths';
        }
        return name;
      },
    });
    
    console.log('✅ API types generated successfully');
  } catch (error) {
    console.error('❌ Failed to generate API types:', error);
  }
}

generateApiTypes();
