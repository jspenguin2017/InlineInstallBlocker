"use strict";

//Block counter
let data = {};

//Temporary allowed tabs
let allowed = [];

//Whether the tab sould be forcefully closed if it spam the inline install API
const SPAM_THREATHOLD = 10;
let closeOnSpam = false;

//Communication pipe to popup page
let popupPipe = null;

/**
 * Update counter of a tab.
 * @function
 * @param {integer} tab - The tab ID.
 * @param {integer} count - The count.
 */
const updateCounter = (tab, count) => {
    chrome.browserAction.setBadgeBackgroundColor({
        color: "darkred",
        tabId: args[1].tab.id,
    });
    chrome.browserAction.setBadgeText({
        text: String([args[0].count]),
        tabId: args[1].tab.id,
    });
};

//Establish communication channel
chrome.runtime.onMessage.addListener((data, sender) => {
    if (data &&
        sender && sender.tab && sender.tab.id && sender.tab.id !== chrome.tabs.TAB_ID_NONE) {
        const tab = sender.tab.id;
        switch (data.cmd) {
            //Page script events
            case "allow once used":
                //Remove from allowed
                const i = allowed.indexOf(tab);
                if (i > -1) {
                    allowed.splice(i, 1);
                }
                //Reset counter
                data[tab] = 0;
                //Revoke allow once in other frames
                chrome.tabs.sendMessage(tab, { cmd: "revoke allow once" });
                //Tell popup page
                if (popupPipe) {
                    popupPipe.postMessage({ cmd: "allow once revoked" });
                }
                //Update badge
                updateCounter(tab, 0);
                break;
            case "attempt blocked":
                //Update counter
                if (data[tab]) {
                    data[tab]++
                } else {
                    data[tab] = 1;
                }
                //Update badge
                updateCounter(tab, data[tab]);
                break;
            default:
                //Ignore
                break;
        }
    }
});

//Fetch settings
chrome.storage.sync.get("closeOnSpam", (items) => {
    if (!chrome.runtime.lastError) {
        closeOnSpam = items.closeOnSpam === true;
    }
});
