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
         * Whether next inline install attempt is allowed.
         * @property @var {boolean}
         */
        this.allowOnce = false;
        /**
         * Communication pipes, one for each frame. Keys are frame ID.
         * @property @var {Object.<Port>}
         */
        this.pipes = {};

        tabs[this.id] = this;
    }

    /**
     * On disconnect event handler.
     * @private @method
     * @param {integer} id - The frame ID.
     */
    _onDisconnect(id) {
        delete this.pipes[id];

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
            for (let key in popups) {
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
        const id = pipe.sender.frameId;

        if (this.pipes[id]) {
            this.pipes[id].disconnect();
        }

        this.pipes[id] = pipe;
        this.pipes[id].onDisconnect
            .addListener(this._onDisconnect.bind(this, id));
        this.pipes[id].onMessage
            .addListener(this._onMessage.bind(this));
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

        this.pipe.onDisconnect.addListener(this._onDisconnect.bind(this));
        this.pipe.onMessage.addListener(this._onMessage.bind(this));

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
                const id = parseInt(msg.id);
                if (
                    !isNaN(id) && isFinite(id) &&
                    id !== chrome.tabs.TAB_ID_NONE
                ) {
                    this.tab = id;
                } else {
                    return;
                }

                let injected, allowOnce;
                if (tabs[this.tab]) {
                    injected = true;
                    allowOnce = tabs[this.tab].allowOnce;
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
                if (this.tab === null || !tabs[this.tab]) {
                    return;
                }

                tabs[this.tab].allowOnce = true;
                tabs[this.tab].broadcast("allow once");

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
                if (this.tab === null || !tabs[this.tab]) {
                    return;
                }

                tabs[this.tab].allowOnce = false;
                tabs[this.tab].broadcast("revoke allow once");

                tabs[this.tab].counter = -1;
                tabs[this.tab].count();

                this.pipe.postMessage({ cmd: "revoke allow once" });
                break;

            case "disable close on spam":
                closeOnSpam = false;
                // Add a delay to prevent going over sync storage throughput
                // Loading overlay will show during this delay
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
        for (let key in popups) {
            popups[key].pipe.postMessage({ cmd: e });
        }
    }
});

chrome.storage.onChanged.addListener((change) => {
    if (change.closeOnSpam) {
        closeOnSpam = change.closeOnSpam.newValue !== false;
        const e = (closeOnSpam ? "enable" : "disable") + " close on spam";
        for (let key in popups) {
            popups[key].pipe.postMessage({ cmd: e });
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
            if (!tabs[id]) {
                new Tab(id);
            }
            tabs[id].connect(pipe);
        } else {
            pipe.disconnect();
        }
    } else if (pipe.name === "popup") {
        new Popup(pipe);
    } else {
        pipe.disconnect();
    }
});
