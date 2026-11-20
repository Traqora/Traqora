import { isRequiredNotice, REQUIRED_NOTIFICATION_CATEGORIES } from './notification';

describe('isRequiredNotice', () => {
  test('required categories are always required', () => {
    expect([...REQUIRED_NOTIFICATION_CATEGORIES].sort()).toEqual(['payment', 'system']);
    expect(isRequiredNotice('system')).toBe(true);
    expect(isRequiredNotice('payment')).toBe(true);
  });

  test('an explicit required flag marks any category as required', () => {
    expect(isRequiredNotice('booking', true)).toBe(true);
    expect(isRequiredNotice('itinerary', true)).toBe(true);
  });

  test('optional categories stay optional', () => {
    expect(isRequiredNotice('booking')).toBe(false);
    expect(isRequiredNotice('marketing')).toBe(false);
    expect(isRequiredNotice('booking', false)).toBe(false);
  });
});
