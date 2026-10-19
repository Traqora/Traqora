/**
 * Chat support WebSocket handler (issue #331).
 * 
 * Handles real-time chat messages between users, the AI chatbot, and human agents.
 */

import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { chatBotService, ChatMessage } from '../services/chatBotService';
import { v4 as uuidv4 } from 'uuid';

interface ChatSession {
  sessionId: string;
  userId: string;
  messages: ChatMessage[];
  escalated: boolean;
  agentId: string | null;
  createdAt: Date;
  lastActivityAt: Date;
}

const activeSessions = new Map<string, ChatSession>();
const agentAvailability = new Map<string, boolean>();

export function attachChatHandlers(io: Server): void {
  io.of('/chat').on('connection', (socket: Socket) => {
    const userId = socket.handshake.query.userId as string;
    const sessionId = socket.handshake.query.sessionId as string || uuidv4();

    logger.info('chat: user connected', { userId, sessionId, socketId: socket.id });

    if (!activeSessions.has(sessionId)) {
      activeSessions.set(sessionId, {
        sessionId,
        userId,
        messages: [],
        escalated: false,
        agentId: null,
        createdAt: new Date(),
        lastActivityAt: new Date(),
      });
    }

    socket.join(sessionId);

    // Send chat history
    socket.on('get:history', () => {
      const session = activeSessions.get(sessionId);
      if (session) {
        socket.emit('history', { messages: session.messages });
      }
    });

    // Handle incoming user messages
    socket.on('message:send', async (data: { text: string; attachments?: string[] }) => {
      const session = activeSessions.get(sessionId);
      if (!session) return;

      const userMessage: ChatMessage = {
        id: uuidv4(),
        from: 'user',
        text: data.text,
        createdAt: new Date(),
      };

      session.messages.push(userMessage);
      session.lastActivityAt = new Date();

      io.of('/chat').to(sessionId).emit('message:new', userMessage);

      // If escalated to human, notify agents
      if (session.escalated && session.agentId) {
        io.of('/chat').to(`agent-${session.agentId}`).emit('message:new', {
          ...userMessage,
          sessionId,
        });
      } else {
        // Get bot response
        const botResponse = chatBotService.respond(data.text);
        
        const botMessage: ChatMessage = {
          id: uuidv4(),
          from: 'bot',
          text: botResponse.reply,
          createdAt: new Date(),
        };

        session.messages.push(botMessage);
        
        // Check if escalation is needed
        if (botResponse.escalate) {
          session.escalated = true;
          // Assign to available agent
          const availableAgent = findAvailableAgent();
          if (availableAgent) {
            session.agentId = availableAgent;
            io.of('/chat').to(`agent-${availableAgent}`).emit('session:assigned', {
              sessionId,
              userId,
              messages: session.messages,
            });
          }
        }

        setTimeout(() => {
          io.of('/chat').to(sessionId).emit('message:new', botMessage);
        }, 500);
      }
    });

    // Handle agent joining
    socket.on('agent:join', (data: { agentId: string }) => {
      socket.join(`agent-${data.agentId}`);
      agentAvailability.set(data.agentId, true);
      logger.info('chat: agent joined', { agentId: data.agentId });
      
      // Notify about agent availability
      io.of('/chat').emit('agent:online', { agentId: data.agentId });
    });

    // Handle agent leaving
    socket.on('agent:leave', (data: { agentId: string }) => {
      agentAvailability.set(data.agentId, false);
      logger.info('chat: agent left', { agentId: data.agentId });
      io.of('/chat').emit('agent:offline', { agentId: data.agentId });
    });

    // Handle agent responses
    socket.on('agent:message', (data: { sessionId: string; text: string; agentId: string }) => {
      const session = activeSessions.get(data.sessionId);
      if (!session) return;

      const agentMessage: ChatMessage = {
        id: uuidv4(),
        from: 'agent',
        text: data.text,
        createdAt: new Date(),
      };

      session.messages.push(agentMessage);
      session.lastActivityAt = new Date();

      io.of('/chat').to(data.sessionId).emit('message:new', agentMessage);
    });

    // Handle typing indicators
    socket.on('typing:start', () => {
      socket.to(sessionId).emit('typing:user', { userId });
    });

    socket.on('typing:stop', () => {
      socket.to(sessionId).emit('typing:stop', { userId });
    });

    // Handle session end
    socket.on('session:end', () => {
      activeSessions.delete(sessionId);
      socket.leave(sessionId);
      logger.info('chat: session ended', { sessionId });
    });

    // Handle post-chat survey
    socket.on('survey:submit', (data: { rating: number; feedback: string }) => {
      logger.info('chat: survey submitted', { sessionId, ...data });
      socket.emit('survey:received', { success: true });
    });

    socket.on('disconnect', () => {
      logger.info('chat: user disconnected', { userId, sessionId, socketId: socket.id });
    });
  });

  logger.info('Chat WebSocket handlers attached');
}

function findAvailableAgent(): string | null {
  for (const [agentId, available] of agentAvailability.entries()) {
    if (available) return agentId;
  }
  return null;
}

// Cleanup old sessions periodically
setInterval(() => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes
  
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.lastActivityAt.getTime() > timeout) {
      activeSessions.delete(sessionId);
      logger.info('chat: session cleaned up', { sessionId });
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes
