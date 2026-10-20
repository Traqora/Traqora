import { AppDataSource } from '../db/dataSource';
import { ChatMessage } from '../db/entities/ChatMessage';
import { logger } from '../utils/logger';

const FAQ_RESPONSES: { keywords: string[]; response: string }[] = [
  {
    keywords: ['refund', 'money back', 'cancel'],
    response:
      'Refunds are typically processed within 5-7 business days after a cancellation is confirmed. You can check your refund status from the Bookings page.',
  },
  {
    keywords: ['delay', 'late', 'delayed'],
    response:
      'You can check real-time flight delay status from your Dashboard. We will also notify you automatically if your flight is delayed.',
  },
  {
    keywords: ['booking', 'reservation', 'reschedule'],
    response:
      'You can view or modify your booking from the Bookings page. Let me know if you would like to speak with a human agent instead.',
  },
];

function matchFaq(text: string): string | null {
  const lower = text.toLowerCase();
  for (const entry of FAQ_RESPONSES) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.response;
    }
  }
  return null;
}

export class ChatService {
  private static instance: ChatService;

  public constructor() {}

  public static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  public async saveMessage(params: {
    userId: string;
    sender: 'user' | 'agent' | 'bot';
    text: string;
    attachments?: string[];
  }): Promise<ChatMessage> {
    const repo = AppDataSource.getRepository(ChatMessage);
    const message = repo.create({
      userId: params.userId,
      sender: params.sender,
      text: params.text,
      attachments: params.attachments || [],
    });
    await repo.save(message);
    logger.info('Chat message saved for user ' + params.userId + ' (sender=' + params.sender + ')');
    return message;
  }

  public async getHistory(userId: string): Promise<ChatMessage[]> {
    const repo = AppDataSource.getRepository(ChatMessage);
    return repo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  public async getBotResponse(text: string): Promise<string | null> {
    return matchFaq(text);
  }
}

export const chatService = ChatService.getInstance();