"use strict";

/**
 * Check last error and noop.
 * @function
 */
const noop = () => {
    void chrome.runtime.lastError;
};

/**
 * Tabs container.
 * @var <Tabs>
 */
let tabs = {};
/**
 * Tab class.
 * @class
 */
const Tab = class {

    /**
     * Constructor.
     * @constructor
     * @param {integer} id - The ID of the tab.
     */
    constructor(id) {
        //Tab ID
        this.id = id;
        //Blocked counter
        this.counter = 0;
        //Whether script successfully injected
        this.injected = false;
        //If next attempt is allowed
        this.allowOnce = false;
        //Communication pipes
        this.pipes = {};
        //Save to global variable
        tabs[this.id] = this;
    }

    /**
     * On disconnect event handler.
     * @method
     * @private
     * @param {integer} id - The frame ID.
     */
    _onDisconnect(id) {
        debugger;
        delete this.pipes[id];
        if (Object.keys(this.pipes).length === 0) {
            //Tab closed, remove self
            delete tabs[this.id];
        }
    }
    /**
     * On message event handler.
     * @method
     * @private
     * @param {Object} msg - The incoming message object.
     */
    _onMessage(msg) {
        if (msg && msg.cmd) {
            let popupEvent = null;
            switch (msg.cmd) {
                case "allow once used":
                    //Disable allow once in other frames
                    this.allowOnce = false;
                    this.broadcast("revoke allow once");
                    //Reset and redraw counter
                    this.counter = -1;
                    this.count();
                    //Inform popup
                    for (let key in popups) {
                        if (popups[key].id === this.id) {
                            popups[key].pipe.postMessage({ cmd: "allow once used" });
                        }
                    }
                    popupEvent = "revoke allow once";
                    break;
                case "attempt blocked":
                    this.count();
                    break;
                case "injected":
                    this.injected = true;
                    popupEvent = "revoke allow once";
                    break;
                default:
                    //Ignore
                    return;
            }
            //Dispatch the event to popup if needed
            if (popupEvent) {
                for (let i = 0; i < popups.length; i++) {
                    if (popups[i].tab === this.id) {
                        popups[i].pipe.postMessage({ cmd: popupEvent });
                    }
                }
            }
        }
    }

    /**
     * Handle connection from a new pipe.
     * @method
     * @param {Port} pipe - The new pipe.
     */
    connect(pipe) {
        const id = pipe.sender.frameId;
        //Disconnect if it already exist
        if (this.pipes[id]) {
            this.pipes[id].disconnect();
        }
        //Save pipe and bind event handlers
        this.pipes[id] = pipe;
        this.pipes[id].onDisconnect.addListener(this._onDisconnect.bind(this, id));
        this.pipes[id].onMessage.addListener(this._onMessage.bind(this));
    }

    /**
     * Broadcast message to all frames.
     * @method
     * @param {string} msg - The message
     */
    broadcast(msg) {
        for (let key in this.pipes) {
            this.pipes[key].postMessage({ cmd: msg });
        }
    }

    /**
     * Add one to counter, then update badge if needed.
     * @method
     */
    count() {
        if (++this.counter < 1001) {
            //Update badge only when needed
            chrome.browserAction.setBadgeBackgroundColor({
                color: "darkred",
                tabId: this.id,
            });
            chrome.browserAction.setBadgeText({
                text: this.counter > 999 ? "999+" : this.counter.toString(),
                tabId: this.id,
            });
        }
        if (closeOnSpam && this.counter > SPAM_THREATHOLD) {
            this.close();
        }
    }

    /**
     * Force close this tab.
     * @method
     */
    close() {
        chrome.tabs.remove(this.id);
    }

    /**
     * Shut down all communication pipes.
     * @method
     */
    dispose() {
        for (let key in pipes) {
            pipes[key].disconnect();
        }
    }

};

/**
 * Popup container
 */
const popups = {};
let _popupsCounter = 0;
/**
 * Popup class.
 * @class
 */
const Popup = class {

    /**
     * Constructor.
     * @constructor
     * @param {Port} pipe - The communication pipe.
     */
    constructor(pipe) {
        //Tab ID, will be fetched later
        this.tab = null;
        //Popup ID
        this.id = _popupsCounter++;
        //The communication pipe
        this.pipe = pipe;
        //Bind event handlers
        this.pipe.onDisconnect.addListener(this._onDisconnect.bind(this));
        this.pipe.onMessage.addListener(this._onMessage.bind(this));
        //Save to global variable
        popups[this.id] = this;
    }

    /**
     * On disconnect event handler.
     * @method
     * @private
     */
    _onDisconnect() {
        debugger;
        delete popups[this.id];
    }
    /**
     * On message event handler.
     * @method
     * @private
     * @param {Object} msg - The incoming message object.
     */
    _onMessage(msg) {
        if (msg && msg.cmd) {
            switch (msg.cmd) {
                case "set tab id":
                    const id = parseInt(msg.id);
                    if (!isNaN(id) && isFinite(id) && id !== chrome.tabs.TAB_ID_NONE) {
                        this.tab = id;
                    }
                    //Send back init event
                    let injected, allowOnce;
                    if (tabs[this.tab]) {
                        injected = tabs[this.tab].injected;
                        allowOnce = tabs[this.tab].allowOnce;
                    } else {
                        injected = false; allowOnce = false;
                    }
                    this.pipe.postMessage({
                        cmd: "init",
                        injected: injected,
                        allowOnce: allowOnce,
                        closeOnSpam: closeOnSpam,
                    });
                    break;

                case "allow once":
                    if (this.tab !== null && tabs[this.tab]) {
                        tabs[this.tab].allowOnce = true;
                        tabs[this.tab].broadcast("allow once");
                        //Update badge
                        chrome.browserAction.setBadgeBackgroundColor({
                            color: "green",
                            tabId: this.tab,
                        });
                        chrome.browserAction.setBadgeText({
                            text: "OFF",
                            tabId: this.tab,
                        });
                    }
                    //Echo event back
                    this.pipe.postMessage({ cmd: "allow once" });
                    break;
                case "revoke allow once":
                    if (this.tab !== null && tabs[this.tab]) {
                        tabs[this.tab].allowOnce = false;
                        tabs[this.tab].counter = -1;
                        tabs[this.tab].count();
                        tabs[this.tab].broadcast("revoke allow once");
                    }
                    this.pipe.postMessage({ cmd: "revoke allow once" });
                    break;

                case "disable close on spam":
                    closeOnSpam = false;
                    chrome.storage.sync.set({ closeOnSpam: closeOnSpam });
                    setTimeout(() => {
                        //Prevent going over sync storage throughput
                        if (popups[this.id] === this) {
                            this.pipe.postMessage({ cmd: "disable close on spam" });
                        }
                    }, 1000);
                    break;
                case "enable close on spam":
                    closeOnSpam = true;
                    chrome.storage.sync.set({ closeOnSpam: closeOnSpam });
                    setTimeout(() => {
                        if (popups[this.id] === this) {
                            this.pipe.postMessage({ cmd: "enable close on spam" });
                        }
                    }, 1000);
                    break;

                default:
                    //Ignore
                    break;
            }
        }
    }

};

/**
 * The threathold for force closing.
 * @const {Integer}
 */
const SPAM_THREATHOLD = 10;
/**
 * Whether a tab that spams inline install API should be forcefully closed.
 * @var {boolean}
 */
let closeOnSpam = false;
//Fetch settings
chrome.storage.sync.get("closeOnSpam", (items) => {
    if (!chrome.runtime.lastError) {
        //Default to activated
        closeOnSpam = items.closeOnSpam !== false;
    }
});

//Bind sync handler
chrome.storage.onChanged.addListener((change) => {
    if (change.closeOnSpam) {
        closeOnSpam = change.closeOnSpam.newValue !== false;
        //Dispatch to every popup
        const e = (closeOnSpam ? "enable" : "disable") + " close on spam";
        for (let i = 0; i < popups.length; i++) {
            popups[i].pipe.postMessage({ cmd: e });
        }
    }
});

//Establish communication channel
chrome.runtime.onConnect.addListener((pipe) => {
    if (pipe.name === "content") {
        //From a content script
        if (pipe.sender && pipe.sender.tab && pipe.sender.tab.id !== chrome.tabs.TAB_ID_NONE) {
            const id = pipe.sender.tab.id;
            //Add entry if this is a new tab
            if (!tabs[id]) {
                new Tab(id);
            }
            //Register this pipe
            tabs[id].connect(pipe);
        } else {
            //Not a valid connection
            pipe.disconnect();
        }
    } else if (pipe.name === "popup") {
        //From popup page
        new Popup(pipe);
    } else {
        //Drop connection otherwise
        pipe.disconnect();
    }
});
