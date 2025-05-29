chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ticketFound") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon.png",
      title: "🎫 Ticket Found!",
      message: `A ticket is available for €${message.price}.`,
      priority: 2
    });
  }
});