/**
 * QR Code Generator Utility
 * 
 * Generates QR codes for TOTP setup LOCALLY.
 * NEVER sends secrets to third parties (including Google).
 */

import QRCode from 'qrcode';

/**
 * Generate QR code data URL for TOTP setup
 * 
 * @param otpauthUrl - otpauth:// URL
 * @returns Data URL for QR code image (generated locally, never sent to Google)
 */
export async function generateQRCodeUrl(otpauthUrl: string): Promise<string> {
  try {
    // Generate QR code as data URL (base64 PNG)
    // This happens LOCALLY - secret never leaves the server
    const dataUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 200,
      margin: 1,
    });
    
    return dataUrl;
  } catch (error) {
    console.error('QR code generation failed:', error);
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Generate QR code as SVG (for better quality)
 * 
 * @param otpauthUrl - otpauth:// URL
 * @returns SVG string
 */
export function generateQRCodeSVG(otpauthUrl: string): string {
  // Placeholder for future implementation with qrcode library
  // For now, return instruction to use external library
  throw new Error('SVG QR code generation not yet implemented. Use generateQRCodeUrl() instead.');
}

/**
 * Validate otpauth:// URL format
 */
export function isValidOtpauthUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'otpauth:' && parsed.host === 'totp';
  } catch {
    return false;
  }
}
