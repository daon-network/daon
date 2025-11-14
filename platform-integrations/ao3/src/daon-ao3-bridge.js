/**
 * DAON <-> AO3 Bridge
 * Connects AO3 content to DAON blockchain for creator rights protection
 * 
 * "Because fanfiction writers deserve the same protection as any other creators"
 */

import { AO3Scraper } from './ao3-scraper.js';
import axios from 'axios';

export class DAONAo3Bridge {
  constructor(options = {}) {
    this.scraper = new AO3Scraper(options);
    this.daonApiUrl = options.daonApiUrl || 'https://api.daon.network';
    this.platformVerifier = 'archiveofourown.org';
  }

  /**
   * Register AO3 work with DAON blockchain protection
   * THE MONEY SHOT - this is what changes everything for fanfic writers
   */
  async registerAO3Work(workUrl, creatorWallet, options = {}) {
    console.log('🚀 Starting AO3 → DAON registration process...');
    
    try {
      // Step 1: Extract work metadata from AO3
      console.log('📖 Extracting work metadata from AO3...');
      const workData = await this.scraper.scrapeWorkMetadata(workUrl);
      
      // Step 2: Analyze licensing requirements
      console.log('⚖️ Analyzing licensing requirements...');
      const licenseAnalysis = this.scraper.analyzeWorkLicensing(workData);
      
      // Step 3: Create DAON registration payload
      const registrationPayload = this.createDAONPayload(
        workData, 
        creatorWallet, 
        options.license || licenseAnalysis.suggestedLicense
      );
      
      // Step 4: Register with DAON blockchain
      console.log('⛓️ Registering with DAON blockchain...');
      const blockchainResult = await this.registerWithDAON(registrationPayload);
      
      // Step 5: Generate AO3-ready metadata
      console.log('🏷️ Generating AO3 metadata tags...');
      const ao3Metadata = this.generateAO3Metadata(blockchainResult, workData);
      
      // Step 6: Create integration report
      const report = {
        success: true,
        workData,
        licenseAnalysis,
        blockchainResult,
        ao3Metadata,
        protectionLevel: this.assessProtectionLevel(licenseAnalysis.suggestedLicense),
        nextSteps: this.generateNextSteps(workData, blockchainResult)
      };
      
      console.log('🎉 AO3 work successfully protected by DAON!');
      return report;
      
    } catch (error) {
      console.error('❌ Registration failed:', error.message);
      throw new Error(`AO3 → DAON registration failed: ${error.message}`);
    }
  }

  /**
   * Create DAON blockchain registration payload
   */
  createDAONPayload(workData, creatorWallet, license) {
    return {
      // Core DAON fields
      contentHash: workData.contentHash,
      creator: creatorWallet,
      license: license,
      platform: this.platformVerifier,
      fingerprint: this.generateWorkFingerprint(workData),
      
      // AO3-specific verification data
      platformData: {
        workId: workData.workId,
        title: workData.title,
        author: workData.author,
        authorUrl: workData.authorUrl,
        publishDate: workData.publishDate,
        wordCount: workData.wordCount,
        fandoms: workData.fandoms,
        verificationUrl: workData.url,
        scrapeTimestamp: workData.daonData.scrapeTimestamp
      },
      
      // Platform vouching
      platformVoucher: {
        platform: 'archiveofourown.org',
        verification: 'content_scrape_verified',
        confidence: 0.95, // High confidence for direct scraping
        method: 'metadata_extraction_and_content_analysis'
      }
    };
  }

  /**
   * Generate content fingerprint for similarity detection
   */
  generateWorkFingerprint(workData) {
    const fingerprint = {
      textLength: workData.content.length,
      wordCount: workData.wordCount,
      titleFingerprint: this.hashString(workData.title),
      contentSample: this.hashString(workData.content.substring(0, 1000)),
      authorFingerprint: this.hashString(workData.author),
      fandoms: workData.fandoms.sort(),
      structuralHash: this.generateStructuralHash(workData.content)
    };
    
    return JSON.stringify(fingerprint);
  }

  /**
   * Register content with DAON blockchain
   */
  async registerWithDAON(payload) {
    try {
      const response = await axios.post(`${this.daonApiUrl}/register`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DAON-AO3-Bridge/1.0',
          'X-Platform-Integration': 'archiveofourown.org'
        },
        timeout: 30000
      });
      
      return {
        transactionHash: response.data.txHash,
        blockHeight: response.data.blockHeight,
        contentHash: payload.contentHash,
        registrationTimestamp: response.data.timestamp,
        verificationUrl: `https://verify.daon.network/${payload.contentHash}`,
        status: 'registered'
      };
      
    } catch (error) {
      if (error.response?.status === 409) {
        throw new Error('Content already registered on DAON blockchain');
      }
      throw new Error(`DAON blockchain registration failed: ${error.message}`);
    }
  }

  /**
   * Generate AO3-ready metadata for work notes/description
   */
  generateAO3Metadata(blockchainResult, workData) {
    const metadata = {
      // Work notes section
      workNotes: this.generateWorkNotes(blockchainResult, workData),
      
      // HTML meta tags (for series/collection pages)
      htmlMetaTags: this.generateHTMLMetaTags(blockchainResult),
      
      // Author notes addition
      authorNotes: this.generateAuthorNotes(blockchainResult),
      
      // Collection/series description
      collectionNotes: this.generateCollectionNotes(blockchainResult)
    };
    
    return metadata;
  }

  /**
   * Generate work notes with DAON protection info
   */
  generateWorkNotes(blockchainResult, workData) {
    const license = workData.license || 'liberation_v1';
    const protectionType = this.getProtectionDescription(license);
    
    return `
🛡️ DAON PROTECTED CONTENT 🛡️

This work is protected by the Digital Asset Ownership Network (DAON).

📋 Protection Details:
• License: ${protectionType}
• Verification: ${blockchainResult.verificationUrl}
• Blockchain Hash: ${blockchainResult.contentHash.substring(0, 16)}...
• Registration Date: ${new Date(blockchainResult.registrationTimestamp).toLocaleDateString()}

⚖️ Legal Notice:
${this.generateLegalNotice(license)}

🤖 AI Training Policy:
${this.generateAIPolicy(license)}

For more information about DAON creator protection: https://daon.network
    `.trim();
  }

  /**
   * Generate legal notice based on license type
   */
  generateLegalNotice(license) {
    switch (license) {
      case 'liberation_v1':
        return 'This work is protected under the Liberation License v1.0. Corporate exploitation, surveillance capitalism, and wealth concentration uses are prohibited. Individual use, education, and humanitarian purposes are encouraged.';
        
      case 'cc_by_nc_sa':
        return 'This work is licensed under Creative Commons Attribution-NonCommercial-ShareAlike. Commercial use requires permission. Attribution required for all uses.';
        
      case 'all_rights_reserved':
        return 'All rights reserved. No part of this work may be reproduced or transmitted without written permission from the creator.';
        
      default:
        return 'This work is protected under the specified license terms. Unauthorized use may result in legal action.';
    }
  }

  /**
   * Generate AI training policy notice
   */
  generateAIPolicy(license) {
    switch (license) {
      case 'liberation_v1':
        return 'AI training is prohibited for corporate profit extraction. Research and educational use may be permitted. Commercial AI companies must obtain explicit permission and provide fair compensation.';
        
      case 'cc_by_nc_sa':
        return 'AI training for commercial purposes is prohibited. Non-commercial research use permitted with attribution.';
        
      case 'all_rights_reserved':
        return 'AI training is prohibited without explicit written permission from the creator.';
        
      default:
        return 'AI training subject to license restrictions. Check verification URL for specific terms.';
    }
  }

  /**
   * Verify ownership of multiple AO3 works for bulk registration
   */
  async bulkRegisterUserWorks(username, creatorWallet, options = {}) {
    console.log(`🔄 Starting bulk registration for AO3 user: ${username}`);
    
    // This would require AO3 profile scraping or user providing work URLs
    // For demo, we'll simulate the workflow
    
    const results = {
      username,
      totalWorks: 0,
      registered: 0,
      failed: 0,
      results: [],
      summary: null
    };
    
    // In real implementation:
    // 1. Scrape user profile for work URLs
    // 2. Register each work with rate limiting
    // 3. Generate bulk protection report
    
    return results;
  }

  /**
   * Generate protection level assessment
   */
  assessProtectionLevel(license) {
    const levels = {
      'liberation_v1': {
        level: 'Maximum Protection',
        score: 95,
        benefits: [
          'Anti-corporate exploitation',
          'AI training restrictions', 
          'Humanitarian use encouraged',
          'Legal enforcement framework'
        ]
      },
      'cc_by_nc_sa': {
        level: 'Strong Protection',
        score: 80,
        benefits: [
          'Non-commercial restriction',
          'Attribution required',
          'ShareAlike provisions',
          'Research use permitted'
        ]
      },
      'all_rights_reserved': {
        level: 'Traditional Protection',
        score: 70,
        benefits: [
          'Full copyright control',
          'Permission required for use',
          'Maximum legal recourse',
          'Commercial licensing available'
        ]
      }
    };
    
    return levels[license] || levels['liberation_v1'];
  }

  /**
   * Generate next steps for creator
   */
  generateNextSteps(workData, blockchainResult) {
    return [
      {
        step: 1,
        action: 'Add DAON metadata to work notes',
        description: 'Copy the generated work notes into your AO3 work',
        priority: 'high'
      },
      {
        step: 2,
        action: 'Verify blockchain registration',
        description: `Visit ${blockchainResult.verificationUrl} to confirm registration`,
        priority: 'medium'
      },
      {
        step: 3, 
        action: 'Register additional works',
        description: 'Protect your other fanfictions with DAON',
        priority: 'medium'
      },
      {
        step: 4,
        action: 'Monitor for violations',
        description: 'DAON will automatically detect AI training violations',
        priority: 'low'
      }
    ];
  }

  // Helper methods
  hashString(str) {
    return require('crypto').createHash('sha256').update(str).digest('hex').substring(0, 16);
  }

  generateStructuralHash(content) {
    // Generate hash based on paragraph structure, dialogue patterns, etc.
    const paragraphs = content.split('\n\n').length;
    const dialogueLines = (content.match(/"/g) || []).length / 2;
    const structure = `${paragraphs}-${Math.floor(dialogueLines)}`;
    return this.hashString(structure);
  }

  getProtectionDescription(license) {
    const descriptions = {
      'liberation_v1': 'Liberation License v1.0 (Anti-Corporate Exploitation)',
      'cc_by_nc_sa': 'Creative Commons Attribution-NonCommercial-ShareAlike',
      'cc_by_sa': 'Creative Commons Attribution-ShareAlike',
      'all_rights_reserved': 'All Rights Reserved (Traditional Copyright)'
    };
    return descriptions[license] || license;
  }

  generateHTMLMetaTags(blockchainResult) {
    return `
<meta name="daon:content-hash" content="${blockchainResult.contentHash}">
<meta name="daon:verification-url" content="${blockchainResult.verificationUrl}">
<meta name="daon:platform" content="archiveofourown.org">
<meta name="daon:protected" content="true">
    `.trim();
  }

  generateAuthorNotes(blockchainResult) {
    return `This work is protected by DAON blockchain verification. Verification: ${blockchainResult.verificationUrl}`;
  }

  generateCollectionNotes(blockchainResult) {
    return `Works in this collection are protected by DAON (Digital Asset Ownership Network) for enhanced creator rights protection.`;
  }
}

export default DAONAo3Bridge;