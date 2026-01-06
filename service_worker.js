const READWISE_SAVE_ENDPOINT = "https://readwise.io/api/v3/save/";
const STORAGE_KEYS = {
  accessToken: "readwise_access_token",
};

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

async function saveToReader({ url, html, shouldCleanHtml, title, author }) {
  const { [STORAGE_KEYS.accessToken]: token } = await storageLocalGet([
    STORAGE_KEYS.accessToken,
  ]);
  if (!token) {
    throw new Error("Readwise Access Token is not set. Please configure it in the Options page.");
  }

  const payload = { url };
  if (html) {
    payload.html = html;
    payload.should_clean_html = !!shouldCleanHtml;
  }

  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  const normalizedAuthor = typeof author === "string" ? author.trim() : "";

  if (normalizedTitle) {
    payload.title = normalizedTitle;
  }
  if (normalizedAuthor) {
    payload.author = normalizedAuthor;
  }

  if (html && payload.should_clean_html === false) {
    const urlHostname = (() => {
      try {
        return new URL(url).hostname || "";
      } catch {
        return "";
      }
    })();

    payload.title = payload.title || urlHostname || url;
    payload.author = payload.author || urlHostname || "Unknown";
  }

  const response = await fetch(READWISE_SAVE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const errorJson = await response.json();
      throw new Error(
        `Save failed (HTTP ${response.status}): ${JSON.stringify(errorJson)}`
      );
    }

    const errorText = await response.text();
    throw new Error(`Save failed (HTTP ${response.status}): ${errorText}`);
  }

  return await response.json();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "READWISE_SAVE") {
    return;
  }

  (async () => {
    try {
      const data = await saveToReader({
        url: message.url,
        html: message.html,
        shouldCleanHtml: message.shouldCleanHtml,
        title: message.title,
        author: message.author,
      });
      sendResponse({ ok: true, data });
    } catch (error) {
      sendResponse({
        ok: false,
        error:
          error instanceof Error ? error.message : error ? String(error) : "Unknown error",
      });
    }
  })();

  return true;
});
