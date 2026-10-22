import { ChatBotService, DEFAULT_FAQS } from '../chatBotService';

describe('ChatBotService', () => {
  let service: ChatBotService;

  beforeEach(() => {
    service = new ChatBotService();
  });

  describe('respond', () => {
    it('should return FAQ response for refund query', () => {
      const response = service.respond('How do I get a refund?');
      expect(response.escalate).toBe(false);
      expect(response.matchedFaqId).toBe('refund-status');
      expect(response.reply).toContain('Refunds are typically processed');
    });

    it('should return FAQ response for booking change query', () => {
      const response = service.respond('I need to change my flight');
      expect(response.escalate).toBe(false);
      expect(response.matchedFaqId).toBe('booking-change');
      expect(response.reply).toContain('change your flight');
    });

    it('should escalate when user requests human agent', () => {
      const response = service.respond('I want to speak to a human');
      expect(response.escalate).toBe(true);
      expect(response.reply).toContain('connecting you with a human agent');
    });

    it('should escalate for unrecognized queries', () => {
      const response = service.respond('something completely random');
      expect(response.escalate).toBe(true);
      expect(response.reply).toContain('connect you with a human agent');
    });

    it('should handle empty messages', () => {
      const response = service.respond('');
      expect(response.escalate).toBe(false);
      expect(response.reply).toContain("didn't catch that");
    });

    it('should be case insensitive', () => {
      const response = service.respond('REFUND STATUS');
      expect(response.matchedFaqId).toBe('refund-status');
    });

    it('should handle check-in queries', () => {
      const response = service.respond('How do I check in?');
      expect(response.matchedFaqId).toBe('check-in');
      expect(response.reply).toContain('24 hours before departure');
    });

    it('should handle baggage queries', () => {
      const response = service.respond('What is my baggage allowance?');
      expect(response.matchedFaqId).toBe('baggage');
      expect(response.reply).toContain('Baggage allowance depends');
    });
  });

  describe('custom FAQs', () => {
    it('should use custom FAQs when provided', () => {
      const customFaqs = [
        {
          id: 'custom',
          keywords: ['custom', 'test'],
          reply: 'This is a custom response',
        },
      ];
      const customService = new ChatBotService(customFaqs);
      const response = customService.respond('custom query');
      expect(response.matchedFaqId).toBe('custom');
      expect(response.reply).toBe('This is a custom response');
    });
  });
});
