# Image & Font Budget Client

## Overview
The Image Font Budget client utility (`packages/client/lib/api/font-budget.ts`) provides a deterministic validation layer for font asset sizes used across Traqora client views and performance pipelines.

## Contract & Inputs

- `fontName` (`string`, min length 1): Identifier or filename of the font resource.
- `fileSizeKb` (`number`, positive): Measured file size of the font asset in kilobytes.
- `maxAllowedKb` (`number`, positive, optional): Maximum permitted file size in kilobytes (defaults to `100` KB).

## Outputs (`FontBudgetResult`)

- `fontName`: The validated font name.
- `fileSizeKb`: The tested size in KB.
- `maxAllowedKb`: The budget threshold used.
- `isWithinBudget`: Boolean indicating whether `fileSizeKb <= maxAllowedKb`.
- `excessKb`: Calculated amount exceeding the budget limit (`0` if within budget).

## Error Cases

If invalid inputs are supplied (e.g. empty font name, negative or zero file size, or non-positive max allowed KB), `ZodError` is thrown.

## Usage Example

```typescript
import { checkFontBudget } from '@/lib/api/font-budget';

const auditResult = checkFontBudget({
  fontName: 'Geist-Sans.woff2',
  fileSizeKb: 72.5,
  maxAllowedKb: 90,
});

if (!auditResult.isWithinBudget) {
  console.warn(`Font asset over budget by ${auditResult.excessKb} KB`);
}
```
