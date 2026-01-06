const STORAGE_KEYS = {
  accessToken: "readwise_access_token",
  shouldCleanHtml: "readwise_should_clean_html",
  preserveMathMl: "readwise_preserve_mathml",
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
}

function syncTogglesEnabled({ hasToken }) {
  $("preserveMathMl").disabled = !hasToken;
  $("shouldCleanHtml").disabled = !hasToken;
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

async function captureRenderedHtml({ preserveMathMl }) {
  const tabId = await getActiveTabId();
  const results = await new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        args: [!!preserveMathMl],
        func: (preserveMathMl) => {
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

            function renderMathMlToHtmlElement(mathEl) {
              const isBlock = mathEl.getAttribute("display") === "block";
              const container = document.createElement(isBlock ? "div" : "span");
              container.className = isBlock ? "rw-math-block" : "rw-math-inline";

              function appendText(target, value) {
                const text = String(value || "")
                  .replace(/[\u200B\u2060\u2061\uFEFF]/g, "")
                  .replace(/\s+/g, " ");
                if (!text.trim()) {
                  return;
                }
                target.appendChild(document.createTextNode(text));
              }

              function render(node, target) {
                if (!node) {
                  return;
                }

                if (node.nodeType === Node.TEXT_NODE) {
                  appendText(target, node.nodeValue || "");
                  return;
                }

                if (node.nodeType !== Node.ELEMENT_NODE) {
                  return;
                }

                const tag = String(node.tagName || "").toLowerCase();
                if (!tag) {
                  return;
                }

                if (tag === "annotation") {
                  return;
                }

                if (tag === "semantics") {
                  for (const child of Array.from(node.children || [])) {
                    if (String(child.tagName || "").toLowerCase() === "annotation") {
                      continue;
                    }
                    render(child, target);
                  }
                  return;
                }

                if (tag === "msub" || tag === "msup" || tag === "msubsup") {
                  const base = node.children?.[0];
                  const sub = tag !== "msup" ? node.children?.[1] : null;
                  const sup = tag !== "msub" ? node.children?.[tag === "msubsup" ? 2 : 1] : null;

                  if (base) {
                    render(base, target);
                  }
                  if (sub) {
                    const subEl = document.createElement("sub");
                    render(sub, subEl);
                    target.appendChild(subEl);
                  }
                  if (sup) {
                    const supEl = document.createElement("sup");
                    render(sup, supEl);
                    target.appendChild(supEl);
                  }
                  return;
                }

                if (tag === "munder" || tag === "mover" || tag === "munderover") {
                  const base = node.children?.[0];
                  const under = tag !== "mover" ? node.children?.[1] : null;
                  const over = tag === "munderover" ? node.children?.[2] : tag === "mover" ? node.children?.[1] : null;

                  if (base) {
                    render(base, target);
                  }
                  if (under) {
                    const subEl = document.createElement("sub");
                    render(under, subEl);
                    target.appendChild(subEl);
                  }
                  if (over) {
                    const supEl = document.createElement("sup");
                    render(over, supEl);
                    target.appendChild(supEl);
                  }
                  return;
                }

                if (tag === "mfrac") {
                  const numerator = node.children?.[0];
                  const denominator = node.children?.[1];
                  appendText(target, "(");
                  if (numerator) {
                    render(numerator, target);
                  }
                  appendText(target, ")/(");
                  if (denominator) {
                    render(denominator, target);
                  }
                  appendText(target, ")");
                  return;
                }

                if (tag === "mtable") {
                  const rows = Array.from(node.children || []).filter(
                    (child) => String(child.tagName || "").toLowerCase() === "mtr"
                  );
                  let isFirstRow = true;
                  for (const row of rows) {
                    if (!isFirstRow) {
                      target.appendChild(document.createElement("br"));
                    }
                    isFirstRow = false;
                    render(row, target);
                  }
                  return;
                }

                if (tag === "mtr") {
                  const cells = Array.from(node.children || []).filter(
                    (child) => String(child.tagName || "").toLowerCase() === "mtd"
                  );
                  for (let i = 0; i < cells.length; i += 1) {
                    if (i > 0) {
                      appendText(target, " ");
                    }
                    render(cells[i], target);
                  }
                  return;
                }

                if (tag === "mtd") {
                  for (const child of Array.from(node.childNodes || [])) {
                    render(child, target);
                  }
                  return;
                }

                if (tag === "mspace") {
                  appendText(target, " ");
                  return;
                }

                for (const child of Array.from(node.childNodes || [])) {
                  render(child, target);
                }
              }

              render(mathEl, container);
              return container;
            }

            function latexToPlainText(input) {
              let text = String(input || "").replace(/\s+/g, " ").trim();
              if (!text) {
                return "";
              }

              function readBraceGroup(source, startIndex) {
                if (source[startIndex] !== "{") {
                  return null;
                }

                let depth = 1;
                let i = startIndex + 1;
                let content = "";
                while (i < source.length) {
                  const ch = source[i];
                  if (ch === "{") {
                    depth += 1;
                    content += ch;
                  } else if (ch === "}") {
                    depth -= 1;
                    if (depth === 0) {
                      return { content, endIndex: i + 1 };
                    }
                    content += ch;
                  } else {
                    content += ch;
                  }
                  i += 1;
                }

                return null;
              }

              function replaceFractions(source) {
                let out = "";
                let i = 0;

                while (i < source.length) {
                  const fracIndex = source.indexOf("\\frac", i);
                  if (fracIndex === -1) {
                    out += source.slice(i);
                    break;
                  }

                  out += source.slice(i, fracIndex);

                  let cursor = fracIndex + "\\frac".length;
                  while (cursor < source.length && /\s/.test(source[cursor])) {
                    cursor += 1;
                  }

                  const numerator = readBraceGroup(source, cursor);
                  if (!numerator) {
                    out += "\\frac";
                    i = fracIndex + "\\frac".length;
                    continue;
                  }

                  cursor = numerator.endIndex;
                  while (cursor < source.length && /\s/.test(source[cursor])) {
                    cursor += 1;
                  }

                  const denominator = readBraceGroup(source, cursor);
                  if (!denominator) {
                    out += `(${numerator.content})/()`;
                    i = numerator.endIndex;
                    continue;
                  }

                  out += `(${numerator.content})/(${denominator.content})`;
                  i = denominator.endIndex;
                }

                return out;
              }

              text = text.replaceAll("\\left", "");
              text = text.replaceAll("\\right", "");

              text = replaceFractions(text);

              text = text.replace(/\\text\s*\{([^}]*)\}/g, "$1");
              text = text.replace(/\\mathrm\s*\{([^}]*)\}/g, "$1");
              text = text.replace(/\\operatorname\s*\{([^}]*)\}/g, "$1");

              const commandMap = {
                alpha: "α",
                beta: "β",
                gamma: "γ",
                delta: "δ",
                epsilon: "ε",
                zeta: "ζ",
                eta: "η",
                theta: "θ",
                iota: "ι",
                kappa: "κ",
                lambda: "λ",
                mu: "μ",
                nu: "ν",
                xi: "ξ",
                pi: "π",
                rho: "ρ",
                sigma: "σ",
                tau: "τ",
                upsilon: "υ",
                phi: "φ",
                chi: "χ",
                psi: "ψ",
                omega: "ω",
                Gamma: "Γ",
                Delta: "Δ",
                Theta: "Θ",
                Lambda: "Λ",
                Xi: "Ξ",
                Pi: "Π",
                Sigma: "Σ",
                Upsilon: "Υ",
                Phi: "Φ",
                Psi: "Ψ",
                Omega: "Ω",
                leq: "≤",
                geq: "≥",
                neq: "≠",
                times: "×",
                pm: "±",
                cdot: "·",
                dots: "…",
                ldots: "…",
                cdots: "…",
                prime: "′",
                dagger: "†",
                sum: "∑",
                prod: "∏",
                int: "∫",
              };

              text = text.replace(/\\([a-zA-Z]+)(?=[^a-zA-Z]|$)/g, (match, name) => {
                if (Object.prototype.hasOwnProperty.call(commandMap, name)) {
                  return commandMap[name];
                }
                if (
                  name === "boldsymbol" ||
                  name === "bm" ||
                  name === "mathbf" ||
                  name === "mathcal" ||
                  name === "mathbb"
                ) {
                  return "";
                }
                return name;
              });

              text = text.replaceAll("\\,", " ");
              text = text.replaceAll("\\!", "");
              text = text.replace(/[{}]/g, "");
              text = text.replace(/\s+/g, " ").trim();
              return text;
            }

            function collapseWhitespaceTextNodes(rootEl) {
              const preserveTags = new Set(["CODE", "PRE", "SCRIPT", "STYLE", "TEXTAREA", "MATH"]);
              const nodes = [];
              const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) {
                const node = walker.currentNode;
                const raw = node.nodeValue || "";
                if (raw.trim() !== "") {
                  continue;
                }

                let parent = node.parentElement;
                let shouldPreserve = false;
                while (parent) {
                  if (preserveTags.has(parent.tagName)) {
                    shouldPreserve = true;
                    break;
                  }
                  parent = parent.parentElement;
                }
                if (shouldPreserve) {
                  continue;
                }

                nodes.push(node);
              }

              for (const node of nodes) {
                node.nodeValue = " ";
              }
            }

            const contentClone = contentEl.cloneNode(true);

            if (preserveMathMl) {
              for (const mathEl of contentClone.querySelectorAll("math")) {
                mathEl.replaceWith(renderMathMlToHtmlElement(mathEl));
              }
            } else {
              for (const mathEl of contentClone.querySelectorAll("math")) {
                const annotationEl = mathEl.querySelector(
                  'annotation[encoding="application/x-tex"]'
                );
                const rawLatex =
                  annotationEl?.textContent || mathEl.getAttribute("alttext") || "";
                const latex = rawLatex.replace(/\s+/g, " ").trim();
                const normalizedLatex = latex.replace(/\\bm(?=\\{)/g, "\\boldsymbol");
                const plainLatex = latexToPlainText(normalizedLatex);
                const isBlock = mathEl.getAttribute("display") === "block";
                const replacement = document.createElement(isBlock ? "div" : "span");
                replacement.className = isBlock ? "rw-math-block" : "rw-math-inline";

                if (plainLatex) {
                  replacement.textContent = plainLatex;
                } else {
                  replacement.textContent = (mathEl.textContent || "").trim();
                }

                mathEl.replaceWith(replacement);
              }
            }

            for (const svgEl of contentClone.querySelectorAll("svg")) {
              const foreignObjects = Array.from(svgEl.querySelectorAll("foreignObject"));
              if (foreignObjects.length === 0) {
                continue;
              }

              const parts = foreignObjects
                .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
                .filter(Boolean);

              let text = parts.join("\n");
              if (!text) {
                svgEl.remove();
                continue;
              }

              text = text.replace(/^\s*Takeaway\s*/i, "Takeaway\n");
              text = text.replace(/\s*(\(\d+\))\s*/g, "\n$1 ");
              text = text.replace(/\n{2,}/g, "\n").trim();

              const lines = text
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);

              const replacement = document.createElement("span");
              replacement.className = "rw-svg-foreignobject-text";
              replacement.innerHTML = lines.map(escapeHtml).join("<br />");

              svgEl.replaceWith(replacement);
            }

            collapseWhitespaceTextNodes(contentClone);

            const extractedTitle = titleEl?.textContent?.trim?.() || "";
            const extractedAuthor = (descEl?.textContent || "")
              .replace(/\s+/g, " ")
              .trim();
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
      <section>${contentClone.innerHTML}</section>
    </article>
  </body>
</html>`;

            return { title: extractedTitle, author: extractedAuthor, html };
          }

          const simpleReader = extractSimpleReader();
          if (simpleReader?.html) {
            return {
              url: location.href,
              title: simpleReader.title || document.title || "",
              author: simpleReader.author || "",
              html: simpleReader.html,
              source: "simplereader",
            };
          }

          function extractAuthorFromMeta() {
            const citationAuthors = Array.from(
              document.querySelectorAll('meta[name="citation_author"]')
            )
              .map((el) => el.getAttribute("content") || "")
              .map((text) => text.trim())
              .filter(Boolean);
            if (citationAuthors.length > 0) {
              return citationAuthors.join(", ");
            }

            const el = document.querySelector(
              [
                'meta[name="author"]',
                'meta[property="article:author"]',
                'meta[name="dc.creator"]',
                'meta[name="dc.Creator"]',
                'meta[name="DC.Creator"]',
                'meta[name="DC.creator"]',
              ].join(",")
            );
            return (el?.getAttribute("content") || "").trim();
          }

          return {
            url: location.href,
            title: document.title || "",
            author: extractAuthorFromMeta(),
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
    STORAGE_KEYS.preserveMathMl,
  ]);
  const hasToken = !!data[STORAGE_KEYS.accessToken];
  const shouldCleanHtml = !!data[STORAGE_KEYS.shouldCleanHtml];
  const preserveMathMl = data[STORAGE_KEYS.preserveMathMl] !== false;

  $("shouldCleanHtml").checked = shouldCleanHtml;
  $("preserveMathMl").checked = preserveMathMl;

  $("tokenWarning").hidden = hasToken;
  setButtonsEnabled(hasToken);
  syncTogglesEnabled({ hasToken });
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
    const preserveMathMl = $("preserveMathMl").checked;
    const shouldCleanHtml = $("shouldCleanHtml").checked;

    const { url, title, author, html, source } = await captureRenderedHtml({
      preserveMathMl,
    });
    if (!isHttpUrl(url)) {
      throw new Error("This page is not http/https; Readwise may not be able to save it.");
    }
    const resp = await sendToBackground({
      type: "READWISE_SAVE",
      url,
      title,
      author,
      html,
      shouldCleanHtml,
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

  $("preserveMathMl").addEventListener("change", async () => {
    const preserveMathMl = $("preserveMathMl").checked;
    await storageLocalSet({
      [STORAGE_KEYS.preserveMathMl]: preserveMathMl,
    });

    await refreshUiFromStorage({ preserveStatus: true });
  });

  await refreshUiFromStorage();
});
