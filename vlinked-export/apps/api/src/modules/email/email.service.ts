import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private readonly fromEmail: string;
  private readonly isDev: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isDev = this.configService.get('NODE_ENV') !== 'production';
    const apiKey = this.configService.get('RESEND_API_KEY');
    
    if (apiKey && apiKey !== 'mock') {
      this.resend = new Resend(apiKey);
    }
    
    this.fromEmail = this.configService.get('EMAIL_FROM') || 'noreply@vlinked.app';
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    if (this.isDev || !this.resend) {
      this.logger.log(`[MOCK EMAIL] To: ${options.to}, Subject: ${options.subject}`);
      this.logger.debug(`[MOCK EMAIL] HTML: ${options.html.substring(0, 200)}...`);
      return;
    }

    try {
      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      if (result.error) {
        this.logger.error(`Failed to send email: ${result.error.message}`);
        throw new Error(`Email sending failed: ${result.error.message}`);
      }

      this.logger.log(`Email sent successfully to ${options.to}`);
    } catch (error) {
      this.logger.error(`Error sending email: ${error.message}`);
      throw error;
    }
  }

  async sendVerificationEmail(email: string, token: string, displayName: string): Promise<void> {
    const verificationUrl = `${this.configService.get('FRONTEND_URL')}/verify-email?token=${token}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0a66c2;">Bem-vindo ao VLinked!</h1>
        <p>Olá, ${displayName}!</p>
        <p>Obrigado por se registrar. Para ativar sua conta, clique no botão abaixo:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" 
             style="background-color: #0a66c2; color: white; padding: 12px 30px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Verificar Email
          </a>
        </div>
        <p>Ou copie e cole este link no seu navegador:</p>
        <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
        <p style="color: #999; font-size: 12px;">Este link expira em 24 horas.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          Se você não se registrou no VLinked, ignore este email.
        </p>
      </div>
    `;

    const text = `
      Bem-vindo ao VLinked!
      
      Olá, ${displayName}!
      
      Obrigado por se registrar. Para ativar sua conta, acesse:
      ${verificationUrl}
      
      Este link expira em 24 horas.
      
      Se você não se registrou no VLinked, ignore este email.
    `;

    await this.sendEmail({
      to: email,
      subject: 'Verifique seu email - VLinked',
      html,
      text,
    });
  }

  async sendPasswordResetEmail(email: string, token: string, displayName: string): Promise<void> {
    const resetUrl = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${token}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0a66c2;">Redefinição de Senha</h1>
        <p>Olá, ${displayName}!</p>
        <p>Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background-color: #0a66c2; color: white; padding: 12px 30px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Redefinir Senha
          </a>
        </div>
        <p>Ou copie e cole este link no seu navegador:</p>
        <p style="word-break: break-all; color: #666;">${resetUrl}</p>
        <p style="color: #999; font-size: 12px;">Este link expira em 1 hora.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          Se você não solicitou a redefinição de senha, ignore este email.
        </p>
      </div>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Redefinição de Senha - VLinked',
      html,
    });
  }
}
