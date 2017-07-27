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
 * Set the element to show for the first section.
 * @function
 * @param {string} id - The ID of the element to show.
 */
const firstSection = (id) => {
    hide("not-injected");
    hide("blocking");
    hide("allowing");
    show(id);
};
/**
 * Set the element to show for the second section.
 * @function
 * @param {string} id - The ID of the element to show.
 */
const secondSection = (id) => {
    hide("force-close-on");
    hide("force-close-off");
    show(id);
};

//Fetch current tab ID
(new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
            reject(lastError);
        } else {
            resolve(tabs[0].id);
        }
    });
})).then((id) => {

    //Connect to background page
    const pipe = chrome.runtime.connect({ name: "popup" });
    //Tell background which tab am I for
    pipe.postMessage({ cmd: "set tab id", id: id });

    //Bind event handler
    pipe.onMessage.addListener((msg) => {
        switch (msg.cmd) {
            case "init":
                //First part
                if (msg.injected) {
                    if (msg.allowOnce) {
                        firstSection("allowing");
                    } else {
                        firstSection("blocking");
                    }
                } else {
                    firstSection("not-injected");
                }

                //Second part
                if (msg.closeOnSpam) {
                    secondSection("force-close-on");
                } else {
                    secondSection("force-close-off");
                }
                break;

            case "revoke allow once":
                firstSection("blocking");
                break;
            case "allow once":
                firstSection("allowing");
                break;

            case "disable close on spam":
                secondSection("force-close-off");
                break;
            case "enable close on spam":
                secondSection("force-close-on");
                break;

            default:
                //Ignore
                return;
        }
        //Hide loading overlay
        hide("loading");
    });

    //Bind DOM event handlers
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

});
