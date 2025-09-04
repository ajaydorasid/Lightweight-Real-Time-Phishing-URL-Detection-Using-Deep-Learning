// --- File: warning.js ---

// This function runs after the entire HTML page has been loaded
document.addEventListener('DOMContentLoaded', () => {
    // Get the HTML elements we need to modify
    const urlElement = document.getElementById('dangerous-url');
    const confidenceElement = document.getElementById('confidence-score');
    const reasonsListElement = document.getElementById('reasons-list');
    const backButton = document.getElementById('back-button');
    const proceedButton = document.getElementById('proceed-button');

    // Get the data sent from the background script from the page's URL
    const params = new URLSearchParams(window.location.search);
    const originalUrl = params.get('url');
    const confidence = params.get('confidence');
    // Reasons are sent as a comma-separated string, so we split them into an array
    const reasons = params.get('reasons') ? params.get('reasons').split(',') : [];

    // --- 1. Populate the page with the dynamic data ---
    if (originalUrl) {
        urlElement.textContent = originalUrl;
    }
    if (confidence) {
        confidenceElement.textContent = `${confidence}%`;
    }

    // Clear the "Checking reasons..." placeholder
    reasonsListElement.innerHTML = '';
    if (reasons.length > 0) {
        // Create a list item for each reason and add it to the list
        reasons.forEach(reason => {
            const li = document.createElement('li');
            li.textContent = reason;
            reasonsListElement.appendChild(li);
        });
    } else {
        // If no reasons were provided, show a default message
        const li = document.createElement('li');
        li.textContent = 'The URL structure matches patterns seen in malicious sites.';
        reasonsListElement.appendChild(li);
    }

    // --- 2. Add functionality to the "Go Back to Safety" button ---
    backButton.addEventListener('click', () => {
        // The safest action is to close the current tab.
        // We query for the active tab to get its ID and then close it.
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.remove(tabs[0].id);
            }
        });
    });

    // --- 3. Add functionality to the "Proceed Anyway" button ---
    proceedButton.addEventListener('click', () => {
        // We set a flag in the extension's storage to tell the background script
        // not to check this specific URL again for this session.
        const proceedFlagKey = `phishing_detector_proceed_${originalUrl}`;
        
        // The structure { [key]: value } is a computed property name, allowing a dynamic key.
        chrome.storage.local.set({ [proceedFlagKey]: true }, () => {
            console.log(`Proceed flag set for ${originalUrl}`);
            // Redirect the user to the original destination
            window.location.href = originalUrl;
        });
    });
});