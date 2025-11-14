import { NextApiRequest, NextApiResponse } from 'next';
import { DAONClient } from '@daon/sdk';

// Example API route showing how to protect content server-side
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { content, title, author, license = 'liberation_v1' } = req.body;

    if (!content || !title) {
      return res.status(400).json({ 
        error: 'Content and title are required' 
      });
    }

    // Initialize DAON client
    const daon = new DAONClient({
      apiUrl: process.env.DAON_API_URL || 'https://api.daon.network'
    });

    // Protect the content
    const result = await daon.protect({
      content,
      metadata: {
        title,
        author: author || 'Anonymous',
        publishedAt: new Date().toISOString(),
        url: `${process.env.NEXT_PUBLIC_BASE_URL}/posts/${encodeURIComponent(title)}`,
        platform: 'nextjs-blog'
      },
      license
    });

    if (result.success) {
      res.status(200).json({
        success: true,
        contentHash: result.contentHash,
        txHash: result.txHash,
        verificationUrl: result.verificationUrl,
        message: '🛡️ Content protected by DAON blockchain!'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to protect content'
      });
    }

  } catch (error) {
    console.error('Protection error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}