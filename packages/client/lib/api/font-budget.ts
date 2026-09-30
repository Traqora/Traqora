import { z } from 'zod';

export const FontBudgetInputSchema = z.object({
  fontName: z.string().min(1, 'Font name is required'),
  fileSizeKb: z.number().positive('File size in KB must be positive'),
  maxAllowedKb: z.number().positive('Max allowed KB must be positive').default(100),
});

export type FontBudgetInput = z.infer<typeof FontBudgetInputSchema>;

export interface FontBudgetResult {
  fontName: string;
  fileSizeKb: number;
  maxAllowedKb: number;
  isWithinBudget: boolean;
  excessKb: number;
}

/**
 * Checks whether a font resource satisfies the specified budget constraints.
 *
 * @param input - The font name, file size in KB, and max allowed KB.
 * @returns FontBudgetResult indicating if the font is within budget and any excess.
 * @throws ZodError if inputs are invalid.
 */
export function checkFontBudget(input: FontBudgetInput): FontBudgetResult {
  const parsed = FontBudgetInputSchema.parse(input);
  const isWithinBudget = parsed.fileSizeKb <= parsed.maxAllowedKb;
  const excessKb = isWithinBudget ? 0 : Number((parsed.fileSizeKb - parsed.maxAllowedKb).toFixed(2));

  return {
    fontName: parsed.fontName,
    fileSizeKb: parsed.fileSizeKb,
    maxAllowedKb: parsed.maxAllowedKb,
    isWithinBudget,
    excessKb,
  };
}
