"use strict";

document.getElementById("loading").style.display = "none";
document.getElementById("content").style.display = "";

const flipHandler = function () {
    this.classList.toggle("flip-card-flipped");
};
const cards = document.querySelectorAll(".flip-card");
for (let i = 0; i < cards.length; i++) {
    cards[i].addEventListener("click", flipHandler);
}
