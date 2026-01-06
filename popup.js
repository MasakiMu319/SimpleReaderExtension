const STORAGE_KEYS = {
  accessToken: "readwise_access_token",
  shouldCleanHtml: "readwise_should_clean_html",
};

function $(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: #${id}`);
  }
  return element;
}

function setStatus(text) {
  $("statusText").textContent = text || "";
}

function setButtonsEnabled(enabled) {
  $("sendUrl").disabled = !enabled;
  $("sendHtml").disabled = !enabled;
  $("shouldCleanHtml").disabled = !enabled;
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

async function getActiveTabId() {
  const tabs = await new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result);
    });
  });

  const tab = tabs?.[0];
  if (typeof tab?.id !== "number") {
    throw new Error("Unable to get the active tab.");
  }
  return tab.id;
}

function isHttpUrl(url) {
  return typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"));
}

async function capturePageBasicInfo() {
  const tabId = await getActiveTabId();
  const results = await new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: () => ({
          url: location.href,
          title: document.title || "",
        }),
      },
      (result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(result);
      }
    );
  });
  const value = results?.[0]?.result;
  if (!value?.url) {
    throw new Error("Unable to read the page URL.");
  }
  return value;
}

async function captureRenderedHtml() {
  const tabId = await getActiveTabId();
  const results = await new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: () => {
          function escapeHtml(text) {
            return String(text)
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;")
              .replaceAll("'", "&#39;");
          }

          function extractSimpleReader() {
            const root = document.querySelector(
              ".simpread-read-root.simpread-read-root-show"
            );
            if (!root) {
              return null;
            }

            const titleEl = root.querySelector("sr-rd-title");
            const descEl = root.querySelector("sr-rd-desc");
            const contentEl = root.querySelector("sr-rd-content");
            if (!contentEl) {
              return null;
            }

            const extractedTitle = titleEl?.textContent?.trim?.() || "";
            const pageTitle = document.title || "";
            const safeTitle = escapeHtml(extractedTitle || pageTitle);

            const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <base href="${escapeHtml(location.href)}" />
    <title>${safeTitle}</title>
  </head>
  <body>
    <article>
      ${titleEl ? `<h1>${titleEl.innerHTML}</h1>` : ""}
      ${descEl ? `<section>${descEl.innerHTML}</section>` : ""}
      <section>${contentEl.innerHTML}</section>
    </article>
  </body>
</html>`;

            return { title: extractedTitle, html };
          }

          const simpleReader = extractSimpleReader();
          if (simpleReader?.html) {
            return {
              url: location.href,
              title: simpleReader.title || document.title || "",
              html: simpleReader.html,
              source: "simplereader",
            };
          }

          return {
            url: location.href,
            title: document.title || "",
            html: document.documentElement?.outerHTML || "",
            source: "full",
          };
        },
      },
      (result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(result);
      }
    );
  });
  const value = results?.[0]?.result;
  if (!value?.html) {
    throw new Error("Unable to read the page HTML.");
  }
  return value;
}

async function sendToBackground(payload) {
  return await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

async function refreshUiFromStorage({ preserveStatus = false } = {}) {
  const data = await storageLocalGet([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.shouldCleanHtml,
  ]);
  const hasToken = !!data[STORAGE_KEYS.accessToken];
  const shouldCleanHtml = !!data[STORAGE_KEYS.shouldCleanHtml];

  $("shouldCleanHtml").checked = shouldCleanHtml;

  $("tokenWarning").hidden = hasToken;
  setButtonsEnabled(hasToken);
  if (!preserveStatus) {
    if (!hasToken) {
      setStatus("Please configure your Readwise Access Token in Settings.");
    } else {
      setStatus("");
    }
  }
}

async function onClickSendUrl() {
  setStatus("Sending...");
  setButtonsEnabled(false);

  try {
    const { url, title } = await capturePageBasicInfo();
    if (!isHttpUrl(url)) {
      throw new Error("This page is not http/https; Readwise may not be able to save it.");
    }
    const resp = await sendToBackground({
      type: "READWISE_SAVE",
      url,
      title,
    });
    if (!resp?.ok) {
      throw new Error(resp?.error || "Save failed.");
    }
    setStatus(`Saved (URL)\n${resp.data?.url || ""}`.trim());
  } catch (error) {
    setStatus(
      `Failed: ${
        error instanceof Error ? error.message : error ? String(error) : "Unknown error"
      }`
    );
  } finally {
    await refreshUiFromStorage({ preserveStatus: true });
  }
}

async function onClickSendHtml() {
  setStatus("Sending...");
  setButtonsEnabled(false);

  try {
    const { url, title, html, source } = await captureRenderedHtml();
    if (!isHttpUrl(url)) {
      throw new Error("This page is not http/https; Readwise may not be able to save it.");
    }
    const resp = await sendToBackground({
      type: "READWISE_SAVE",
      url,
      title,
      html,
      shouldCleanHtml: $("shouldCleanHtml").checked,
    });
    if (!resp?.ok) {
      throw new Error(resp?.error || "Save failed.");
    }
    const suffix = source === "simplereader" ? " (SimpleReader)" : "";
    setStatus(`Saved (HTML)${suffix}\n${resp.data?.url || ""}`.trim());
  } catch (error) {
    setStatus(
      `Failed: ${
        error instanceof Error ? error.message : error ? String(error) : "Unknown error"
      }`
    );
  } finally {
    await refreshUiFromStorage({ preserveStatus: true });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  $("openOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  $("goSetup").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  $("sendUrl").addEventListener("click", onClickSendUrl);
  $("sendHtml").addEventListener("click", onClickSendHtml);

  $("shouldCleanHtml").addEventListener("change", async () => {
    await storageLocalSet({
      [STORAGE_KEYS.shouldCleanHtml]: $("shouldCleanHtml").checked,
    });
  });

  await refreshUiFromStorage();
});
