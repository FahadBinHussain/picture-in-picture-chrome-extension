// options.js - Settings page logic

const DEFAULT_SITES = `https://www.youtube.com/*
https://music.youtube.com/*
https://www.netflix.com/*
https://vimeo.com/*
https://www.twitch.tv/*`;

const sitesTextarea = document.getElementById('sites');
const saveButton = document.getElementById('save');
const resetButton = document.getElementById('reset');
const statusDiv = document.getElementById('status');

// Load saved sites
chrome.storage.local.get({ enabledSites: DEFAULT_SITES }, (result) => {
  sitesTextarea.value = result.enabledSites;
});

// Save settings
saveButton.addEventListener('click', () => {
  const sites = sitesTextarea.value.trim();
  
  chrome.storage.local.set({ enabledSites: sites }, () => {
    showStatus('✓ Settings saved successfully!', 'success');
    
    // Update content scripts
    chrome.runtime.sendMessage({ type: 'updateSites' });
  });
});

// Reset to defaults
resetButton.addEventListener('click', () => {
  sitesTextarea.value = DEFAULT_SITES;
  showStatus('⚠ Reset to defaults (click Save to apply)', 'error');
});

// Show status message
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
  
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
}
