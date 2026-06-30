"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("open-full-page");
  if (!button) return;

  button.addEventListener("click", () => {
    const target = "app.html";
    if (globalThis.chrome?.tabs?.create && globalThis.chrome?.runtime?.getURL) {
      chrome.tabs.create({ url: chrome.runtime.getURL(target) }, () => {
        window.close();
      });
      return;
    }

    window.open(target, "_blank", "noopener");
  });
});
