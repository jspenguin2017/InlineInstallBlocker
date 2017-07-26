"use strict";

//The communication key
const magic = "" + Math.random() + Math.random();

//Establish communication channels
//The content script only serve as a bridge between background script and page script
addEventListener(magic, (e) => {
    chrome.runtime.sendMessage({ cmd: e.detail });
});
chrome.runtime.onMessage.addListener((...args) => {
    dispatchEvent(new CustomEvent(magic, { detail: args[0].cmd }));
});

//Payload to inject
const payload = () => {

    //Temporary allow flag
    let allowOnce = false;

    //Establish communication channel, cache pointers to critical functions for security
    const magic = "${magic}";
    const dispatchEvent = window.dispatchEvent.bind(window);
    const CustomEvent = window.CustomEvent.bind(window);
    window.addEventListener(magic, (e) => {
        switch (e.detail) {
            case "allow once":
                allowOnce = true;
                break;
            case "revoke allow once":
                allowOnce = false;
                break;
            default:
                //Ignore
                break;
        }
    });

    //Patch chrome.webstore.install
    const _install = window.chrome.webstore.install.bind(window.chrome.webstore);
    const _installStr = window.chrome.webstore.install.toString();
    const install = (...args) => {
        if (allowOnce) {
            allowOnce = false;
            dispatchEvent(new CustomEvent(magic, {
                detail: "allow once used",
            }));
            return _install(...args);
        } else {
            dispatchEvent(new CustomEvent(magic, {
                detail: "attempt blocked",
            }));
        }
    };
    window.chrome.webstore.install = install;

    //Patch Function.prototype.toString to prevent detection
    const _toString = window.Function.prototype.toString;
    const _toStringStr = window.Function.prototype.toString.toString();
    const toString = function () {
        if (this === install) {
            return _installStr;
        } else if (this === toString) {
            return _toStringStr;
        } else {
            return _toString.apply(this, arguments);
        }
    };
    window.Function.prototype.toString = toString;
};

//Inject payload
const script = document.createElement("script");
script.textContent = "(" + payload.toString().replace("${magic}", magic) + ")();";
document.documentElement.prepend(script);
script.remove();
