"use strict";


/**
 * Show an element.
 * @function
 * @param {string} id - The ID of the element.
 */
const show = (id) => {
    const e = document.getElementById(id);
    if (e) {
        e.style.display = "";
    }
};
/**
 * Hide an element.
 * @function
 * @param {string} id - The ID of the element.
 */
const hide = (id) => {
    const e = document.getElementById(id);
    if (e) {
        e.style.display = "none";
    }
};

/**
 * Set the element to show for the first part.
 * @function
 * @param {string} id - The ID of the element to show.
 */
const firstPart = (id) => {
    hide("not-injected");
    hide("blocking");
    hide("allowing");
    show(id);
};
/**
 * Set the element to show for the second part.
 * @function
 * @param {string} id - The ID of the element to show.
 */
const secondPart = (id) => {
    hide("force-close-on");
    hide("force-close-off");
    show(id);
};

/**
 * Initialize the popup.
 * @function
 * @param {integer} id - The ID of the tab that this popup is for.
 */
const init = (id) => {
    const pipe = chrome.runtime.connect({ name: "popup" });
    pipe.postMessage({ cmd: "set tab id", id: id });

    pipe.onMessage.addListener((msg) => {
        if (!msg || !msg.cmd) {
            return;
        }

        switch (msg.cmd) {
            case "init":
                if (msg.injected) {
                    if (msg.allowOnce) {
                        firstPart("allowing");
                    } else {
                        firstPart("blocking");
                    }
                } else {
                    firstPart("not-injected");
                }

                if (msg.closeOnSpam) {
                    secondPart("force-close-on");
                } else {
                    secondPart("force-close-off");
                }
                break;

            case "revoke allow once":
                firstPart("blocking");
                break;
            case "allow once":
                firstPart("allowing");
                break;

            case "disable close on spam":
                secondPart("force-close-off");
                break;
            case "enable close on spam":
                secondPart("force-close-on");
                break;

            default:
                return;
        }

        hide("loading");
    });

    document.querySelector("#blocking > button").addEventListener("click", () => {
        show("loading");
        pipe.postMessage({ cmd: "allow once" });
    });
    document.querySelector("#allowing > button").addEventListener("click", () => {
        show("loading");
        pipe.postMessage({ cmd: "revoke allow once" });
    });

    document.querySelector("#force-close-on > button").addEventListener("click", () => {
        show("loading");
        pipe.postMessage({ cmd: "disable close on spam" });
    });
    document.querySelector("#force-close-off > button").addEventListener("click", () => {
        show("loading");
        pipe.postMessage({ cmd: "enable close on spam" });
    });
}


chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!chrome.runtime.lastError) {
        init(tabs[0].id);
    }
});
