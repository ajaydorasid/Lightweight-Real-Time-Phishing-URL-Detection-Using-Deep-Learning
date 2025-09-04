// --- File: background.js ---

const API_URL = 'http://127.0.0.1:5000'; // Base URL for your Flask server

// Use session storage to temporarily allow domains. This clears when the browser closes.
const SESSION_STORAGE = chrome.storage.session;

// Listen for updates to any tab
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only run on fully loaded pages with http URLs
    if (changeInfo.status !== 'complete' || !tab.url || !tab.url.startsWith('http')) {
        return;
    }

    const currentUrl = new URL(tab.url);
    const domain = currentUrl.hostname.replace('www.', '');

    // --- "PROCEED ANYWAY" FIX 1: Check for session bypass ---
    // At the start, check if this domain has already been approved for this session.
    const sessionKey = `proceeded_domain_${domain}`;
    const sessionData = await SESSION_STORAGE.get(sessionKey);
    if (sessionData[sessionKey]) {
        console.log(`Domain ${domain} is approved for this session. Skipping check.`);
        return; // Stop processing
    }

    const proceedFlagKey = `phishing_detector_proceed_${tab.url}`;
    const localData = await chrome.storage.local.get(proceedFlagKey);

    // Check if the user just clicked "Proceed Anyway" for this specific URL
    if (localData[proceedFlagKey]) {
        console.log(`User just approved ${tab.url}. Notifying server and setting session bypass for ${domain}.`);
        
        // Notify the server about the bypass action
        fetch(`${API_URL}/api/action/proceeded`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: tab.url })
        }).catch(error => console.error('Failed to notify server of proceed action:', error));
        
        // --- "PROCEED ANYWAY" FIX 2: Set the session-wide domain bypass ---
        await SESSION_STORAGE.set({ [sessionKey]: true });

        // Clean up the one-time flag from local storage
        await chrome.storage.local.remove(proceedFlagKey);
        return; // Stop further processing
    }

    // If not bypassed, proceed with the standard phishing check
    try {
        const response = await fetch(`${API_URL}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: tab.url }),
        });

        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }

        const apiData = await response.json();

        if (apiData.status === 'phishing') {
            console.log(`Phishing detected: ${tab.url}`);
            const warningPageUrl = chrome.runtime.getURL('warning.html');
            const targetUrl = `${warningPageUrl}?url=${encodeURIComponent(apiData.url)}&confidence=${apiData.confidence}&reasons=${encodeURIComponent(apiData.reasons.join(','))}`;
            chrome.tabs.update(tabId, { url: targetUrl });
        }
    } catch (error) {
        console.error('Error calling prediction API:', error);
    }
});

// Listen for a click on the extension's icon to open the dashboard
chrome.action.onClicked.addListener((tab) => {
  const dashboardUrl = `${API_URL}/dashboard`;
  chrome.tabs.query({ url: dashboardUrl }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
    } else {
      chrome.tabs.create({ url: dashboardUrl });
    }
  });
});