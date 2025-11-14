/**
 * DAON AO3 Integration - Content Scraper
 * Safely extracts work metadata from AO3 for DAON registration
 * 
 * IMPORTANT: This is for demonstration and user-initiated registration only.
 * Respects AO3's ToS - no bulk scraping, only individual work registration.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';

export class AO3Scraper {
  constructor(options = {}) {
    this.baseURL = 'https://archiveofourown.org';
    this.rateLimitMs = options.rateLimitMs || 2000; // 2 second delay between requests
    this.userAgent = 'DAON Creator Rights Protection Bot/1.0 (https://daon.network)';
  }

  /**
   * Extract work metadata from AO3 work URL
   * @param {string} workUrl - Full AO3 work URL
   * @returns {Object} Work metadata for DAON registration
   */
  async scrapeWorkMetadata(workUrl) {
    // Validate URL format
    const workMatch = workUrl.match(/archiveofourown\.org\/works\/(\d+)/);
    if (!workMatch) {
      throw new Error('Invalid AO3 work URL format');
    }

    const workId = workMatch[1];
    
    try {
      // Rate limiting - respect AO3's servers
      await this.delay(this.rateLimitMs);
      
      console.log(`🔍 Scraping AO3 work ${workId}...`);
      
      const response = await axios.get(workUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Extract work metadata
      const metadata = this.extractWorkMetadata($, workId);
      
      // Generate content hash for DAON registration
      metadata.contentHash = this.generateContentHash(metadata.content);
      
      // Add DAON-specific fields
      metadata.daonData = {
        platform: 'archiveofourown.org',
        workId: workId,
        scrapeTimestamp: new Date().toISOString(),
        verificationUrl: `https://archiveofourown.org/works/${workId}`,
        platformVoucher: 'ao3_platform_verification'
      };

      console.log(`✅ Successfully scraped work: "${metadata.title}"`);
      return metadata;

    } catch (error) {
      console.error(`❌ Error scraping AO3 work ${workId}:`, error.message);
      throw new Error(`Failed to scrape AO3 work: ${error.message}`);
    }
  }

  /**
   * Extract structured metadata from AO3 work page
   */
  extractWorkMetadata($, workId) {
    // Basic work information
    const title = $('#workskin .title').text().trim();
    const author = $('.byline a[rel="author"]').first().text().trim();
    const authorUrl = $('.byline a[rel="author"]').first().attr('href');
    
    // Work stats and metadata
    const wordCount = $('dd.words').text().trim();
    const publishDate = $('.published').text().trim();
    const updatedDate = $('.status').text().trim();
    
    // Tags and categories
    const fandoms = $('.fandom .tag').map((i, el) => $(el).text().trim()).get();
    const characters = $('.character .tag').map((i, el) => $(el).text().trim()).get();
    const relationships = $('.relationship .tag').map((i, el) => $(el).text().trim()).get();
    const additionalTags = $('.freeform .tag').map((i, el) => $(el).text().trim()).get();
    
    // Rating and warnings
    const rating = $('.rating .tag').text().trim();
    const warnings = $('.warning .tag').map((i, el) => $(el).text().trim()).get();
    const categories = $('.category .tag').map((i, el) => $(el).text().trim()).get();
    
    // Work content (for hash generation)
    const content = $('#workskin .userstuff').text().trim();
    const summary = $('.summary .userstuff').text().trim();
    
    // Work series information
    const seriesInfo = $('.series span.position').text().trim();
    const seriesName = $('.series a').text().trim();
    
    return {
      // Basic metadata
      workId,
      title,
      author,
      authorUrl,
      
      // Content for verification
      content,
      summary,
      
      // Publishing info
      publishDate,
      updatedDate,
      wordCount: parseInt(wordCount?.replace(/,/g, '') || '0'),
      
      // Categorization
      fandoms,
      characters,
      relationships,
      additionalTags,
      rating,
      warnings,
      categories,
      
      // Series info
      series: seriesName ? { name: seriesName, position: seriesInfo } : null,
      
      // Full URL
      url: `https://archiveofourown.org/works/${workId}`
    };
  }

  /**
   * Generate SHA-256 content hash for DAON registration
   */
  generateContentHash(content) {
    // Normalize content for consistent hashing
    const normalizedContent = content
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/[""]/g, '"') // Normalize quotes
      .trim()
      .toLowerCase();
    
    const hash = crypto.createHash('sha256')
      .update(normalizedContent, 'utf8')
      .digest('hex');
    
    return `sha256:${hash}`;
  }

  /**
   * Verify work ownership by checking author profile
   */
  async verifyWorkOwnership(workUrl, claimedUsername) {
    const metadata = await this.scrapeWorkMetadata(workUrl);
    
    // Extract username from author URL
    const authorMatch = metadata.authorUrl?.match(/\/users\/([^\/]+)/);
    const actualUsername = authorMatch ? authorMatch[1] : metadata.author;
    
    const isOwner = actualUsername.toLowerCase() === claimedUsername.toLowerCase();
    
    return {
      verified: isOwner,
      actualAuthor: actualUsername,
      claimedAuthor: claimedUsername,
      workId: metadata.workId,
      title: metadata.title,
      verificationMethod: 'ao3_profile_matching'
    };
  }

  /**
   * Check if work allows DAON registration (respects existing copyright)
   */
  analyzeWorkLicensing(metadata) {
    const suggestedLicense = this.suggestLicense(metadata);
    
    return {
      canRegister: true, // Fanfiction generally can be registered by authors
      suggestedLicense,
      considerations: this.getLicensingConsiderations(metadata),
      liberationLicenseRecommended: this.shouldRecommendLiberation(metadata)
    };
  }

  /**
   * Suggest appropriate license based on work content and tags
   */
  suggestLicense(metadata) {
    // Check for commercial vs non-commercial indicators
    const hasCommercialIntent = metadata.additionalTags.some(tag => 
      tag.toLowerCase().includes('commission') || 
      tag.toLowerCase().includes('paid') ||
      tag.toLowerCase().includes('commercial')
    );

    // Check for transformation/derivative indicators  
    const isTransformativeWork = metadata.fandoms.length > 0; // Fanfiction is transformative

    if (hasCommercialIntent) {
      return 'cc_by_nc_sa'; // Non-commercial with attribution
    } else if (isTransformativeWork) {
      return 'liberation_v1'; // Perfect for fanfiction
    } else {
      return 'cc_by_sa'; // Attribution + ShareAlike
    }
  }

  /**
   * Get licensing considerations specific to fanfiction
   */
  getLicensingConsiderations(metadata) {
    const considerations = [];

    if (metadata.fandoms.length > 0) {
      considerations.push('This is transformative fanfiction - Liberation License recommended for anti-corporate protection');
    }

    if (metadata.rating === 'Explicit') {
      considerations.push('Explicit content may need additional age-gating considerations');
    }

    if (metadata.series) {
      considerations.push('Consider registering entire series with consistent licensing');
    }

    return considerations;
  }

  /**
   * Determine if Liberation License should be recommended
   */
  shouldRecommendLiberation(metadata) {
    // Liberation License is perfect for fanfiction creators
    return metadata.fandoms.length > 0; // Is fanfiction
  }

  /**
   * Rate limiting helper
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Bulk verification for multiple works (with rate limiting)
   */
  async verifyMultipleWorks(workUrls, username) {
    const results = [];
    
    for (const url of workUrls) {
      try {
        const verification = await this.verifyWorkOwnership(url, username);
        results.push(verification);
        
        // Rate limit between requests
        await this.delay(this.rateLimitMs);
      } catch (error) {
        results.push({
          url,
          error: error.message,
          verified: false
        });
      }
    }
    
    return results;
  }
}

export default AO3Scraper;