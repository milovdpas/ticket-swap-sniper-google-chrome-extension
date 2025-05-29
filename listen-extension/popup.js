const toggleBtn = document.getElementById('toggleMonitoring');
const maxPriceInput = document.getElementById('maxPrice');
const minTicketsInput = document.getElementById('minTickets');

function saveState(monitoring) {
    chrome.storage.local.set({
        maxPrice: parseFloat(maxPriceInput.value),
        minTickets: parseInt(minTicketsInput.value),
        monitoring,
    });
}

function loadState() {
    chrome.storage.local.get(['maxPrice', 'minTickets', 'monitoring'], (result) => {
        if (result.maxPrice !== undefined) maxPriceInput.value = result.maxPrice;
        if (result.minTickets !== undefined) minTicketsInput.value = result.minTickets;
        const isMonitoring = result.monitoring === true;

        toggleBtn.dataset.monitoring = isMonitoring ? "true" : "false";
        toggleBtn.textContent = isMonitoring ? "Stop Monitoring" : "Start Monitoring";
        toggleBtn.style.backgroundColor = isMonitoring ? "red" : "green";

        if (isMonitoring) {
            sendStartEvent()
        }
    });
}

function startMonitoring() {
    const maxPrice = parseFloat(maxPriceInput.value);
    const minTickets = parseInt(minTicketsInput.value);

    if (isNaN(maxPrice) || isNaN(minTickets)) {
        alert('Please enter valid numbers for all fields.');
        return false;
    }

    chrome.storage.local.set({maxPrice, minTickets, monitoring: true}, () => {
        sendStartEvent()
    });
    return true;
}

function sendStartEvent() {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs.length === 0) return;

        chrome.tabs.sendMessage(tabs[0].id, {action: "startMonitoring"}, (response) => {
            if (chrome.runtime.lastError) {
                console.info("Content script not available on this page.");
            }
        });
    });
}

function stopMonitoring() {
    chrome.storage.local.set({monitoring: false}, () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: "stopMonitoring"});
        });
    });
}

toggleBtn.addEventListener('click', () => {
    if (toggleBtn.dataset.monitoring === "true") {
        stopMonitoring();
        toggleBtn.textContent = "Start Monitoring";
        toggleBtn.style.backgroundColor = "green";
        toggleBtn.dataset.monitoring = "false";
    } else {
        if (startMonitoring()) {
            toggleBtn.textContent = "Stop Monitoring";
            toggleBtn.style.backgroundColor = "red";
            toggleBtn.dataset.monitoring = "true";
        }
    }
});

// Save input fields on change to keep state persistent
function checkForRestart() {
    const isMonitoring = toggleBtn.dataset.monitoring === "true";
    saveState(isMonitoring);

    if (isMonitoring) {
        // Force reload monitoring with new settings
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: "restartMonitoring"});
        });
    }
}

maxPriceInput.addEventListener('change', checkForRestart);

minTicketsInput.addEventListener('change', (e) => {
    const value = parseInt(e.target.value);
    const now = Date.now();
    chrome.storage.local.get(['blockedListings'], (result) => {
        const blockedListings = result.blockedListings || {};
        for (const [url, settings] of Object.entries(blockedListings)) {
            if (settings.tickets === value) {
                delete blockedListings[url];
            }
            if (now > settings.expiresAt) {
                delete blocked[url];
            }
        }
        chrome.storage.local.set({blockedListings: blockedListings});

        checkForRestart();
    });
});

// Load saved state on popup open
document.addEventListener('DOMContentLoaded', loadState);
