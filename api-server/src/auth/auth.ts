import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import db from '../database/client.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '7d'; // 7 days
const MAGIC_LINK_EXPIRY_MINUTES = 15;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Email transporter configuration
 */
const emailTransporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Generate a JWT token for authenticated user
 */
export function generateToken(userId: number, email?: string): string {
  return jwt.sign(
    { userId, email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): { userId: number; email?: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email?: string };
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Generate a cryptographically secure random token
 */
function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Send magic link email for passwordless login
 */
export async function sendMagicLink(email: string): Promise<{ success: boolean; message: string }> {
  try {
    // Generate secure token
    const token = generateSecureToken();
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

    // Check if user exists
    let user = await db.users.findByEmail(email);
    let userId: number | undefined;

    if (user) {
      userId = user.id;
    }

    // Store magic link token
    await db.magicLinks.create(email, token, expiresAt, userId);

    // Generate magic link URL
    const magicLinkUrl = `${FRONTEND_URL}/auth/verify?token=${token}`;

    // Send email
    const mailOptions = {
      from: process.env.SMTP_FROM || '"DAON" <noreply@daon.network>',
      to: email,
      subject: 'Your DAON Magic Link',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { 
              display: inline-block; 
              background: #4F46E5; 
              color: white; 
              padding: 12px 24px; 
              text-decoration: none; 
              border-radius: 6px;
              margin: 20px 0;
            }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Welcome to DAON!</h2>
            <p>Click the button below to sign in to your account. This link will expire in ${MAGIC_LINK_EXPIRY_MINUTES} minutes.</p>
            
            <a href="${magicLinkUrl}" class="button">Sign In to DAON</a>
            
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #4F46E5;">${magicLinkUrl}</p>
            
            <div class="footer">
              <p>If you didn't request this email, you can safely ignore it.</p>
              <p>DAON - Protecting creativity with blockchain technology</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Welcome to DAON!
        
        Click this link to sign in: ${magicLinkUrl}
        
        This link will expire in ${MAGIC_LINK_EXPIRY_MINUTES} minutes.
        
        If you didn't request this email, you can safely ignore it.
        
        DAON - Protecting creativity with blockchain technology
      `,
    };

    if (process.env.SMTP_USER) {
      await emailTransporter.sendMail(mailOptions);
    } else {
      // In development, just log the link
      console.log('🔗 Magic Link (dev mode):', magicLinkUrl);
    }

    return {
      success: true,
      message: 'Magic link sent! Check your email.',
    };
  } catch (error) {
    console.error('Magic link sending failed:', error);
    return {
      success: false,
      message: 'Failed to send magic link. Please try again.',
    };
  }
}

/**
 * Verify magic link token and create/login user
 */
export async function verifyMagicLink(token: string): Promise<{
  success: boolean;
  token?: string;
  user?: any;
  message?: string;
}> {
  try {
    // Find magic link record
    const magicLink = await db.magicLinks.findByToken(token);

    if (!magicLink) {
      return {
        success: false,
        message: 'Invalid or expired magic link',
      };
    }

    // Mark token as used
    await db.magicLinks.markUsed(token);

    // Get or create user
    let user = await db.users.findByEmail(magicLink.email);

    if (!user) {
      // Create new user
      user = await db.users.create({
        email: magicLink.email,
        username: magicLink.email.split('@')[0], // Default username from email
      });

      await db.activity.log({
        user_id: user.id,
        action: 'user_registered',
        entity_type: 'user',
        entity_id: user.id,
        metadata: { method: 'magic_link' },
      });
    }

    // Verify email if not already verified
    if (!user.email_verified) {
      await db.users.verifyEmail(user.id);
    }

    // Update last login
    await db.users.updateLastLogin(user.id);

    // Log activity
    await db.activity.log({
      user_id: user.id,
      action: 'user_login',
      entity_type: 'user',
      entity_id: user.id,
      metadata: { method: 'magic_link' },
    });

    // Generate JWT
    const jwtToken = generateToken(user.id, user.email);

    return {
      success: true,
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        blockchain_address: user.blockchain_address,
      },
    };
  } catch (error) {
    console.error('Magic link verification failed:', error);
    return {
      success: false,
      message: 'Failed to verify magic link',
    };
  }
}

/**
 * Handle Discord OAuth callback
 */
export async function handleDiscordOAuth(code: string): Promise<{
  success: boolean;
  token?: string;
  user?: any;
  message?: string;
}> {
  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID || '',
        client_secret: process.env.DISCORD_CLIENT_SECRET || '',
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI || '',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return {
        success: false,
        message: 'Failed to get Discord access token',
      };
    }

    // Get user info from Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const discordUser = await userResponse.json();

    // Get or create user
    let user = await db.users.findByDiscordId(discordUser.id);

    if (!user) {
      // Create new user
      user = await db.users.create({
        discord_id: discordUser.id,
        username: discordUser.username,
        email: discordUser.email, // Discord provides verified email
      });

      await db.activity.log({
        user_id: user.id,
        action: 'user_registered',
        entity_type: 'user',
        entity_id: user.id,
        metadata: { method: 'discord_oauth' },
      });
    }

    // Update last login
    await db.users.updateLastLogin(user.id);

    // Store OAuth session (optional, for refresh tokens)
    // await storeOAuthSession(user.id, 'discord', tokenData);

    // Log activity
    await db.activity.log({
      user_id: user.id,
      action: 'user_login',
      entity_type: 'user',
      entity_id: user.id,
      metadata: { method: 'discord_oauth' },
    });

    // Generate JWT
    const jwtToken = generateToken(user.id, user.email);

    return {
      success: true,
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        discord_id: user.discord_id,
      },
    };
  } catch (error) {
    console.error('Discord OAuth failed:', error);
    return {
      success: false,
      message: 'Discord authentication failed',
    };
  }
}

/**
 * Handle Google OAuth callback
 */
export async function handleGoogleOAuth(code: string): Promise<{
  success: boolean;
  token?: string;
  user?: any;
  message?: string;
}> {
  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return {
        success: false,
        message: 'Failed to get Google access token',
      };
    }

    // Get user info from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const googleUser = await userResponse.json();

    // Get or create user
    let user = await db.users.findByGoogleId(googleUser.id);

    if (!user) {
      // Create new user
      user = await db.users.create({
        google_id: googleUser.id,
        username: googleUser.name,
        email: googleUser.email,
      });

      await db.activity.log({
        user_id: user.id,
        action: 'user_registered',
        entity_type: 'user',
        entity_id: user.id,
        metadata: { method: 'google_oauth' },
      });
    }

    // Update last login
    await db.users.updateLastLogin(user.id);

    // Log activity
    await db.activity.log({
      user_id: user.id,
      action: 'user_login',
      entity_type: 'user',
      entity_id: user.id,
      metadata: { method: 'google_oauth' },
    });

    // Generate JWT
    const jwtToken = generateToken(user.id, user.email);

    return {
      success: true,
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        google_id: user.google_id,
      },
    };
  } catch (error) {
    console.error('Google OAuth failed:', error);
    return {
      success: false,
      message: 'Google authentication failed',
    };
  }
}

/**
 * Middleware to authenticate requests
 */
export function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'Please provide a valid authentication token',
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
      message: 'Your authentication token is invalid or expired',
    });
  }

  // Attach user info to request
  req.user = decoded;
  next();
}

export default {
  generateToken,
  verifyToken,
  sendMagicLink,
  verifyMagicLink,
  handleDiscordOAuth,
  handleGoogleOAuth,
  authMiddleware,
};
