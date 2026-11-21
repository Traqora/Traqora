import nodemailer from 'nodemailer';
import { EmailService } from '../../src/services/EmailService';
import { logger } from '../../src/utils/logger';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

jest.mock('../../src/config', () => ({
  config: {
    emailProvider: 'smtp',
    smtpHost: 'localhost',
    smtpPort: 2525,
    smtpSecure: false,
    smtpUser: 'test-user',
    smtpPassword: 'test-password',
    emailFrom: 'noreply@example.test',
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('email outage behavior', () => {
  it('reports a failed delivery and can send successfully after the provider recovers', async () => {
    const sendMail = jest
      .fn()
      .mockRejectedValueOnce(new Error('SMTP service unavailable'))
      .mockResolvedValueOnce({ messageId: 'message-1' });
    const createTransport = nodemailer.createTransport as jest.MockedFunction<
      typeof nodemailer.createTransport
    >;
    createTransport.mockReturnValue({ sendMail } as unknown as nodemailer.Transporter);

    const emailService = new EmailService();
    const message = {
      to: 'traveler@example.test',
      subject: 'Booking confirmed',
      html: '<p>Booking confirmed</p>',
    };

    await expect(emailService.send(message)).resolves.toBe(false);
    await expect(emailService.send(message)).resolves.toBe(true);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to send email',
      expect.objectContaining({ to: message.to }),
    );
    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});
