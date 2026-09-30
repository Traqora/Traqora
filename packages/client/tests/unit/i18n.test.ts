import { describe, it, expect } from '@jest/globals';
import { t, setLocale, getLocale, en } from '../../lib/i18n';

describe('i18n framework', () => {
  it('returns correct translation for key', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(t('wallet.connect')).toBe(en['wallet.connect']);
  });

  it('falls back to key if missing', () => {
    // @ts-expect-error testing invalid key
    expect(t('non.existent.key')).toBe('non.existent.key');
  });
});
