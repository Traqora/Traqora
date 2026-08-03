/**
 * In-app chat support bot (issue #379).
 *
 * A small keyword-matched FAQ responder — no external NLP dependency. Each
 * FAQ entry lists trigger keywords; the first entry with any keyword found
 * in the (lowercased) message wins. If nothing matches, the message is
 * flagged for human escalation rather than guessing.
 */

export interface ChatFaqEntry {
  id: string;
  keywords: string[];
  reply: string;
}

export interface ChatBotResponse {
  reply: string;
  matchedFaqId: string | null;
  escalate: boolean;
}

export interface ChatMessage {
  id: string;
  from: 'user' | 'bot' | 'agent';
  text: string;
  createdAt: Date;
}

export const DEFAULT_FAQS: ChatFaqEntry[] = [
  {
    id: 'refund-status',
    keywords: ['refund', 'money back', 'reimburse'],
    reply:
      'Refunds are typically processed within 5–7 business days. You can check the status of a specific refund from your booking details page.',
  },
  {
    id: 'booking-change',
    keywords: ['change flight', 'reschedule', 'change booking', 'change my booking'],
    reply:
      'You can change your flight from the "My Bookings" page up to 24 hours before departure, subject to the fare rules on your ticket.',
  },
  {
    id: 'baggage',
    keywords: ['baggage', 'luggage', 'bag allowance'],
    reply:
      'Baggage allowance depends on your fare class and route. You can see your exact allowance on your booking confirmation.',
  },
  {
    id: 'check-in',
    keywords: ['check in', 'check-in', 'boarding pass'],
    reply:
      'Online check-in opens 24 hours before departure. Your boarding pass will be emailed and available in "My Bookings".',
  },
];

const ESCALATION_KEYWORDS = ['human', 'agent', 'representative', 'speak to someone'];

export class ChatBotService {
  constructor(private readonly faqs: ChatFaqEntry[] = DEFAULT_FAQS) {}

  respond(message: string): ChatBotResponse {
    const normalized = message.trim().toLowerCase();

    if (normalized.length === 0) {
      return {
        reply: "I didn't catch that — could you rephrase your question?",
        matchedFaqId: null,
        escalate: false,
      };
    }

    if (ESCALATION_KEYWORDS.some((kw) => normalized.includes(kw))) {
      return {
        reply: "I'm connecting you with a human agent now. Someone will be with you shortly.",
        matchedFaqId: null,
        escalate: true,
      };
    }

    const match = this.faqs.find((faq) => faq.keywords.some((kw) => normalized.includes(kw)));
    if (match) {
      return { reply: match.reply, matchedFaqId: match.id, escalate: false };
    }

    return {
      reply:
        "I'm not sure I can help with that directly. Would you like me to connect you with a human agent?",
      matchedFaqId: null,
      escalate: true,
    };
  }
}

export const chatBotService = new ChatBotService();
