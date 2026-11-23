import {
  assertPassengerAgeRules,
  PassengerAgeValidationError,
  validatePassengerAges,
} from './passengerAgeRules';

const departure = '2026-11-02T08:00:00.000Z';

describe('infant and child passenger rules (#907)', () => {
  it('accepts an adult travelling with one infant and one child', () => {
    const decision = validatePassengerAges({
      itineraryDeparture: departure,
      passengers: [
        { id: 'adult', dateOfBirth: '1990-01-01' },
        { id: 'child', dateOfBirth: '2018-06-01' },
        { id: 'infant', dateOfBirth: '2025-12-01' },
      ],
    });
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.passengers.map((passenger) => passenger.band)).toEqual([
        'adult',
        'child',
        'infant',
      ]);
    }
    expect(
      assertPassengerAgeRules({
        itineraryDeparture: departure,
        passengers: [
          { id: 'adult', dateOfBirth: '1990-01-01' },
          { id: 'infant', dateOfBirth: '2025-12-01' },
        ],
      }).ok,
    ).toBe(true);
  });

  it('rejects an infant travelling alone', () => {
    const decision = validatePassengerAges({
      itineraryDeparture: departure,
      passengers: [{ id: 'infant', dateOfBirth: '2025-12-01' }],
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.errors.map((error) => error.code)).toEqual(
        expect.arrayContaining(['CHILD_REQUIRES_ADULT', 'INFANT_REQUIRES_ADULT', 'TOO_MANY_INFANTS']),
      );
    }
    expect(() =>
      assertPassengerAgeRules({
        itineraryDeparture: departure,
        passengers: [{ id: 'infant', dateOfBirth: '2025-12-01' }],
      }),
    ).toThrow(PassengerAgeValidationError);
  });

  it('rejects a date of birth after departure and an empty party', () => {
    const future = validatePassengerAges({
      itineraryDeparture: departure,
      passengers: [{ id: 'p', dateOfBirth: '2027-01-01' }],
    });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.errors[0].code).toBe('INVALID_DATE_OF_BIRTH');

    const empty = validatePassengerAges({ itineraryDeparture: departure, passengers: [] });
    expect(empty.ok).toBe(false);
  });

  it('succeeds on retry after an adult is added to the party', () => {
    const alone = { itineraryDeparture: departure, passengers: [{ id: 'child', dateOfBirth: '2018-06-01' }] };
    expect(validatePassengerAges(alone).ok).toBe(false);
    const withAdult = validatePassengerAges({
      itineraryDeparture: departure,
      passengers: [
        { id: 'child', dateOfBirth: '2018-06-01' },
        { id: 'adult', dateOfBirth: '1985-04-04' },
      ],
    });
    expect(withAdult.ok).toBe(true);
  });
});
