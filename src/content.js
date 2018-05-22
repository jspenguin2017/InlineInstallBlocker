/**
 * The content script.
 */
"use strict";


const magic = "InlineInstallBlockerInternal_" +
    Math.random().toString(36).substring(2) +
    Math.random().toString(36).substring(2);


const pipe = chrome.runtime.connect({ name: "content" });

pipe.onMessage.addListener((msg) => {
    dispatchEvent(new CustomEvent(magic, { detail: msg.cmd }));
});
addEventListener(magic, (e) => {
    pipe.postMessage({ cmd: e.detail });
});


const code = () => {
    "use strict";
    let allowOnce = false;

    const magic = "{{magic}}";
    const dispatchEvent = window.dispatchEvent.bind(window);
    const CustomEvent = window.CustomEvent.bind(window);
    const setTimeout = window.setTimeout.bind(window);
    const random = window.Math.random.bind(window.Math);

    window.addEventListener(magic, (e) => {
        switch (e.detail) {
            case "allow once":
                allowOnce = true;
                break;

            case "revoke allow once":
                allowOnce = false;
                break;

            default:
                break;
        }
    });

    const _install = window.chrome.webstore.install.bind(window.chrome.webstore);
    const _installStr = window.chrome.webstore.install.toString();
    const install = (...args) => {
        if (allowOnce) {
            allowOnce = false;
            dispatchEvent(new CustomEvent(magic, { detail: "allow once used" }));
            return _install(...args);
        } else {
            dispatchEvent(new CustomEvent(magic, { detail: "attempt blocked" }));
            if (args[2] instanceof window.Function) {
                setTimeout(() => {
                    args[2]("User cancelled install", "userCancelled");
                }, (500 + 500 * random()) | 0);
            }
        }
    };
    window.chrome.webstore.install = install;

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

    dispatchEvent(new CustomEvent(magic, { detail: "injected" }));
};

const script = document.createElement("script");
script.textContent = "(" + code.replace("{{magic}}", magic) + ")();";
document.documentElement.prepend(script);
script.remove();
