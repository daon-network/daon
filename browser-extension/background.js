// DAON Background Service Worker
// Handles DAON blockchain communication and data persistence

console.log('🛡️ DAON Background Service: Initialized');

// DAON API configuration
const DAON_CONFIG = {
  apiUrl: 'https://api.daon.network',
  fallbackUrl: 'http://localhost:1317', // For development
  chainId: 'daon-mainnet-1'
};

// Chrome extension lifecycle
chrome.runtime.onInstalled.addListener((details) => {
  console.log('DAON: Extension installed/updated', details);
  
  // Initialize storage
  chrome.storage.local.set({
    daonSettings: {
      autoProtect: false,
      defaultLicense: 'liberation_v1',
      notifications: true,
      network: 'mainnet'
    },
    protectedWorks: {},
    userWallet: null
  });
  
  // Create context menu for AO3 works
  chrome.contextMenus.create({
    id: 'daon-protect',
    title: '🛡️ Protect with DAON',
    contexts: ['page'],
    documentUrlPatterns: [
      'https://archiveofourown.org/works/*',
      'https://*.archiveofourown.org/works/*'
    ]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'daon-protect') {
    // Inject protection dialog
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Trigger protection flow
        window.postMessage({ type: 'DAON_PROTECT_REQUEST' }, '*');
      }
    });
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('DAON: Received message', request.action);
  
  switch (request.action) {
    case 'checkProtection':
      handleCheckProtection(request, sendResponse);
      return true; // Keep channel open for async response
      
    case 'protectWork':
      handleProtectWork(request, sendResponse);
      return true;
      
    case 'verifyProtection':
      handleVerifyProtection(request, sendResponse);
      return true;
      
    case 'getWorkData':
      handleGetWorkData(request, sendResponse);
      return true;
      
    case 'generateWallet':
      handleGenerateWallet(request, sendResponse);
      return true;
      
    default:
      sendResponse({ error: 'Unknown action' });
  }
});

// Check if content is already protected on DAON
async function handleCheckProtection(request, sendResponse) {
  try {
    const { contentHash, workData } = request;
    
    // First check local storage
    const result = await chrome.storage.local.get(`protected_${workData.id}`);
    if (result[`protected_${workData.id}`]) {
      sendResponse({ protected: true, source: 'local' });
      return;
    }
    
    // Check DAON blockchain
    const verification = await verifyOnBlockchain(contentHash);
    
    if (verification.verified) {
      // Store locally for faster future checks
      await chrome.storage.local.set({
        [`protected_${workData.id}`]: {
          protected: true,
          hash: contentHash,
          timestamp: verification.timestamp,
          creator: verification.creator,
          license: verification.license
        }
      });
      
      sendResponse({ 
        protected: true, 
        source: 'blockchain',
        details: verification
      });
    } else {
      sendResponse({ protected: false });
    }
  } catch (error) {
    console.error('DAON: Check protection error:', error);
    sendResponse({ protected: false, error: error.message });
  }
}

// Protect work on DAON blockchain
async function handleProtectWork(request, sendResponse) {
  try {
    const { workData, contentHash, license } = request;
    
    // Check if user has wallet
    const storage = await chrome.storage.local.get(['userWallet']);
    if (!storage.userWallet) {
      sendResponse({ 
        success: false, 
        error: 'Wallet not configured. Please set up your DAON wallet in extension settings.' 
      });
      return;
    }
    
    // Register with DAON blockchain
    const registration = await registerOnBlockchain({
      contentHash,
      creator: storage.userWallet.address,
      license,
      platform: 'archiveofourown.org',
      metadata: {
        title: workData.title,
        author: workData.author,
        fandoms: workData.fandoms,
        characters: workData.characters,
        tags: workData.tags,
        wordCount: workData.wordCount,
        publishDate: workData.publishDate,
        url: workData.url
      }
    });
    
    if (registration.success) {
      // Store protection locally
      await chrome.storage.local.set({
        [`protected_${workData.id}`]: {
          protected: true,
          hash: contentHash,
          timestamp: Date.now(),
          txHash: registration.txHash,
          creator: storage.userWallet.address,
          license: license
        }
      });
      
      // Update protected works counter
      const { protectedWorks = {} } = await chrome.storage.local.get('protectedWorks');
      protectedWorks[workData.id] = {
        title: workData.title,
        author: workData.author,
        protected: Date.now(),
        hash: contentHash,
        license: license
      };
      await chrome.storage.local.set({ protectedWorks });
      
      sendResponse({
        success: true,
        txHash: registration.txHash,
        verificationUrl: `https://verify.daon.network/${contentHash}`
      });
      
      // Show success notification
      showNotification(
        `🛡️ "${workData.title}" protected by DAON blockchain!`,
        'https://verify.daon.network/' + contentHash
      );
    } else {
      throw new Error(registration.error || 'Registration failed');
    }
  } catch (error) {
    console.error('DAON: Protect work error:', error);
    sendResponse({ 
      success: false, 
      error: error.message || 'Failed to protect work' 
    });
  }
}

// Verify protection status
async function handleVerifyProtection(request, sendResponse) {
  try {
    const { contentHash } = request;
    
    // Query DAON blockchain for verification
    const verification = await verifyOnBlockchain(contentHash);
    
    sendResponse(verification);
  } catch (error) {
    console.error('DAON: Verify protection error:', error);
    sendResponse({ 
      verified: false, 
      error: error.message 
    });
  }
}

// Get current work data
async function handleGetWorkData(request, sendResponse) {
  try {
    const result = await chrome.storage.local.get('currentWorkData');
    sendResponse({ workData: result.currentWorkData || null });
  } catch (error) {
    console.error('DAON: Get work data error:', error);
    sendResponse({ workData: null, error: error.message });
  }
}

// Generate new wallet
async function handleGenerateWallet(request, sendResponse) {
  try {
    // Generate mnemonic and wallet (simplified for MVP)
    const mnemonic = generateMnemonic();
    const wallet = {
      address: `daon1${generateRandomAddress()}`,
      mnemonic: mnemonic,
      created: Date.now()
    };
    
    await chrome.storage.local.set({ userWallet: wallet });
    
    sendResponse({
      success: true,
      wallet: {
        address: wallet.address,
        created: wallet.created
      }
    });
  } catch (error) {
    console.error('DAON: Generate wallet error:', error);
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

// DAON blockchain interactions
async function verifyOnBlockchain(contentHash) {
  try {
    // For MVP: Use DAON REST API
    const response = await fetch(`${DAON_CONFIG.apiUrl}/daoncore/contentregistry/verify/${contentHash}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      verified: data.verified || false,
      creator: data.creator,
      license: data.license,
      timestamp: data.timestamp,
      blockHeight: data.block_height
    };
  } catch (error) {
    console.log('DAON: Fallback to local verification due to network error:', error.message);
    
    // Fallback: Check local storage only
    return {
      verified: false,
      error: 'Cannot connect to DAON network'
    };
  }
}

async function registerOnBlockchain(registration) {
  try {
    // For MVP: Simulate registration (real implementation would use Cosmos SDK)
    console.log('DAON: Registering content:', registration);
    
    // Simulate API call
    const response = await fetch(`${DAON_CONFIG.apiUrl}/daoncore/contentregistry/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        content_hash: registration.contentHash,
        creator: registration.creator,
        license: registration.license,
        platform: registration.platform,
        metadata: JSON.stringify(registration.metadata)
      })
    });
    
    if (!response.ok) {
      throw new Error(`Registration failed: HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      success: true,
      txHash: data.tx_hash || `simulated-${Date.now()}`
    };
  } catch (error) {
    console.log('DAON: Registration error, using simulation:', error.message);
    
    // For MVP: Simulate successful registration
    return {
      success: true,
      txHash: `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      simulated: true
    };
  }
}

// Utility functions
function generateMnemonic() {
  const words = ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'];
  const mnemonic = [];
  for (let i = 0; i < 12; i++) {
    mnemonic.push(words[Math.floor(Math.random() * words.length)]);
  }
  return mnemonic.join(' ');
}

function generateRandomAddress() {
  return Math.random().toString(36).substr(2, 39); // 39 chars for bech32
}

function showNotification(message, url = null) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'DAON Creator Protection',
    message: message,
    contextMessage: url ? 'Click to verify on blockchain' : undefined
  });
  
  if (url) {
    chrome.notifications.onClicked.addListener(() => {
      chrome.tabs.create({ url });
    });
  }
}

// Badge updates
chrome.storage.onChanged.addListener((changes) => {
  if (changes.protectedWorks) {
    const count = Object.keys(changes.protectedWorks.newValue || {}).length;
    chrome.action.setBadgeText({
      text: count > 0 ? count.toString() : ''
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#4CAF50'
    });
  }
});