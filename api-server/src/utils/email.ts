/**
 * Email Service
 * 
 * Sends magic links, 2FA notifications, and security alerts.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '1025', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'DAON <noreply@daon.network>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4000';

let transporter: Transporter | null = null;

/**
 * Initialize email transporter
 */
function getTransporter(): Transporter {
  if (transporter) {
    return transporter;
  }
  
  // MailHog and some SMTP servers don't require auth
  const requiresAuth = SMTP_USER && SMTP_PASS;
  
  if (!SMTP_HOST) {
    console.warn('⚠️  SMTP_HOST not configured. Emails will be logged to console.');
    return null as any;
  }
  
  const config: any = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465
  };
  
  // Add auth only if credentials provided
  if (requiresAuth) {
    config.auth = {
      user: SMTP_USER,
      pass: SMTP_PASS
    };
  }
  
  transporter = nodemailer.createTransport(config);
  
  return transporter;
}

/**
 * Send magic link email
 */
export async function sendMagicLinkEmail(email: string, token: string, magicLinkId?: number): Promise<void> {
  const magicLink = `${FRONTEND_URL}/auth/verify?token=${token}`;
  const expiresIn = 30; // minutes
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sign in to DAON</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 10px;
        }
        .header h1 {
          color: white;
          margin: 0;
          font-size: 28px;
        }
        .content {
          background: #f9f9f9;
          padding: 30px;
          border-radius: 10px;
          margin-bottom: 20px;
        }
        .button {
          display: inline-block;
          padding: 15px 30px;
          background: #667eea;
          color: white !important;
          text-decoration: none;
          border-radius: 5px;
          font-weight: bold;
          margin: 20px 0;
        }
        .button:hover {
          background: #5568d3;
        }
        .footer {
          text-align: center;
          color: #666;
          font-size: 14px;
          margin-top: 30px;
        }
        .code-box {
          background: white;
          padding: 15px;
          border-radius: 5px;
          border: 2px dashed #667eea;
          font-family: monospace;
          word-break: break-all;
          margin: 15px 0;
        }
        .warning {
          background: #fff3cd;
          border: 1px solid #ffc107;
          padding: 15px;
          border-radius: 5px;
          margin: 15px 0;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🛡️ Sign in to DAON</h1>
      </div>
      
      <div class="content">
        <h2>Welcome back!</h2>
        <p>Click the button below to sign in to your DAON account. This link will expire in ${expiresIn} minutes.</p>
        
        <center>
          <a href="${magicLink}" class="button">Sign In to DAON</a>
        </center>
        
        <p>Or copy and paste this link into your browser:</p>
        <div class="code-box">${magicLink}</div>
        
        <div class="warning">
          <strong>⚠️ Security Note:</strong> Never share this link with anyone. DAON will never ask for this link via email, phone, or social media.
        </div>
      </div>
      
      <div class="footer">
        <p>If you didn't request this email, you can safely ignore it.</p>
        <p>
          <a href="https://docs.daon.network">Documentation</a> •
          <a href="https://discord.gg/daon">Community</a> •
          <a href="https://ko-fi.com/greenfieldoverride">Support DAON</a>
        </p>
        <p style="color: #999; font-size: 12px;">
          DAON Creator Protection System<br>
          Protecting creativity with blockchain technology
        </p>
      </div>
    </body>
    </html>
  `;
  
  const text = `
Sign in to DAON

Click this link to sign in to your account:
${magicLink}

This link will expire in ${expiresIn} minutes.

If you didn't request this email, you can safely ignore it.

---
DAON Creator Protection System
https://daon.network
  `.trim();
  
  await sendEmail(email, 'Sign in to DAON', html, text, magicLinkId);
}

/**
 * Send email change confirmation to old email
 */
export async function sendEmailChangeConfirmation(
  oldEmail: string,
  newEmail: string,
  token: string
): Promise<void> {
  const confirmLink = `${FRONTEND_URL}/auth/email/confirm-change?token=${token}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Confirm Email Change - DAON</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding: 20px;
          background: #667eea;
          border-radius: 10px;
        }
        .header h1 {
          color: white;
          margin: 0;
        }
        .content {
          background: #f9f9f9;
          padding: 30px;
          border-radius: 10px;
        }
        .button {
          display: inline-block;
          padding: 15px 30px;
          background: #667eea;
          color: white !important;
          text-decoration: none;
          border-radius: 5px;
          font-weight: bold;
          margin: 20px 0;
        }
        .danger-button {
          background: #dc3545;
        }
        .alert {
          background: #fff3cd;
          border: 2px solid #ffc107;
          padding: 20px;
          border-radius: 5px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🔒 Email Change Request</h1>
      </div>
      
      <div class="content">
        <h2>Confirm Email Change</h2>
        <p>Someone requested to change your DAON account email from:</p>
        <p><strong>${oldEmail}</strong></p>
        <p>to:</p>
        <p><strong>${newEmail}</strong></p>
        
        <div class="alert">
          <strong>⚠️ Was this you?</strong><br>
          If you requested this change, click the button below to confirm.
          If you didn't request this, click "Cancel Request" to secure your account.
        </div>
        
        <center>
          <a href="${confirmLink}" class="button">Confirm Email Change</a><br>
          <a href="${confirmLink}&cancel=true" class="button danger-button">Cancel Request</a>
        </center>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 14px; margin-top: 30px;">
        <p>DAON Creator Protection System</p>
      </div>
    </body>
    </html>
  `;
  
  const text = `
Confirm Email Change - DAON

Someone requested to change your account email from ${oldEmail} to ${newEmail}.

If this was you, click here to confirm: ${confirmLink}

If you didn't request this, click here to cancel: ${confirmLink}&cancel=true

---
DAON Creator Protection System
  `.trim();
  
  await sendEmail(oldEmail, 'Confirm Email Change - DAON', html, text);
}

/**
 * Send verification to new email
 */
export async function sendEmailChangeVerification(
  newEmail: string,
  token: string
): Promise<void> {
  const verifyLink = `${FRONTEND_URL}/auth/email/verify-new?token=${token}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Verify New Email - DAON</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .button {
          display: inline-block;
          padding: 15px 30px;
          background: #28a745;
          color: white !important;
          text-decoration: none;
          border-radius: 5px;
          font-weight: bold;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <h1>✅ Verify Your New Email</h1>
      <p>Click the button below to complete your email change:</p>
      <center>
        <a href="${verifyLink}" class="button">Verify Email</a>
      </center>
    </body>
    </html>
  `;
  
  const text = `Verify Your New Email - DAON\n\nClick here: ${verifyLink}`;
  
  await sendEmail(newEmail, 'Verify Your New Email - DAON', html, text);
}

/**
 * Send new device login notification
 */
export async function sendNewDeviceNotification(
  email: string,
  deviceName: string,
  location: string
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Device Login - DAON</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .alert {
          background: #d1ecf1;
          border: 2px solid #0c5460;
          padding: 20px;
          border-radius: 5px;
        }
      </style>
    </head>
    <body>
      <h1>🔐 New Device Login</h1>
      <div class="alert">
        <p><strong>Your account was accessed from a new device:</strong></p>
        <ul>
          <li><strong>Device:</strong> ${deviceName}</li>
          <li><strong>Location:</strong> ${location}</li>
          <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        <p>If this was you, no action needed. If not, secure your account immediately at ${FRONTEND_URL}/settings/security</p>
      </div>
    </body>
    </html>
  `;
  
  const text = `New Device Login - DAON\n\nDevice: ${deviceName}\nLocation: ${location}\nTime: ${new Date().toLocaleString()}`;
  
  await sendEmail(email, 'New Device Login - DAON', html, text);
}

/**
 * Send generic email
 */
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  magicLinkId?: number
): Promise<void> {
  const transport = getTransporter();
  
  if (!transport) {
    // Fallback: log to console
    console.log('\n📧 Email (would be sent in production):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`\n${text}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Update database status (dev mode - mark as "sent" even though just logged)
    if (magicLinkId) {
      await updateEmailStatus(magicLinkId, 'sent', null, 'console-dev');
    }
    return;
  }
  
  try {
    const info = await transport.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html,
      text,
      encoding: 'base64' // Prevents quoted-printable line wrapping of long URLs
    });
    
    console.log(`✅ Email sent to ${to}: ${subject} (Message ID: ${info.messageId})`);
    
    // Update database status
    if (magicLinkId) {
      await updateEmailStatus(magicLinkId, 'sent', info.messageId);
    }
  } catch (error: any) {
    console.error(`❌ Failed to send email to ${to}:`, error.message);
    
    // Update database with failure
    if (magicLinkId) {
      await updateEmailStatus(magicLinkId, 'failed', null, error.message);
    }
    
    throw error;
  }
}

/**
 * Update email delivery status in database
 */
async function updateEmailStatus(
  magicLinkId: number,
  status: 'pending' | 'sent' | 'failed' | 'bounced',
  messageId: string | null = null,
  error: string | null = null
): Promise<void> {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    await pool.query(
      `UPDATE magic_links 
       SET email_status = $1, 
           email_sent_at = CURRENT_TIMESTAMP,
           email_message_id = $2,
           email_error = $3
       WHERE id = $4`,
      [status, messageId, error, magicLinkId]
    );
    
    await pool.end();
  } catch (dbError: any) {
    console.error('Failed to update email status in database:', dbError.message);
    // Don't throw - email operation should not fail due to tracking failure
  }
}

/**
 * Verify SMTP configuration
 */
export async function verifyEmailConfig(): Promise<boolean> {
  const transport = getTransporter();
  
  if (!transport) {
    return false;
  }
  
  try {
    await transport.verify();
    console.log('✅ SMTP configuration verified');
    return true;
  } catch (error: any) {
    console.error('❌ SMTP configuration error:', error.message);
    return false;
  }
}
