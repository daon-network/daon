// DAON Popup JavaScript - Extension UI logic

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🛡️ DAON Popup: Initializing...');
  
  // Get current work data
  const workData = await getCurrentWorkData();
  
  if (workData) {
    displayWorkInfo(workData);
    await checkProtectionStatus(workData);
  } else {
    showNoWorkDetected();
  }
  
  // Event listeners
  document.getElementById('protect-button').addEventListener('click', protectCurrentWork);
  document.getElementById('verify-button').addEventListener('click', verifyCurrentWork);
  document.getElementById('license-select').addEventListener('change', onLicenseChange);
  
  // Check wallet status
  await checkWalletStatus();
});

// Get current work data from content script
async function getCurrentWorkData() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getWorkData' }, (response) => {
      resolve(response?.workData || null);
    });
  });
}

// Display work information
function displayWorkInfo(workData) {
  document.getElementById('work-info').style.display = 'block';
  document.getElementById('work-title').textContent = workData.title || 'Unknown Title';
  
  const meta = [];
  if (workData.author) meta.push(workData.author);
  if (workData.fandoms && workData.fandoms.length > 0) meta.push(workData.fandoms[0]);
  if (workData.rating) meta.push(workData.rating);
  if (workData.wordCount) meta.push(`${workData.wordCount.toLocaleString()} words`);
  
  document.getElementById('work-meta').textContent = meta.join(' • ');
}

// Show no work detected message
function showNoWorkDetected() {
  document.getElementById('protection-status').className = 'protection-status unprotected';
  document.getElementById('status-text').textContent = 'Navigate to an AO3 work page to enable protection';
  document.getElementById('protect-button').disabled = true;
  document.getElementById('verify-button').disabled = true;
}

// Check protection status
async function checkProtectionStatus(workData) {
  const statusElement = document.getElementById('protection-status');
  const statusText = document.getElementById('status-text');
  const protectButton = document.getElementById('protect-button');
  
  statusText.textContent = 'Checking protection status...';
  statusElement.className = 'protection-status pending';
  
  try {
    // Generate content hash
    const contentHash = await generateContentHash(workData.content);
    
    // Check with background script
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'checkProtection',
        contentHash: contentHash,
        workData: workData
      }, resolve);
    });
    
    if (response.protected) {
      statusElement.className = 'protection-status protected';
      statusText.textContent = '✅ Protected by DAON blockchain';
      protectButton.textContent = '🛡️ Already Protected';
      protectButton.disabled = true;
      
      if (response.details) {
        statusText.innerHTML = `✅ Protected by DAON blockchain<br><small>License: ${response.details.license || 'Unknown'}</small>`;
      }
    } else {
      statusElement.className = 'protection-status unprotected';
      statusText.textContent = '⚠️ Unprotected - Vulnerable to AI scraping';
      protectButton.disabled = false;
      document.getElementById('license-section').style.display = 'block';
    }
  } catch (error) {
    console.error('DAON: Error checking protection:', error);
    statusElement.className = 'protection-status pending';
    statusText.textContent = '⚡ Unable to verify protection status';
    protectButton.disabled = false;
    document.getElementById('license-section').style.display = 'block';
  }
}

// Protect current work
async function protectCurrentWork() {
  const workData = await getCurrentWorkData();
  if (!workData) {
    alert('No work data available. Please refresh the page and try again.');
    return;
  }
  
  const protectButton = document.getElementById('protect-button');
  const statusElement = document.getElementById('protection-status');
  const statusText = document.getElementById('status-text');
  const licenseSelect = document.getElementById('license-select');
  
  // Disable button and show progress
  protectButton.disabled = true;
  protectButton.textContent = '⏳ Protecting...';
  statusElement.className = 'protection-status pending';
  statusText.textContent = '🔄 Registering with DAON blockchain...';
  
  try {
    const contentHash = await generateContentHash(workData.content);
    
    // Send to background script
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'protectWork',
        workData: workData,
        contentHash: contentHash,
        license: licenseSelect.value
      }, resolve);
    });
    
    if (response.success) {
      statusElement.className = 'protection-status protected';
      statusText.innerHTML = `✅ Protected by DAON blockchain!<br><small>TX: ${response.txHash}</small>`;
      protectButton.textContent = '🛡️ Protection Active';
      document.getElementById('license-section').style.display = 'none';
      
      // Show verification URL if available
      if (response.verificationUrl) {
        setTimeout(() => {
          if (confirm('Protection successful! Would you like to view the blockchain verification?')) {
            chrome.tabs.create({ url: response.verificationUrl });
          }
        }, 1000);
      }
    } else {
      throw new Error(response.error || 'Protection failed');
    }
  } catch (error) {
    console.error('DAON: Protection error:', error);
    statusElement.className = 'protection-status unprotected';
    statusText.textContent = '❌ Protection failed - Try again';
    protectButton.textContent = '🛡️ Protect This Work';
    protectButton.disabled = false;
    
    // Show error details if wallet not configured
    if (error.message.includes('Wallet not configured')) {
      showWalletSetup();
    } else {
      alert(`Protection failed: ${error.message}`);
    }
  }
}

// Verify current work
async function verifyCurrentWork() {
  const workData = await getCurrentWorkData();
  if (!workData) {
    alert('No work data available.');
    return;
  }
  
  try {
    const contentHash = await generateContentHash(workData.content);
    
    // Create verification popup
    const popup = createVerificationPopup(contentHash);
    document.body.appendChild(popup);
    
    // Check verification
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'verifyProtection',
        contentHash: contentHash,
        workData: workData
      }, resolve);
    });
    
    updateVerificationPopup(popup, response);
  } catch (error) {
    console.error('DAON: Verification error:', error);
    alert(`Verification failed: ${error.message}`);
  }
}

// License selection handler
function onLicenseChange() {
  const licenseSelect = document.getElementById('license-select');
  const liberationInfo = document.querySelector('.liberation-info');
  
  if (licenseSelect.value === 'liberation_v1') {
    liberationInfo.style.display = 'block';
    liberationInfo.innerHTML = '💡 <strong>Liberation License</strong> allows personal use, education, and humanitarian purposes while blocking corporate AI training without compensation.';
  } else if (licenseSelect.value.startsWith('cc_')) {
    liberationInfo.style.display = 'block';
    liberationInfo.innerHTML = '📝 <strong>Creative Commons</strong> license allows broad reuse with attribution requirements.';
  } else if (licenseSelect.value === 'all_rights_reserved') {
    liberationInfo.style.display = 'block';
    liberationInfo.innerHTML = '🔒 <strong>All Rights Reserved</strong> - Traditional copyright protection.';
  } else {
    liberationInfo.style.display = 'none';
  }
}

// Check wallet status
async function checkWalletStatus() {
  const result = await chrome.storage.local.get(['userWallet']);
  
  if (!result.userWallet) {
    // Show wallet setup hint
    const infoText = document.querySelector('.info-text');
    infoText.innerHTML = `
      <strong>⚠️ Wallet Setup Required</strong><br>
      Click the extension icon to generate a DAON wallet for protecting your works.
      <button id="setup-wallet" style="
        display: block;
        margin: 8px auto;
        padding: 6px 12px;
        background: #FF9800;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      ">Generate Wallet</button>
    `;
    
    document.getElementById('setup-wallet').addEventListener('click', showWalletSetup);
  }
}

// Show wallet setup
function showWalletSetup() {
  const popup = document.createElement('div');
  popup.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  popup.innerHTML = `
    <div style="
      background: white;
      padding: 24px;
      border-radius: 12px;
      max-width: 400px;
      color: black;
      text-align: center;
    ">
      <h3 style="margin-top: 0;">🔑 Setup DAON Wallet</h3>
      <p>Generate a secure wallet to protect your works on the DAON blockchain.</p>
      
      <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin: 16px 0; font-size: 12px;">
        ⚠️ <strong>Important:</strong> Save your recovery phrase securely. You'll need it to restore your wallet.
      </div>
      
      <div style="margin: 16px 0;">
        <button id="generate-wallet-btn" style="
          padding: 12px 24px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          margin-right: 8px;
        ">Generate Wallet</button>
        
        <button id="cancel-wallet-btn" style="
          padding: 12px 24px;
          background: #666;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        ">Cancel</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(popup);
  
  // Event handlers
  document.getElementById('generate-wallet-btn').addEventListener('click', async () => {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'generateWallet' }, resolve);
    });
    
    if (response.success) {
      popup.innerHTML = `
        <div style="
          background: white;
          padding: 24px;
          border-radius: 12px;
          max-width: 400px;
          color: black;
          text-align: center;
        ">
          <h3 style="color: #4CAF50;">✅ Wallet Created!</h3>
          <p><strong>Address:</strong><br><code style="font-size: 10px; background: #f5f5f5; padding: 4px;">${response.wallet.address}</code></p>
          <p style="font-size: 12px; color: #666;">Your wallet is now ready to protect your works!</p>
          <button onclick="this.parentElement.parentElement.parentElement.remove()" style="
            padding: 8px 16px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          ">Continue</button>
        </div>
      `;
    } else {
      alert('Failed to generate wallet: ' + response.error);
    }
  });
  
  document.getElementById('cancel-wallet-btn').addEventListener('click', () => {
    popup.remove();
  });
}

// Create verification popup
function createVerificationPopup(contentHash) {
  const popup = document.createElement('div');
  popup.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10001;
  `;
  
  popup.innerHTML = `
    <div style="
      background: white;
      color: black;
      padding: 24px;
      border-radius: 12px;
      max-width: 500px;
      font-family: inherit;
    ">
      <div style="text-align: center; margin-bottom: 20px;">
        <h3 style="margin: 0 0 8px 0;">🔍 DAON Verification</h3>
        <p style="margin: 0; color: #666;">Cryptographic proof of ownership</p>
      </div>
      
      <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-family: monospace; word-break: break-all; font-size: 11px;">
        <strong>Content Hash:</strong><br>
        ${contentHash}
      </div>
      
      <div id="verification-result" style="padding: 12px; border-radius: 8px; text-align: center;">
        🔄 Checking DAON blockchain...
      </div>
      
      <div style="text-align: center; margin-top: 16px;">
        <button onclick="this.parentElement.parentElement.parentElement.remove()" style="
          padding: 8px 16px;
          background: #666;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        ">Close</button>
      </div>
    </div>
  `;
  
  return popup;
}

// Update verification popup with results
function updateVerificationPopup(popup, response) {
  const resultDiv = popup.querySelector('#verification-result');
  
  if (response.verified) {
    resultDiv.style.background = 'rgba(76, 175, 80, 0.1)';
    resultDiv.style.border = '1px solid #4CAF50';
    resultDiv.innerHTML = `
      ✅ <strong>Verified Protected</strong><br>
      <small>
        ${response.timestamp ? `Registered: ${new Date(response.timestamp * 1000).toLocaleString()}<br>` : ''}
        ${response.license ? `License: ${response.license}<br>` : ''}
        ${response.creator ? `Creator: ${response.creator}` : ''}
      </small>
    `;
  } else {
    resultDiv.style.background = 'rgba(244, 67, 54, 0.1)';
    resultDiv.style.border = '1px solid #F44336';
    resultDiv.innerHTML = `
      ❌ <strong>Not Protected</strong><br>
      <small>This work is vulnerable to AI scraping</small>
    `;
  }
}

// Generate content hash (client-side version)
async function generateContentHash(content) {
  if (!content) return '';
  
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return 'sha256:' + hashHex;
}