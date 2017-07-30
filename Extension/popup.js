"use strict";

/**
 * Show an element.
 * @function
 * @param {string} id - The ID of the element.
 */
const show = (id) => {
    const e = document.getElementById(id);
    e && (e.style.display = "");
};
/**
 * Hide an element.
 * @function
 * @param {string} id - The ID of the element.
 */
const hide = (id) => {
    const e = document.getElementById(id);
    e && (e.style.display = "none");
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

//Initialize
(new Promise((resolve, reject) => {
    //Fetch current tab ID
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
            //Not handled as I think this will never happen
            reject(lastError);
        } else {
            resolve(tabs[0].id);
        }
    });
})).then((id) => {
    //Connect to background script
    const pipe = chrome.runtime.connect({ name: "popup" });
    //Tell background script which tab I am for
    pipe.postMessage({ cmd: "set tab id", id: id });

    //Bind event handler
    pipe.onMessage.addListener((msg) => {
        //Check if the event is valid
        if (!msg || !msg.cmd) {
            return;
        }

        //Handle event
        switch (msg.cmd) {
            case "init":
                //First part
                if (msg.injected) {
                    if (msg.allowOnce) {
                        firstPart("allowing");
                    } else {
                        firstPart("blocking");
                    }
                } else {
                    firstPart("not-injected");
                }

                //Second part
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
                //Ignore
                return;
        }

        //Hide loading overlay
        hide("loading");
    });

    //First part
    document.querySelector("#blocking > button").addEventListener("click", () => {
        show("loading");
        pipe.postMessage({ cmd: "allow once" });
    });
    document.querySelector("#allowing > button").addEventListener("click", () => {
        show("loading");
        pipe.postMessage({ cmd: "revoke allow once" });
    });

    //Second part
    document.querySelector("#force-close-on > button").addEventListener("click", () => {
        show("loading");
        pipe.postMessage({ cmd: "disable close on spam" });
    });
    document.querySelector("#force-close-off > button").addEventListener("click", () => {
        show("loading");
        pipe.postMessage({ cmd: "enable close on spam" });
    });
});
