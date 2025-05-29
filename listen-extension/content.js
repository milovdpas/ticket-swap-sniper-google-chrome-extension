let maxPrice, minTickets;
let observer = null;

function notifyUser(price, tickets) {
    tryToSendMessage(() => chrome.runtime.sendMessage({ type: "ticketFound", price, tickets }))
    const audio = new Audio(chrome.runtime.getURL("ping.mp3"));
    audio.play();
}

function processOffers() {
    tryToSendMessage(() => chrome.runtime.sendMessage({type: "processOffers"}))

    chrome.storage.local.get(['blockedListings'], (result) => {
        const blockedListings = result.blockedListings || {};
        const blockedList = Object.keys(blockedListings) || [];

        // Find the "Beschikbare tickets" header
        const header = [...document.querySelectorAll("h3.styles_h3__fj7M_")]
            .find(h => h.innerText.trim().toLowerCase() === "beschikbare tickets");

        if (!header) {
            console.warn("❌ 'Beschikbare tickets' header not found.");
            return false;
        }

        // Go to parent and then the second child (ticket container)
        const parent = header.parentElement;
        const ticketContainer = parent?.children[1];

        if (!ticketContainer) {
            console.warn("❌ Ticket container after header not found.");
            return false;
        }

        const offers = ticketContainer.querySelectorAll('a[href*="/listing/"]');
        let bestOffer = null;
        let lowestPrice = Infinity;
        let ticketCount = 0;

        for (let offer of offers) {
            const url = offer.href;
            if (blockedList.includes(url)) continue;

            const title = offer.querySelector('h4')?.innerText || '';
            const match = title.match(/(\d+)\s+tickets?/i);
            const count = match ? parseInt(match[1]) : 0;

            const priceText = offer.querySelector('strong')?.innerText || '';
            const price = parseFloat(priceText.replace(/[^\d,.-]/g, '').replace(',', '.'));

            if (count >= minTickets && !isNaN(price) && price <= maxPrice && price < lowestPrice) {
                bestOffer = offer;
                lowestPrice = price;
                ticketCount = count;
            }
        }

        if (bestOffer) {
            notifyUser(lowestPrice, ticketCount);
            const ticketUrl = bestOffer.href;
            tryToSendMessage(() => chrome.runtime.sendMessage({ type: "openTicket", url: ticketUrl }))
            stopMonitoring();
        }
    });
}

function startMutationMonitoring() {
    stopMonitoring(); // Ensure no duplicate observers

    processOffers(); // Initial run

    observer = new MutationObserver(() => {
        processOffers();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log("TicketSwap Sniper: Monitoring started");
}

function stopMonitoring() {
    if (observer) {
        observer.disconnect();
        observer = null;
        console.log("TicketSwap Sniper: Monitoring stopped");
    }
}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "startMonitoring") {
        chrome.storage.local.get(['maxPrice', 'minTickets'], (data) => {
            maxPrice = data.maxPrice;
            minTickets = data.minTickets;
            startMutationMonitoring();
        });
    }

    if (msg.action === "stopMonitoring") {
        stopMonitoring();
    }

    if (msg.action === "restartMonitoring") {
        chrome.storage.local.get(['maxPrice', 'minTickets'], (data) => {
            maxPrice = data.maxPrice;
            minTickets = data.minTickets;
            startMutationMonitoring();
        });
    }
});

function tryToSendMessage(message){
    try{
        message();
    }catch (e) {
        alert("Reloading the page to continue monitoring.");
        stopMonitoring();
        location.reload();
        console.log(`error trying to send message: ${e}`);
    }
}

chrome.storage.local.get(['monitoring'], (data) => {
    const isMonitoring = data.monitoring === true;
    if(!isMonitoring){
        return;
    }
    startMutationMonitoring();
    if (window.location.href.includes("/listing/")) {
        console.log("TicketSwap Sniper: Listing page detected. Attempting auto-click.");
        tryClickBuyButton();
    }
});

function tryClickBuyButton() {
    setTimeout(() => {
        const isTicketPackage = document.body.innerText.includes("Deze tickets worden alleen samen verkocht");
        const somebodyElsyBuying = document.body.innerText.includes("Iemand anders is deze tickets al aan het kopen");

        if(somebodyElsyBuying){
            addToBlockedListings(0, window.location.href, 10);
            alert("This listing has been blocked due to somebody else buying it. Monitoring will continue.");
        } else if (isTicketPackage) {
            // Extract ticket count from <h2>
            const h2 = document.querySelector('h2');
            let count = 0;

            if (h2) {
                const match = h2.innerText.match(/(\d+)\s+tickets?/i);
                if (match) count = parseInt(match[1]);
            }

            chrome.storage.local.get(['minTickets'], (data) => {
                const expected = data.minTickets;

                if (count !== expected) {
                    addToBlockedListings(count, window.location.href, 'never');
                    alert("This listing has been blocked due to ticket package mismatch. Monitoring will continue.");
                    return;
                }

                // else: allowed to proceed
                clickBuyButton();
            });
        } else {
            clickBuyButton(); // normal case
        }
    }, 1000);
}

function addToBlockedListings(tickets, url, minutesExpiresAt = 10) {
    console.log("🚫 Adding listing to blocked listings:", url);

    const now = Date.now();
    expiresAt = minutesExpiresAt === 'never' ? 'never' : now + minutesExpiresAt * 60 * 1000;
    chrome.storage.local.get(['blockedListings'], (result) => {
        const blockedListings = result.blockedListings || {};
        if (!(url in blockedListings)) {
            blockedListings[url] = {
                tickets: tickets,
                expiresAt: expiresAt
            };
            chrome.storage.local.set({ blockedListings: blockedListings });
        }
    });
}

function clickBuyButton() {
    const buttons = [...document.querySelectorAll("button")];
    const buyButton = buttons.find(btn =>
        btn.innerText.trim().toLowerCase().includes("in winkelwagen")
    );

    if (buyButton) {
        console.log("✅ Clicking 'In winkelwagen' button.");
        buyButton.click();
        chrome.storage.local.set({ monitoring: false });
        stopMonitoring();

        setTimeout(() => {
            alert("Monitoring stopped. Ticket added to cart.");
        }, 2000);
    } else {
        console.warn("⚠️ 'In winkelwagen' button not found.");
    }
}