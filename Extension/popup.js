"use strict";

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
    pipe.onMessage.addListener((msg) => {

    });
    pipe.postMessage({ cmd: "set tab id", id: id });
})



//document.getElementById("loading").style.display = "none";

const flipHandler = function () {
    this.classList.toggle("flip-card-flipped");
};
const cards = document.querySelectorAll(".flip-card");
for (let i = 0; i < cards.length; i++) {
    cards[i].addEventListener("click", flipHandler);
}
