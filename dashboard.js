// --- File: dashboard.js (for Pie Chart Design) ---

document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const FLASK_SERVER_URL = 'http://127.0.0.1:5000';
    const REFRESH_INTERVAL = 3000; // Refresh every 3 seconds

    // --- Element Selectors ---
    const blockedCountEl = document.querySelector('#stat-blocked .value');
    const proceededCountEl = document.querySelector('#stat-proceeded .value');
    const legitimateCountEl = document.querySelector('#stat-legitimate .value');
    const totalCountEl = document.querySelector('#stat-total .value');
    const latencyEl = document.querySelector('#stat-latency .value');
    const activityLogEl = document.getElementById('activity-log');
    
    const whitelistInput = document.getElementById('whitelist-input');
    const addWhitelistBtn = document.getElementById('add-whitelist-btn');
    const whitelistEl = document.getElementById('whitelist');

    const clearHistoryBtn = document.getElementById('clear-history-btn');

    // --- NEW: Quick Test Elements ---
    const quickTestUrlInput = document.getElementById('quick-test-url');
    const quickTestGtSelect = document.getElementById('quick-test-gt');
    const quickTestBtn = document.getElementById('quick-test-btn');
    const quickTestResultEl = document.getElementById('quick-test-result');

    let urlPieChart = null; // To hold the chart instance

    // --- Main function to fetch and render ---
    async function refreshDashboard() {
        try {
            const response = await fetch(`${FLASK_SERVER_URL}/api/data`);
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            const data = await response.json();

            renderAnalytics(data.analytics);
            renderActivityLog(data.history);
            renderWhitelist(data.whitelist);

        } catch (error) {
            console.error("Failed to refresh dashboard data:", error);
        }
    }

    // --- Render Functions ---
    function renderAnalytics(analytics) {
        blockedCountEl.textContent = analytics.blocked || 0;
        proceededCountEl.textContent = analytics.proceeded || 0;
        legitimateCountEl.textContent = analytics.legitimate || 0;
        totalCountEl.textContent = analytics.total || 0;
        latencyEl.textContent = `${analytics.avg_latency || 0} ms`;
        renderPieChart(analytics.blocked || 0, analytics.proceeded || 0, analytics.legitimate || 0);
    }

    function renderPieChart(blocked, proceeded, legitimate) {
        const ctx = document.getElementById('url-pie-chart').getContext('2d');
        const chartData = {
            labels: ['Blocked', 'Bypassed', 'Legitimate'],
            datasets: [{
                data: [blocked, proceeded, legitimate],
                backgroundColor: ['#ef4444', '#f59e0b', '#22c55e'],
                borderColor: '#ffffff',
                borderWidth: 4,
            }]
        };

        if (urlPieChart) {
            urlPieChart.destroy();
        }
        urlPieChart = new Chart(ctx, {
            type: 'doughnut',
            data: chartData,
            options: {
                responsive: true,
                cutout: '60%',
                animation: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { boxWidth: 12, font: { size: 12, family: "'Inter', sans-serif" } }
                    },
                    tooltip: { enabled: true }
                }
            }
        });
    }

    function renderActivityLog(history) {
        activityLogEl.innerHTML = '';
        if (!history || history.length === 0) {
            activityLogEl.innerHTML = '<tr><td colspan="4" class="empty-state">No browsing activity has been logged yet.</td></tr>';
        } else {
            history.forEach(item => {
                const tr = document.createElement('tr');
                let statusHtml = '';
                if (item.userAction === 'proceeded') {
                    statusHtml = `<span style="color:var(--accent-amber)">⚠️ Proceeded</span>`;
                } else if (item.status === 'phishing') {
                    statusHtml = `<span style="color:var(--accent-red)">🔴 Phishing</span>`;
                } else {
                    statusHtml = `<span style="color:var(--accent-green)">🟢 Legitimate</span>`;
                }
                
                // FIX: Use a more reliable and consistent date formatter to avoid timezone issues.
                const formattedDate = new Date(item.timestamp).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });

                const confidence = item.confidence ? `${item.confidence}%` : 'N/A';
                tr.innerHTML = `
                    <td>${statusHtml}</td>
                    <td><span class="url" title="${item.url}">${item.url}</span></td>
                    <td>${confidence}</td>
                    <td>${formattedDate}</td>
                `;
                activityLogEl.appendChild(tr);
            });
        }
    }
    
    function renderWhitelist(whitelist) {
        whitelistEl.innerHTML = '';
        if (!whitelist || whitelist.length === 0) {
            whitelistEl.innerHTML = '<div class="empty-state"><p>Your whitelist is empty.</p></div>';
        } else {
            whitelist.forEach(domain => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${domain}</span><button class="remove-btn" data-domain="${domain}">Remove</button>`;
                whitelistEl.appendChild(li);
            });
        }
    }

    // --- NEW: Quick Test Logic ---
    quickTestBtn.addEventListener('click', async () => {
        const url = quickTestUrlInput.value.trim();
        if (!url) {
            // Using a custom message box instead of alert()
            showTemporaryMessage('Please enter a URL to test.', 'error');
            return;
        }

        const groundTruth = quickTestGtSelect.value || null;
        
        quickTestBtn.disabled = true;
        quickTestBtn.textContent = 'Predicting...';
        
        try {
            const payload = { url };
            if (groundTruth) {
                payload.ground_truth = groundTruth;
            }

            const response = await fetch(`${FLASK_SERVER_URL}/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Prediction failed');
            }

            const result = await response.json();
            displayQuickTestResult(result);
            // Refresh the main dashboard after a short delay
            setTimeout(refreshDashboard, 500);

        } catch (error) {
            displayQuickTestResult({ error: error.message });
        } finally {
            quickTestBtn.disabled = false;
            quickTestBtn.textContent = 'Predict';
        }
    });

    function displayQuickTestResult(result) {
        quickTestResultEl.style.display = 'block';
        if (result.error) {
            quickTestResultEl.innerHTML = `<p style="color: var(--accent-red);"><strong>Error:</strong> ${result.error}</p>`;
            return;
        }
        
        const statusClass = result.status === 'phishing' ? 'color: var(--accent-red);' : 'color: var(--accent-green);';
        let reasonsHtml = '';
        if (result.reasons && result.reasons.length > 0) {
            reasonsHtml = '<ul>' + result.reasons.map(r => `<li>${r}</li>`).join('') + '</ul>';
        }

        quickTestResultEl.innerHTML = `
            <p><strong>Status:</strong> <span style="${statusClass} font-weight: 600;">${result.status.toUpperCase()}</span></p>
            <p><strong>Confidence:</strong> ${result.confidence}%</p>
            ${reasonsHtml}
        `;
    }

    // A simple, custom message box to replace alert()
    function showTemporaryMessage(message, type) {
        // You'd need to create a modal or a div in the HTML to display this message.
        // For now, we'll just log it to the console as a placeholder.
        console.warn(`[Message] Type: ${type}, Content: ${message}`);
    }


    // --- Event Listeners ---
    addWhitelistBtn.addEventListener('click', async () => {
        const domain = whitelistInput.value.trim();
        if (domain) {
            await fetch(`${FLASK_SERVER_URL}/api/whitelist/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: domain })
            });
            whitelistInput.value = '';
            refreshDashboard();
        }
    });

    whitelistEl.addEventListener('click', async (e) => {
        if (e.target.classList.contains('remove-btn')) {
            const domainToRemove = e.target.dataset.domain;
            await fetch(`${FLASK_SERVER_URL}/api/whitelist/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: domainToRemove })
            });
            refreshDashboard();
        }
    });
    
    clearHistoryBtn.addEventListener('click', async () => {
        await fetch(`${FLASK_SERVER_URL}/api/history/clear`, { method: 'POST' });
        refreshDashboard();
    });

    // --- Initial Load & Interval ---
    refreshDashboard();
    setInterval(refreshDashboard, REFRESH_INTERVAL);
});
