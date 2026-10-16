/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://www.kayak.com/flights/JFK-LAX/2026-08-01/2026-08-10"}
 */

/**
 * Covers the content script's scanning behaviour: initial detection, the
 * debounced re-scan as a results page fills in, the "only report a new low"
 * rule, and the page-state request the popup makes.
 */

interface ChromeMock {
  runtime: {
    sendMessage: jest.Mock;
    onMessage: { addListener: jest.Mock };
  };
}

function makeChromeMock(): ChromeMock {
  return {
    runtime: {
      sendMessage: jest.fn(() => Promise.resolve()),
      onMessage: { addListener: jest.fn() },
    },
  };
}

/**
 * jsdom's `location` is non-configurable, so navigation is simulated with
 * `history.replaceState` — which is also what a real SPA results page does
 * when the user edits their search.
 */
function setUrl(href: string): void {
  const url = new URL(href);
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

const KAYAK_URL = 'https://www.kayak.com/flights/JFK-LAX/2026-08-01/2026-08-10';

describe('content script', () => {
  let chromeMock: ChromeMock;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    chromeMock = makeChromeMock();
    (globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
    // Each test imports a fresh copy of the module, which attaches its own
    // MutationObserver to document.body. Swapping in a new body detaches the
    // observers left behind by earlier tests so they cannot fire extra scans.
    document.body.replaceWith(document.createElement('body'));
    setUrl(KAYAK_URL);
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  /**
   * MutationObserver delivers its records in a microtask, which fake timers
   * do not flush. Yield first, so the observer has queued the debounced
   * re-scan before the timer is advanced.
   */
  async function settle(ms: number): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  }

  const messagesOfType = (type: string) =>
    chromeMock.runtime.sendMessage.mock.calls
      .map(([message]) => message as { type: string; payload: unknown })
      .filter((message) => message.type === type);

  it('announces the detected itinerary and the cheapest fare', async () => {
    document.body.innerHTML = `
      <div class="price">$512.00</div>
      <div class="price">$412.30</div>
    `;

    const { start } = await import('@/extension/src/content-script');
    start();

    const detected = messagesOfType('ITINERARY_DETECTED');
    expect(detected).toHaveLength(1);
    expect(detected[0].payload).toMatchObject({
      origin: 'JFK',
      destination: 'LAX',
      departureDate: '2026-08-01',
      returnDate: '2026-08-10',
    });

    const prices = messagesOfType('PRICES_FOUND');
    expect(prices).toHaveLength(1);
    expect(prices[0].payload).toMatchObject({
      sightings: [expect.objectContaining({ amountCents: 41230 })],
    });
  });

  it('says nothing on a page with no recognisable itinerary', async () => {
    setUrl('https://www.kayak.com/hotels');
    document.body.innerHTML = '<div class="price">$412.30</div>';

    const { start } = await import('@/extension/src/content-script');
    start();

    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('reports a lower price found after the page re-renders', async () => {
    document.body.innerHTML = '<div class="price">$512.00</div>';

    const { start } = await import('@/extension/src/content-script');
    start();
    expect(messagesOfType('PRICES_FOUND')).toHaveLength(1);

    document.body.innerHTML = '<div class="price">$389.00</div>';
    await settle(2000);

    const prices = messagesOfType('PRICES_FOUND');
    expect(prices).toHaveLength(2);
    expect(prices[1].payload).toMatchObject({
      sightings: [expect.objectContaining({ amountCents: 38900 })],
    });
  });

  it('does not re-report a price that is no lower than the last one', async () => {
    document.body.innerHTML = '<div class="price">$389.00</div>';

    const { start } = await import('@/extension/src/content-script');
    start();
    expect(messagesOfType('PRICES_FOUND')).toHaveLength(1);

    document.body.innerHTML = '<div class="price">$450.00</div>';
    await settle(2000);

    expect(messagesOfType('PRICES_FOUND')).toHaveLength(1);
  });

  it('resets its baseline when the user searches a different route', async () => {
    document.body.innerHTML = '<div class="price">$389.00</div>';

    const { start } = await import('@/extension/src/content-script');
    start();

    setUrl('https://www.kayak.com/flights/SFO-ORD/2026-09-15');
    document.body.innerHTML = '<div class="price">$450.00</div>';
    await settle(2000);

    expect(messagesOfType('ITINERARY_DETECTED')).toHaveLength(2);
    // The higher price is reported because it is a new route's first sighting.
    const prices = messagesOfType('PRICES_FOUND');
    expect(prices).toHaveLength(2);
    expect(prices[1].payload).toMatchObject({
      sightings: [expect.objectContaining({ amountCents: 45000 })],
    });
  });

  it('coalesces a burst of mutations into a single re-scan', async () => {
    document.body.innerHTML = '<div class="price">$512.00</div>';

    const { start } = await import('@/extension/src/content-script');
    start();

    document.body.innerHTML = '<div class="price">$400.00</div>';
    await settle(500);
    document.body.innerHTML = '<div class="price">$390.00</div>';
    await settle(500);
    document.body.innerHTML = '<div class="price">$380.00</div>';
    await settle(2000);

    const prices = messagesOfType('PRICES_FOUND');
    expect(prices).toHaveLength(2);
    expect(prices[1].payload).toMatchObject({
      sightings: [expect.objectContaining({ amountCents: 38000 })],
    });
  });

  it('answers the popup with the current page state', async () => {
    document.body.innerHTML = '<div class="price">$412.30</div>';

    const { start } = await import('@/extension/src/content-script');
    start();

    const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0] as (
      message: unknown,
      sender: unknown,
      sendResponse: (response?: unknown) => void,
    ) => boolean;

    const sendResponse = jest.fn();
    const handled = listener({ type: 'GET_PAGE_STATE' }, {}, sendResponse);

    expect(handled).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        itinerary: expect.objectContaining({ origin: 'JFK' }),
        sightings: [expect.objectContaining({ amountCents: 41230 })],
      }),
    );
  });

  it('ignores messages it does not handle', async () => {
    const { start } = await import('@/extension/src/content-script');
    start();

    const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0] as (
      message: unknown,
      sender: unknown,
      sendResponse: (response?: unknown) => void,
    ) => boolean;

    expect(listener({ type: 'SOMETHING_ELSE' }, {}, jest.fn())).toBe(false);
  });

  it('survives a service worker that rejects the message', async () => {
    chromeMock.runtime.sendMessage.mockRejectedValue(new Error('worker asleep'));
    document.body.innerHTML = '<div class="price">$412.30</div>';

    const { start } = await import('@/extension/src/content-script');

    expect(() => start()).not.toThrow();
  });
});
