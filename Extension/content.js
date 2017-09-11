"use strict";

//The communication key
const magic = "InlineInstallBlockerEvent_" + Math.random().toString(36).substring(2);

//Establish communication bridge
const pipe = chrome.runtime.connect({ name: "content" });
pipe.onMessage.addListener((msg) => {
    dispatchEvent(new CustomEvent(magic, { detail: msg.cmd }));
});
addEventListener(magic, (e) => {
    pipe.postMessage({ cmd: e.detail });
});

{
    //Payload to inject
    const payload = `(() => {
        //Temporary allow flag
        let allowOnce = false;

        //Cache pointers to critical functions for security
        const magic = "${magic}";
        const dispatchEvent = window.dispatchEvent.bind(window);
        const CustomEvent = window.CustomEvent.bind(window);
        const setTimeout = window.setTimeout.bind(window);
        const random = window.Math.random.bind(window.Math);

        //Bind event handler
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
                dispatchEvent(new CustomEvent(magic, { detail: "allow once used" }));
                return _install(...args);
            } else {
                dispatchEvent(new CustomEvent(magic, { detail: "attempt blocked" }));
                if (args[2] instanceof window.Function) {
                    setTimeout(() => {
                        args[2]("The user canceled the operation.", "userCanceled");
                    }, (50 * random() + 50) | 0);
                }
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

        //Let backround script know page script is injected
        dispatchEvent(new CustomEvent(magic, { detail: "injected" }));
    })();`;

    //Inject page script
    const script = document.createElement("script");
    script.textContent = payload;
    document.documentElement.prepend(script);
    script.remove();
}
