let monitorTimeouts = [];
let maxPrice, interval, minTickets;

function notifyUser(price, tickets) {
    chrome.runtime.sendMessage({type: "ticketFound", price, tickets});
    const audio = new Audio(chrome.runtime.getURL("ping.mp3"));
    audio.play();
}

function checkForTickets() {
    const offers = document.querySelectorAll('a[href*="/listing/"]');

    for (let offer of offers) {
        const title = offer.querySelector('h4')?.innerText || '';
        const match = title.match(/(\d+)\s+tickets?/i);
        const ticketCount = match ? parseInt(match[1]) : 0;

        const priceText = offer.querySelector('strong')?.innerText || '';
        const price = parseFloat(priceText.replace(/[^\d,.-]/g, '').replace(',', '.'));

        if (ticketCount >= minTickets && !isNaN(price) && price <= maxPrice) {
            notifyUser(price, ticketCount);
            offer.click();
            return true;
        }
    }

    return false;
}

function scheduleNextCheck() {
    const jitter = Math.floor(Math.random() * 5000) - 2500; // +/- 2.5s
    const nextInterval = Math.max(15000, interval * 1000 + jitter); // min 15 sec

    monitorTimeouts.push(setTimeout(() => {
        if (!checkForTickets()) {
            // If reloading too fast is an issue, add a cooldown here or increment reload count
            location.reload();
        } else {
            chrome.storage.local.set({ monitoring: false });
            stopMonitoring();
        }
        scheduleNextCheck();
    }, nextInterval));
}

function startMonitoring(newMaxPrice, newInterval, newMinTickets) {
    maxPrice = newMaxPrice;
    interval = newInterval;
    minTickets = newMinTickets;
    scheduleNextCheck();
}

function stopMonitoring() {
    if (monitorTimeouts.length === 0) return;
    for (const timeout of monitorTimeouts) {
        clearTimeout(timeout);
    }
    monitorTimeouts = [];
}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "startMonitoring") {
        chrome.storage.local.get(['maxPrice', 'interval', 'minTickets'], ({maxPrice, interval, minTickets}) => {
            if (maxPrice && interval && minTickets) {
                startMonitoring(maxPrice, interval, minTickets);
            }
        });
    }
    if (msg.action === "stopMonitoring") {
        stopMonitoring();
    }
});
