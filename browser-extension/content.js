// DAON Content Script - Runs on AO3 work pages
// Extracts work data and injects protection UI

(function() {
  'use strict';
  
  // Check if we're on a work page
  if (!window.location.pathname.includes('/works/')) {
    return;
  }
  
  console.log('🛡️ DAON: Initializing creator protection...');
  
  // Extract work information from AO3 page
  function extractWorkData() {
    try {
      const workTitle = document.querySelector('h2.title')?.textContent?.trim();
      const author = document.querySelector('a[rel="author"]')?.textContent?.trim();
      const fandom = Array.from(document.querySelectorAll('.fandom .tag')).map(tag => tag.textContent.trim());
      const characters = Array.from(document.querySelectorAll('.character .tag')).map(tag => tag.textContent.trim());
      const relationships = Array.from(document.querySelectorAll('.relationship .tag')).map(tag => tag.textContent.trim());
      const additionalTags = Array.from(document.querySelectorAll('.freeform .tag')).map(tag => tag.textContent.trim());
      const rating = document.querySelector('.rating .tag')?.textContent?.trim();
      const warnings = Array.from(document.querySelectorAll('.warning .tag')).map(tag => tag.textContent.trim());
      const language = document.querySelector('.language')?.textContent?.trim();
      const wordCount = document.querySelector('.words')?.textContent?.trim();
      const chapters = document.querySelector('.chapters')?.textContent?.trim();
      const publishDate = document.querySelector('.published')?.textContent?.trim();
      const workId = window.location.pathname.match(/\/works\/(\d+)/)?.[1];
      
      // Extract work content (first chapter)
      const workContent = document.querySelector('#workskin')?.textContent?.trim() || '';
      
      return {
        id: workId,
        url: window.location.href,
        title: workTitle,
        author: author,
        fandoms: fandom,
        characters: characters,
        relationships: relationships,
        tags: [...additionalTags, ...relationships, ...characters],
        rating: rating,
        warnings: warnings,
        language: language,
        wordCount: parseInt(wordCount?.replace(/[,\s]/g, '') || '0'),
        chapters: chapters,
        publishDate: publishDate,
        content: workContent,
        extracted: true
      };
    } catch (error) {
      console.error('DAON: Error extracting work data:', error);
      return null;
    }
  }
  
  // Generate content hash (simplified client-side version)
  async function generateContentHash(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return 'sha256:' + hashHex;
  }
  
  // Create DAON protection widget
  function createProtectionWidget() {
    const widget = document.createElement('div');
    widget.id = 'daon-widget';
    widget.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      max-width: 320px;
      border: 2px solid rgba(255,255,255,0.2);
    `;
    
    widget.innerHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 12px;">
        <div style="font-size: 18px; margin-right: 8px;">🛡️</div>
        <div>
          <div style="font-weight: bold; font-size: 16px;">DAON Protection</div>
          <div style="font-size: 11px; opacity: 0.8;">Creator Rights Guardian</div>
        </div>
        <button id="daon-close" style="margin-left: auto; background: none; border: none; color: white; font-size: 18px; cursor: pointer; opacity: 0.7;">×</button>
      </div>
      
      <div id="daon-status" style="padding: 8px; border-radius: 6px; margin-bottom: 12px; text-align: center; font-size: 13px;">
        Scanning work for existing protection...
      </div>
      
      <div style="margin-bottom: 12px;">
        <div style="font-weight: bold; margin-bottom: 4px;">📝 "${document.querySelector('h2.title')?.textContent?.trim() || 'Current Work'}"</div>
        <div style="font-size: 11px; opacity: 0.8;">By ${document.querySelector('a[rel="author"]')?.textContent?.trim() || 'Author'}</div>
      </div>
      
      <button id="daon-protect" style="
        width: 100%;
        padding: 10px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 6px;
        font-weight: bold;
        cursor: pointer;
        margin-bottom: 8px;
        transition: background 0.2s;
      " disabled>
        🛡️ Protect with DAON
      </button>
      
      <button id="daon-verify" style="
        width: 100%;
        padding: 8px;
        background: rgba(255,255,255,0.2);
        color: white;
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 4px;
        cursor: pointer;
        margin-bottom: 8px;
        font-size: 12px;
      ">
        🔍 Verify Protection
      </button>
      
      <div style="font-size: 10px; opacity: 0.7; text-align: center; line-height: 1.3;">
        Cryptographic proof fights AI exploitation<br>
        🇪🇺 German hosting • GDPR protected
      </div>
    `;
    
    return widget;
  }
  
  // Add widget to page
  function addWidget() {
    if (document.getElementById('daon-widget')) {
      return; // Already exists
    }
    
    const widget = createProtectionWidget();
    document.body.appendChild(widget);
    
    // Event handlers
    document.getElementById('daon-close').addEventListener('click', () => {
      widget.remove();
    });
    
    document.getElementById('daon-protect').addEventListener('click', protectWork);
    document.getElementById('daon-verify').addEventListener('click', verifyProtection);
    
    // Initialize
    initializeWidget();
  }
  
  // Initialize widget functionality
  async function initializeWidget() {
    const workData = extractWorkData();
    const statusDiv = document.getElementById('daon-status');
    const protectButton = document.getElementById('daon-protect');
    
    if (!workData || !workData.content) {
      statusDiv.style.background = 'rgba(244, 67, 54, 0.3)';
      statusDiv.textContent = '❌ Cannot extract work content';
      return;
    }
    
    // Check if already protected
    try {
      const isProtected = await checkProtectionStatus(workData);
      
      if (isProtected) {
        statusDiv.style.background = 'rgba(76, 175, 80, 0.3)';
        statusDiv.textContent = '✅ Protected by DAON';
        protectButton.textContent = '🛡️ Already Protected';
        protectButton.style.background = '#4CAF50';
      } else {
        statusDiv.style.background = 'rgba(244, 67, 54, 0.3)';
        statusDiv.textContent = '⚠️ Unprotected - Vulnerable to AI scraping';
        protectButton.disabled = false;
        protectButton.style.background = '#4CAF50';
        protectButton.style.cursor = 'pointer';
      }
    } catch (error) {
      console.error('DAON: Error checking protection:', error);
      statusDiv.style.background = 'rgba(255, 152, 0, 0.3)';
      statusDiv.textContent = '⚡ Connect to DAON network to check protection';
      protectButton.disabled = false;
      protectButton.style.background = '#FF9800';
      protectButton.style.cursor = 'pointer';
    }
  }
  
  // Check if work is already protected
  async function checkProtectionStatus(workData) {
    const contentHash = await generateContentHash(workData.content);
    
    // Send message to background script to check DAON network
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'checkProtection',
        contentHash: contentHash,
        workData: workData
      }, (response) => {
        resolve(response?.protected || false);
      });
    });
  }
  
  // Protect work with DAON
  async function protectWork() {
    const workData = extractWorkData();
    const statusDiv = document.getElementById('daon-status');
    const protectButton = document.getElementById('daon-protect');
    
    if (!workData) {
      alert('Unable to extract work data. Please refresh and try again.');
      return;
    }
    
    protectButton.disabled = true;
    protectButton.textContent = '⏳ Protecting...';
    statusDiv.style.background = 'rgba(255, 152, 0, 0.3)';
    statusDiv.textContent = '🔄 Registering with DAON blockchain...';
    
    try {
      const contentHash = await generateContentHash(workData.content);
      
      // Send to background script for DAON registration
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'protectWork',
          workData: workData,
          contentHash: contentHash,
          license: 'liberation_v1' // Default to Liberation License
        }, resolve);
      });
      
      if (response.success) {
        statusDiv.style.background = 'rgba(76, 175, 80, 0.3)';
        statusDiv.textContent = '✅ Protected by DAON blockchain!';
        protectButton.textContent = '🛡️ Protection Active';
        protectButton.style.background = '#4CAF50';
        
        // Show success notification
        showNotification('🎉 Work protected! Your creation is now safe from AI exploitation.', 'success');
        
        // Store protection locally
        chrome.storage.local.set({
          [`protected_${workData.id}`]: {
            protected: true,
            hash: contentHash,
            timestamp: Date.now(),
            txHash: response.txHash
          }
        });
      } else {
        throw new Error(response.error || 'Protection failed');
      }
    } catch (error) {
      console.error('DAON: Protection failed:', error);
      statusDiv.style.background = 'rgba(244, 67, 54, 0.3)';
      statusDiv.textContent = '❌ Protection failed - Try again';
      protectButton.textContent = '🛡️ Protect with DAON';
      protectButton.disabled = false;
      
      showNotification('Protection failed. Please try again or check your connection.', 'error');
    }
  }
  
  // Verify protection
  async function verifyProtection() {
    const workData = extractWorkData();
    
    if (!workData) {
      alert('Unable to extract work data.');
      return;
    }
    
    try {
      const contentHash = await generateContentHash(workData.content);
      
      // Create verification popup
      const popup = document.createElement('div');
      popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        color: black;
        padding: 24px;
        border-radius: 12px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5);
        z-index: 10001;
        max-width: 500px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      
      popup.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
          <h3 style="margin: 0 0 8px 0;">🔍 DAON Verification</h3>
          <p style="margin: 0; color: #666;">Cryptographic proof of ownership</p>
        </div>
        
        <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-family: monospace; word-break: break-all; font-size: 12px;">
          <strong>Content Hash:</strong><br>
          ${contentHash}
        </div>
        
        <div id="verification-result" style="padding: 12px; border-radius: 8px; text-align: center;">
          🔄 Checking DAON blockchain...
        </div>
        
        <div style="text-align: center; margin-top: 16px;">
          <button onclick="this.parentElement.parentElement.remove()" style="
            padding: 8px 16px;
            background: #666;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          ">Close</button>
        </div>
      `;
      
      document.body.appendChild(popup);
      
      // Check verification
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'verifyProtection',
          contentHash: contentHash,
          workData: workData
        }, resolve);
      });
      
      const resultDiv = document.getElementById('verification-result');
      
      if (response.verified) {
        resultDiv.style.background = 'rgba(76, 175, 80, 0.1)';
        resultDiv.style.border = '1px solid #4CAF50';
        resultDiv.innerHTML = `
          ✅ <strong>Verified Protected</strong><br>
          <small>Registered: ${new Date(response.timestamp).toLocaleString()}<br>
          License: ${response.license}<br>
          Creator: ${response.creator}</small>
        `;
      } else {
        resultDiv.style.background = 'rgba(244, 67, 54, 0.1)';
        resultDiv.style.border = '1px solid #F44336';
        resultDiv.innerHTML = '❌ <strong>Not Protected</strong><br><small>This work is vulnerable to AI scraping</small>';
      }
    } catch (error) {
      console.error('DAON: Verification failed:', error);
    }
  }
  
  // Show notification
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#F44336' : '#2196F3'};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      z-index: 10002;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }
  
  // Initialize when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addWidget);
  } else {
    addWidget();
  }
  
  // Store extracted work data for popup
  const workData = extractWorkData();
  if (workData) {
    chrome.storage.local.set({
      currentWorkData: workData
    });
  }
  
})();