const STORAGE_KEYS = {
  accessToken: "readwise_access_token",
};

function $(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: #${id}`);
  }
  return element;
}

function setStatus(text) {
  $("status").textContent = text || "";
}

function storageLocalGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(items);
    });
  });
}

function storageLocalSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function storageLocalRemove(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

async function loadToken() {
  const data = await storageLocalGet([STORAGE_KEYS.accessToken]);
  $("tokenInput").value = data[STORAGE_KEYS.accessToken] || "";
}

async function saveToken() {
  const token = $("tokenInput").value.trim();
  if (!token) {
    setStatus("Please enter a token.");
    return;
  }
  await storageLocalSet({ [STORAGE_KEYS.accessToken]: token });
  setStatus("Saved.");
}

async function clearToken() {
  await storageLocalRemove([STORAGE_KEYS.accessToken]);
  $("tokenInput").value = "";
  setStatus("Cleared.");
}

function toggleTokenVisibility() {
  const input = $("tokenInput");
  const button = $("toggleToken");
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  button.textContent = isPassword ? "Hide" : "Show";
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadToken();

  $("saveToken").addEventListener("click", saveToken);
  $("clearToken").addEventListener("click", clearToken);
  $("toggleToken").addEventListener("click", toggleTokenVisibility);
});
