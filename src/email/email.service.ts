import { Injectable, Logger } from '@nestjs/common';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  sendEmail(options: EmailOptions): Promise<boolean> {
    // DEV MODE: Log email to console instead of sending
    this.logger.log('========== EMAIL (DEV MODE) ==========');
    this.logger.log(`To: ${options.to}`);
    this.logger.log(`Subject: ${options.subject}`);
    this.logger.log('Body:');
    this.logger.log(options.html);
    this.logger.log('=======================================');

    // In production, you would use nodemailer, SendGrid, SES, etc.
    // Example with nodemailer:
    // const transporter = nodemailer.createTransport({...});
    // await transporter.sendMail(options);

    return Promise.resolve(true);
  }

  async sendPasswordResetEmail(
    email: string,
    treeName: string,
    adminUsername: string,
    resetToken: string,
  ): Promise<boolean> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    const html = `
      <h2>Password Reset Request</h2>
      <p>You requested a password reset for your Family Tree account.</p>
      <p><strong>Tree:</strong> ${treeName}</p>
      <p><strong>Admin Username:</strong> ${adminUsername}</p>
      <p>Click the link below to reset your password:</p>
      <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px;">
        Reset Password
      </a>
      <p style="margin-top: 20px; color: #666;">
        This link will expire in 1 hour.
      </p>
      <p style="color: #666;">
        If you didn't request this, please ignore this email.
      </p>
    `;

    return this.sendEmail({
      to: email,
      subject: `Password Reset for ${treeName}`,
      html,
    });
  }
}
