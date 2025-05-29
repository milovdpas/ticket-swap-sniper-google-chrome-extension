chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ticketFound") {
    console.log("found ticket");
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon.png",
      title: "🎫 Ticket Found!",
      message: `A ticket is available for €${message.price}.`,
      priority: 2
    });
  }
  if (message.type === "processOffers") {
    console.log("processing offers");
  }
  if (message.type === "openTicket" && message.url) {
    chrome.tabs.create({ url: message.url });
  }
});