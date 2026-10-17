const api = globalThis.browser ?? globalThis.chrome;

for (const element of document.querySelectorAll("[data-message]")) {
  element.textContent = api.i18n.getMessage(element.dataset.message);
}

const checkbox = document.getElementById("show-open-button");

api.storage.sync.get({ showOpenButton: true }).then(({ showOpenButton }) => {
  checkbox.checked = showOpenButton;
});

checkbox.addEventListener("change", () => {
  void api.storage.sync.set({ showOpenButton: checkbox.checked });
});
