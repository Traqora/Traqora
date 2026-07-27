import { ChatBotService, DEFAULT_FAQS } from '../../src/services/chatBotService';

describe('ChatBotService (issue #379)', () => {
  const bot = new ChatBotService();

  it('matches a refund question to the refund FAQ', () => {
    const res = bot.respond('When will I get my refund?');
    expect(res.matchedFaqId).toBe('refund-status');
    expect(res.escalate).toBe(false);
    expect(res.reply).toMatch(/refund/i);
  });

  it('matches case-insensitively and against partial phrases', () => {
    const res = bot.respond('I NEED TO RESCHEDULE my flight');
    expect(res.matchedFaqId).toBe('booking-change');
  });

  it('matches baggage questions', () => {
    expect(bot.respond('what is my baggage allowance').matchedFaqId).toBe('baggage');
  });

  it('matches check-in questions', () => {
    expect(bot.respond('how do I check-in online').matchedFaqId).toBe('check-in');
  });

  it('escalates immediately when the user explicitly asks for a human', () => {
    const res = bot.respond('I want to speak to a human agent');
    expect(res.escalate).toBe(true);
    expect(res.matchedFaqId).toBeNull();
  });

  it('escalates when no FAQ matches, rather than guessing', () => {
    const res = bot.respond('my pet iguana needs a visa');
    expect(res.escalate).toBe(true);
    expect(res.matchedFaqId).toBeNull();
  });

  it('handles an empty message without escalating', () => {
    const res = bot.respond('   ');
    expect(res.escalate).toBe(false);
    expect(res.matchedFaqId).toBeNull();
  });

  it('is constructible with a custom FAQ table', () => {
    const custom = new ChatBotService([
      { id: 'custom-1', keywords: ['widget'], reply: 'Widgets are great.' },
    ]);
    expect(custom.respond('tell me about widgets').matchedFaqId).toBe('custom-1');
    expect(custom.respond('tell me about refunds').escalate).toBe(true);
  });

  it('ships with a non-empty default FAQ table', () => {
    expect(DEFAULT_FAQS.length).toBeGreaterThan(0);
    for (const faq of DEFAULT_FAQS) {
      expect(faq.keywords.length).toBeGreaterThan(0);
      expect(faq.reply.length).toBeGreaterThan(0);
    }
  });
});
