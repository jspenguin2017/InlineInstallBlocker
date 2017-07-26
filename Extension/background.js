"use strict";

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
                    break;
                case "attempt blocked":
                    this.count();
                    break;
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
                    break;
                case "allow once":
                    if (this.tab !== null && tabs[this.tab]) {
                        tabs[this.tab].broadcast("allow once");
                    }
                    break;
                case "revoke allow once":
                    if (this.tab !== null && tabs[this.tab]) {
                        tabs[this.tab].broadcast("revoke allow once");
                    }
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
        closeOnSpam = items.closeOnSpam === true;
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
