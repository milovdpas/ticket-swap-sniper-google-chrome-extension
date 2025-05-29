const toggleBtn = document.getElementById('toggleMonitoring');
const maxPriceInput = document.getElementById('maxPrice');
const minTicketsInput = document.getElementById('minTickets');
const intervalSelect = document.getElementById('interval');
const intervalWarning = document.getElementById('intervalWarning');

function saveState(monitoring) {
  chrome.storage.local.set({
    maxPrice: parseFloat(maxPriceInput.value),
    minTickets: parseInt(minTicketsInput.value),
    interval: parseInt(intervalSelect.value),
    monitoring,
  });
}

function loadState() {
  chrome.storage.local.get(['maxPrice', 'minTickets', 'interval', 'monitoring'], (result) => {
    if (result.maxPrice !== undefined) maxPriceInput.value = result.maxPrice;
    if (result.minTickets !== undefined) minTicketsInput.value = result.minTickets;
    if (result.interval !== undefined) intervalSelect.value = result.interval;

    const isMonitoring = result.monitoring === true;

    toggleBtn.dataset.monitoring = isMonitoring ? "true" : "false";
    toggleBtn.textContent = isMonitoring ? "Stop Monitoring" : "Start Monitoring";
    toggleBtn.style.backgroundColor = isMonitoring ? "red" : "green";

    intervalSelect.disabled = isMonitoring; // disable interval during monitoring

    // Show warning only if interval < 30 seconds
    intervalWarning.style.display = (parseInt(intervalSelect.value) < 30) ? "block" : "none";

    if (isMonitoring) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "startMonitoring" });
      });
    }
  });
}

function startMonitoring() {
  const maxPrice = parseFloat(maxPriceInput.value);
  const interval = parseInt(intervalSelect.value);
  const minTickets = parseInt(minTicketsInput.value);

  if (isNaN(maxPrice) || isNaN(interval) || isNaN(minTickets)) {
    alert('Please enter valid numbers for all fields.');
    return false;
  }

  if (interval < 15) {
    alert("Interval too short. Please select 15 seconds or more.");
    return false;
  }

  chrome.storage.local.set({ maxPrice, interval, minTickets, monitoring: true }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "startMonitoring" });
    });
  });
  return true;
}

function stopMonitoring() {
  chrome.storage.local.set({ monitoring: false }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "stopMonitoring" });
    });
  });
}

toggleBtn.addEventListener('click', () => {
  if (toggleBtn.dataset.monitoring === "true") {
    stopMonitoring();
    toggleBtn.textContent = "Start Monitoring";
    toggleBtn.style.backgroundColor = "green";
    toggleBtn.dataset.monitoring = "false";
    intervalSelect.disabled = false;
    intervalWarning.style.display = "none";
  } else {
    if (startMonitoring()) {
      toggleBtn.textContent = "Stop Monitoring";
      toggleBtn.style.backgroundColor = "red";
      toggleBtn.dataset.monitoring = "true";
      intervalSelect.disabled = true;
      intervalWarning.style.display = (parseInt(intervalSelect.value) < 30) ? "block" : "none";
    }
  }
});

// Save input fields on change to keep state persistent
[maxPriceInput, minTicketsInput].forEach(input => {
  input.addEventListener('change', () => {
    const isMonitoring = toggleBtn.dataset.monitoring === "true";
    saveState(isMonitoring);
  });
});

intervalSelect.addEventListener('change', () => {
  // Show warning if less than 30 seconds
  if (parseInt(intervalSelect.value) < 30) {
    intervalWarning.style.display = "block";
  } else {
    intervalWarning.style.display = "none";
  }
  const isMonitoring = toggleBtn.dataset.monitoring === "true";
  saveState(isMonitoring);
});

// Load saved state on popup open
document.addEventListener('DOMContentLoaded', loadState);
