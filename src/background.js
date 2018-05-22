/**
 * The background script.
 */
"use strict";


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
         * Whether next inline install attempt is allowed.
         * @property @var {boolean}
         */
        this.allowOnce = false;
        /**
         * Communication pipes, one for each frame. Keys are frame ID.
         * @property @var {Map.<integer, Port>}
         */
        this.pipes = new Map();


        tabs.set(this.id, this);
    }

    /**
     * Port disconnect event handler.
     * @private @method
     * @listens Port.onDisconnect
     * @param {integer} id - The frame ID.
     */
    _onDisconnect(id) {
        this.pipes.delete(id);

        if (this.pipes.size === 0) {
            tabs.delete(this.id);
        }
    }

    /**
     * Port message event handler.
     * @private @method
     * @listens Port.onMessage
     * @param {Object} msg - The incoming message object.
     */
    _onMessage(msg) {
        if (!msg || !msg.cmd) {
            return;
        }

        let popupEvent = null;
        switch (msg.cmd) {
            case "allow once used":
                this.allowOnce = false;
                this.broadcast("revoke allow once");

                this.counter = -1;
                this.count();

                popupEvent = "revoke allow once";
                break;

            case "attempt blocked":
                this.count();
                break;

            case "injected":
                popupEvent = "revoke allow once";
                break;

            default:
                return;
        }

        if (popupEvent) {
            for (let popup of popups.values()) {
                if (popup.tab === this.id) {
                    popup.pipe.postMessage({ cmd: popupEvent });
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
        const id = pipe.sender.frameId;

        if (this.pipes.has(id)) {
            this.pipes.get(id).disconnect();
        }

        pipe.onDisconnect.addListener(this._onDisconnect.bind(this, id));
        pipe.onMessage.addListener(this._onMessage.bind(this));
        this.pipes.set(id, pipe);
    }

    /**
     * Broadcast message to all frames.
     * @method
     * @param {string} msg - The message to broadcast.
     */
    broadcast(msg) {
        for (let frame of this.pipes.values()) {
            frame.postMessage({ cmd: msg });
        }
    }

    /**
     * Add one to counter, then update badge if needed.
     * @method
     */
    count() {
        this.counter++;

        if (this.counter <= 1000) {
            chrome.browserAction.setBadgeBackgroundColor({
                color: "darkred",
                tabId: this.id,
            });
            chrome.browserAction.setBadgeText({
                text: (this.counter > 999 ? "999+" : this.counter.toString()),
                tabId: this.id,
            });
        }

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
};

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
         * @const {integer|null}
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


        this.pipe.onDisconnect.addListener(this._onDisconnect.bind(this));
        this.pipe.onMessage.addListener(this._onMessage.bind(this));

        popups.set(this.key, this);
    }

    /**
     * On disconnect event handler.
     * @private @method
     */
    _onDisconnect() {
        popups.delete(this.key);
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
                if (
                    typeof msg.id === "number" &&
                    !isNaN(msg.id) && isFinite(msg.id) &&
                    msg.id !== chrome.tabs.TAB_ID_NONE
                ) {
                    this.tab = msg.id;
                } else {
                    return;
                }

                let injected;
                let allowOnce;

                if (tabs.has(this.tab)) {
                    injected = true;
                    allowOnce = tabs.get(this.tab).allowOnce;
                } else {
                    injected = false;
                    allowOnce = false;
                }

                this.pipe.postMessage({
                    cmd: "init",
                    injected: injected,
                    allowOnce: allowOnce,
                    closeOnSpam: closeOnSpam,
                });
                break;

            case "allow once":
                if (this.tab === null || !tabs.has(this.tab)) {
                    return;
                }

                const t = tabs.get(this.tab);
                t.allowOnce = true;
                t.broadcast("allow once");

                chrome.browserAction.setBadgeBackgroundColor({
                    color: "green",
                    tabId: this.tab,
                });
                chrome.browserAction.setBadgeText({
                    text: "OFF",
                    tabId: this.tab,
                });

                this.pipe.postMessage({ cmd: "allow once" });
                break;

            case "revoke allow once":
                if (this.tab === null || !tabs.has(this.tab)) {
                    return;
                }

                const t = tabs.get(this.tab);
                t.allowOnce = false;
                t.broadcast("revoke allow once");

                t.counter = -1;
                t.count();

                this.pipe.postMessage({ cmd: "revoke allow once" });
                break;

            case "disable close on spam":
                closeOnSpam = false;

                // Add a delay to prevent going over sync storage throughput
                // Loading overlay will show during this delay
                // The response is sent in chrome.storage.onChanged handler
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
                return;
        }
    }
};


/**
 * Tabs container.
 * @var {Map.<integer, Tab>}
 */
let tabs = new Map();
/**
 * Popup container.
 * @var {Map.<integer, Popup>}
 */
let popups = new Map();


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


chrome.storage.sync.get("closeOnSpam", (items) => {
    if (!chrome.runtime.lastError) {
        closeOnSpam = items.closeOnSpam !== false;

        const e = (closeOnSpam ? "enable" : "disable") + " close on spam";
        for (let v of popups.values()) {
            v.pipe.postMessage({ cmd: e });
        }
    }
});

chrome.storage.onChanged.addListener((change) => {
    if (change.closeOnSpam) {
        closeOnSpam = change.closeOnSpam.newValue !== false;
        const e = (closeOnSpam ? "enable" : "disable") + " close on spam";
        for (let v of popups.values()) {
            v.pipe.postMessage({ cmd: e });
        }
    }
});

chrome.runtime.onConnect.addListener((pipe) => {
    if (pipe.name === "content") {
        if (
            pipe.sender && pipe.sender.tab &&
            pipe.sender.tab.id !== chrome.tabs.TAB_ID_NONE
        ) {
            const id = pipe.sender.tab.id;
            if (!tabs.has(id)) {
                // Global variable is updated in the constructor
                new Tab(id);
            }

            tabs.get(id).connect(pipe);
        } else {
            pipe.disconnect();
        }

    } else if (pipe.name === "popup") {
        // Global variable is updated in the constructor
        new Popup(pipe);

    } else {
        pipe.disconnect();
    }
});
