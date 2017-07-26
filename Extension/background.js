"use strict";

chrome.runtime.onMessage.addListener((...args) => {
    if (args.length === 3) {
        switch (args[0].cmd) {
            case "update count":
                if (args[1].tab && args[1].tab.id) {
                    //Can sometimes fail, somehow these functions do not accept callback...
                    chrome.browserAction.setBadgeBackgroundColor({
                        color: "darkred",
                        tabId: args[1].tab.id,
                    });
                    chrome.browserAction.setBadgeText({
                        text: String([args[0].count]),
                        tabId: args[1].tab.id,
                    });
                }
                break;
            default:
                //Ignore
                break;
        }
    }
});
