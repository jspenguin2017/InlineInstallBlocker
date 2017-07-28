"use strict";

/**
 * Check last error and do nothing.
 * Bind this as callback when all possible errors can be safely ignored.
 * Never used for now.
 * @function
 */
const noop = () => {
    void chrome.runtime.lastError;
};

/**
 * Tabs container.
 * @var {Object.<Tab>}
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
        /**
         * The ID of this tab.
         * @property @const {integer}
         */
        this.id = id;
        /**
         * Blocked inline install attempts counter.
         * @property @var {integer}
         */
        this.counter = 0;
        /**
         * Whether page script was successfully injected.
         * @property @var {boolean}
         */
        this.injected = false;
        /**
         * Whether next inline install attempt is allowed.
         * @property @var {boolean}
         */
        this.allowOnce = false;
        /**
         * Communication pipes, one for each frame. Keys are frame ID.
         * @property @var {Object.<Port>}
         */
        this.pipes = {};

        //Save self to global variable
        tabs[this.id] = this;
    }

    /**
     * On disconnect event handler.
     * @private @method
     * @param {integer} id - The frame ID.
     */
    _onDisconnect(id) {
        //Remove this pipe
        delete this.pipes[id];
        //Remove self from global variable when all pipes are disconnected
        if (Object.keys(this.pipes).length === 0) {
            delete tabs[this.id];
        }
    }
    /**
     * On message event handler.
     * @private @method
     * @param {Object} msg - The incoming message object.
     */
    _onMessage(msg) {
        //Check if the event is valid
        if (!msg || !msg.cmd) {
            return;
        }

        //The popup event to dispatch
        let popupEvent = null;

        //Handle event
        switch (msg.cmd) {
            case "allow once used":
                //Disable allow once in other frames
                this.allowOnce = false;
                this.broadcast("revoke allow once");
                //Reset and redraw badge
                this.counter = -1;
                this.count();
                //Dispatch event to popup
                popupEvent = "revoke allow once";
                break;

            case "attempt blocked":
                this.count();
                break;

            case "injected":
                this.injected = true;
                //Dispatch event to popup, just in case
                popupEvent = "revoke allow once";
                break;
            default:
                //Ignore
                return;
        }

        //Dispatch the event to popup if needed
        if (popupEvent) {
            for (let key in popup) {
                if (popups[key].tab === this.id) {
                    popups[key].pipe.postMessage({ cmd: popupEvent });
                }
            }
        }
    }

    /**
     * Handle connection from a new frame.
     * @method
     * @param {Port} pipe - The new pipe.
     */
    connect(pipe) {
        //Frame ID
        const id = pipe.sender.frameId;

        //Disconnect if I somehow have another one
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
     * @param {string} msg - The message to broadcast.
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
        //Update badge
        if (++this.counter <= 1000) {
            chrome.browserAction.setBadgeBackgroundColor({
                color: "darkred",
                tabId: this.id,
            });
            chrome.browserAction.setBadgeText({
                text: this.counter > 999 ? "999+" : this.counter.toString(),
                tabId: this.id,
            });
        }

        //Check spam threathold and force close tab if needed
        if (closeOnSpam && this.counter >= SPAM_THREATHOLD) {
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
     * Never used for now.
     * @method
     */
    dispose() {
        for (let key in pipes) {
            pipes[key].disconnect();
        }
    }
};

/**
 * Popup container.
 * @var {Object.<Popup>}
 */
const popups = {};
/**
 * Popup key counter.
 * @private @var {integer}
 */
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
        /**
         * The ID of the tab that this popup is for.
         * Will be available later.
         * @const {integer}
         */
        this.tab = null;
        /**
         * Key of this popup.
         * @const {integer}
         */
        this.key = _popupsCounter++;
        /**
         * The communication pipe to the popup.
         * @const {Port}
         */
        this.pipe = pipe;

        //Bind event handlers
        this.pipe.onDisconnect.addListener(this._onDisconnect.bind(this));
        this.pipe.onMessage.addListener(this._onMessage.bind(this));
        //Save self to global variable
        popups[this.key] = this;
    }

    /**
     * On disconnect event handler.
     * @private @method
     */
    _onDisconnect() {
        delete popups[this.key];
    }
    /**
     * On message event handler.
     * @private @method
     * @param {Object} msg - The incoming message object.
     */
    _onMessage(msg) {
        if (!msg || !msg.cmd) {
            return;
        }

        switch (msg.cmd) {
            case "set tab id":
                //Parse and save tab ID that this popup is for
                const id = parseInt(msg.id);
                if (!isNaN(id) && isFinite(id) && id !== chrome.tabs.TAB_ID_NONE) {
                    this.tab = id;
                } else {
                    //Tab ID not valid
                    return;
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
                //Check if tab is still valid
                if (this.tab === null || !tabs[this.tab]) {
                    return;
                }

                //Dispatch event to tab
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

                //Echo event back
                this.pipe.postMessage({ cmd: "allow once" });
                break;

            case "revoke allow once":
                if (this.tab === null || !tabs[this.tab]) {
                    return;
                }

                tabs[this.tab].allowOnce = false;
                tabs[this.tab].broadcast("revoke allow once");

                //Reset and redraw badge
                tabs[this.tab].counter = -1;
                tabs[this.tab].count();

                this.pipe.postMessage({ cmd: "revoke allow once" });
                break;

            case "disable close on spam":
                closeOnSpam = false;
                //Add a delay to prevent going over sync storage throughput
                setTimeout(() => {
                    chrome.storage.sync.set({ closeOnSpam: closeOnSpam });
                }, 1000);
                break;

            case "enable close on spam":
                closeOnSpam = true;
                setTimeout(() => {
                    chrome.storage.sync.set({ closeOnSpam: closeOnSpam });
                }, 1000);
                break;

            default:
                //Ignore
                return;
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
        //Dispatch event to popups
        const e = (closeOnSpam ? "enable" : "disable") + " close on spam";
        for (let key in popups) {
            popups[key].pipe.postMessage({ cmd: e });
        }
    }
});

//Bind sync handler
chrome.storage.onChanged.addListener((change) => {
    if (change.closeOnSpam) {
        closeOnSpam = change.closeOnSpam.newValue !== false;
        //Dispatch event to popups
        const e = (closeOnSpam ? "enable" : "disable") + " close on spam";
        for (let key in popups) {
            popups[key].pipe.postMessage({ cmd: e });
        }
    }
});

//Bind event handler
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
