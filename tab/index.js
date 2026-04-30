"use strict";

const $input     = document.getElementById("input");
const $output    = document.getElementById("output");
const $status    = document.getElementById("status");
const $search    = document.getElementById("search");
const $inputMeta = document.getElementById("input-meta");
const $splitter  = document.getElementById("splitter");
const $workspace = document.querySelector(".workspace");
const $inputPane = document.querySelector(".input-pane");
const $outputPane = document.querySelector(".output-pane");

const $btnFormat   = document.getElementById("btn-format");
const $btnMinify   = document.getElementById("btn-minify");
const $btnCopy     = document.getElementById("btn-copy");
const $btnClear    = document.getElementById("btn-clear");
const $btnExpand   = document.getElementById("btn-expand");
const $btnCollapse = document.getElementById("btn-collapse");

const STORAGE_KEY_INPUT = "jsonPreview.lastInput";
const STORAGE_KEY_RATIO = "jsonPreview.splitRatio";

// ---------- helpers ----------

function setStatus(text, type) {
  $status.textContent = text || "";
  $status.className = "status" + (type ? " " + type : "");
}

function showPlaceholder() {
  $output.innerHTML =
    '<div class="placeholder">在左侧粘贴 JSON 后点击「格式化」或按 Ctrl/⌘ + Enter</div>';
}

function updateInputMeta() {
  const len = $input.value.length;
  const bytes = new Blob([$input.value]).size;
  $inputMeta.textContent = len ? `${len} 字符 · ${bytes} B` : "";
}

/**
 * Tolerant JSON parser:
 * 1. JSON.parse
 * 2. Repair trailing commas, single quotes, unquoted keys
 */
function tryParse(raw) {
  const text = raw.trim();
  if (!text) throw new Error("输入为空");

  try {
    return JSON.parse(text);
  } catch (e1) {
    const repaired = text
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, (_, s) => JSON.stringify(s));
    try {
      return JSON.parse(repaired);
    } catch {
      throw e1;
    }
  }
}

// ---------- render ----------

function createEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function renderValue(value) {
  const wrap = createEl("span", "node value");
  if (value === null) {
    wrap.appendChild(createEl("span", "null", "null"));
  } else if (typeof value === "string") {
    wrap.appendChild(createEl("span", "string", JSON.stringify(value)));
  } else if (typeof value === "number" || typeof value === "bigint") {
    wrap.appendChild(createEl("span", "number", String(value)));
  } else if (typeof value === "boolean") {
    wrap.appendChild(createEl("span", "boolean", String(value)));
  } else if (Array.isArray(value)) {
    return renderArray(value);
  } else if (typeof value === "object") {
    return renderObject(value);
  } else {
    wrap.appendChild(createEl("span", "string", String(value)));
  }
  return wrap;
}

function renderObject(obj) {
  const keys = Object.keys(obj);
  const container = createEl("span", "node object");

  const toggle = createEl(
    "span",
    keys.length ? "toggle" : "toggle empty",
    keys.length ? "▾" : " "
  );
  container.appendChild(toggle);
  container.appendChild(createEl("span", "punc", "{"));

  if (keys.length === 0) {
    container.appendChild(createEl("span", "punc", "}"));
    return container;
  }

  container.appendChild(createEl("span", "summary", `… ${keys.length} keys`));

  const children = createEl("div", "children");
  keys.forEach((k, i) => {
    const line = createEl("div", "line");
    line.appendChild(createEl("span", "key", JSON.stringify(k)));
    line.appendChild(createEl("span", "punc", ": "));
    line.appendChild(renderValue(obj[k]));
    if (i < keys.length - 1) line.appendChild(createEl("span", "punc", ","));
    children.appendChild(line);
  });
  container.appendChild(children);

  const closing = createEl("div", "line");
  closing.appendChild(createEl("span", "punc", "}"));
  container.appendChild(closing);

  toggle.addEventListener("click", () => {
    container.classList.toggle("collapsed");
    toggle.textContent = container.classList.contains("collapsed") ? "▸" : "▾";
  });

  return container;
}

function renderArray(arr) {
  const container = createEl("span", "node array");

  const toggle = createEl(
    "span",
    arr.length ? "toggle" : "toggle empty",
    arr.length ? "▾" : " "
  );
  container.appendChild(toggle);
  container.appendChild(createEl("span", "punc", "["));

  if (arr.length === 0) {
    container.appendChild(createEl("span", "punc", "]"));
    return container;
  }

  container.appendChild(createEl("span", "summary", `… ${arr.length} items`));

  const children = createEl("div", "children");
  arr.forEach((v, i) => {
    const line = createEl("div", "line");
    line.appendChild(renderValue(v));
    if (i < arr.length - 1) line.appendChild(createEl("span", "punc", ","));
    children.appendChild(line);
  });
  container.appendChild(children);

  const closing = createEl("div", "line");
  closing.appendChild(createEl("span", "punc", "]"));
  container.appendChild(closing);

  toggle.addEventListener("click", () => {
    container.classList.toggle("collapsed");
    toggle.textContent = container.classList.contains("collapsed") ? "▸" : "▾";
  });

  return container;
}

function render(value) {
  $output.innerHTML = "";
  const tree = createEl("div", "tree");
  tree.appendChild(renderValue(value));
  $output.appendChild(tree);
}

function setAllCollapsed(collapsed) {
  const nodes = $output.querySelectorAll(".node.object, .node.array");
  nodes.forEach((n) => {
    if (collapsed) n.classList.add("collapsed");
    else n.classList.remove("collapsed");
    const t = n.querySelector(":scope > .toggle");
    if (t && !t.classList.contains("empty")) {
      t.textContent = collapsed ? "▸" : "▾";
    }
  });
}

// ---------- actions ----------

function doFormat() {
  const raw = $input.value;
  try {
    const value = tryParse(raw);
    render(value);
    setStatus(
      `✓ 解析成功 · 压缩后 ${JSON.stringify(value).length} 字符`,
      "ok"
    );
    chrome.storage?.local?.set({ [STORAGE_KEY_INPUT]: raw });
  } catch (err) {
    $output.innerHTML = "";
    setStatus(`✗ 解析失败：${err.message}`, "error");
  }
}

function doMinify() {
  const raw = $input.value;
  try {
    const value = tryParse(raw);
    const min = JSON.stringify(value);
    $input.value = min;
    updateInputMeta();
    render(value);
    setStatus(`✓ 已压缩 · ${min.length} 字符`, "ok");
    chrome.storage?.local?.set({ [STORAGE_KEY_INPUT]: min });
  } catch (err) {
    setStatus(`✗ 压缩失败：${err.message}`, "error");
  }
}

async function doCopy() {
  const raw = $input.value;
  try {
    const value = tryParse(raw);
    const pretty = JSON.stringify(value, null, 2);
    await navigator.clipboard.writeText(pretty);
    setStatus("✓ 已复制格式化后的 JSON 到剪贴板", "ok");
  } catch (err) {
    setStatus(`✗ 复制失败：${err.message}`, "error");
  }
}

function doClear() {
  $input.value = "";
  $search.value = "";
  updateInputMeta();
  showPlaceholder();
  setStatus("");
  chrome.storage?.local?.remove?.(STORAGE_KEY_INPUT);
}

// ---------- search ----------

function clearHits() {
  $output.querySelectorAll(".hit").forEach((el) => el.classList.remove("hit"));
}

function highlightSearch(term) {
  clearHits();
  if (!term) {
    setStatus("");
    return;
  }
  const lower = term.toLowerCase();
  const nodes = $output.querySelectorAll(
    ".key, .string, .number, .boolean, .null"
  );
  let count = 0;
  nodes.forEach((el) => {
    if (el.textContent.toLowerCase().includes(lower)) {
      el.classList.add("hit");
      count++;
    }
  });
  setStatus(
    count ? `找到 ${count} 处匹配` : "无匹配",
    count ? "ok" : "error"
  );
}

// ---------- splitter ----------

function applyRatio(ratio) {
  const clamped = Math.max(0.15, Math.min(0.85, ratio));
  $inputPane.style.flex = `${clamped} 1 0`;
  $outputPane.style.flex = `${1 - clamped} 1 0`;
}

(function setupSplitter() {
  let dragging = false;

  $splitter.addEventListener("mousedown", (e) => {
    dragging = true;
    document.body.classList.add("dragging");
    $splitter.classList.add("dragging");
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = $workspace.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    applyRatio(ratio);
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("dragging");
    $splitter.classList.remove("dragging");
    const rect = $workspace.getBoundingClientRect();
    const leftWidth = $inputPane.getBoundingClientRect().width;
    const ratio = leftWidth / rect.width;
    chrome.storage?.local?.set({ [STORAGE_KEY_RATIO]: ratio });
  });
})();

// ---------- wire up ----------

$btnFormat.addEventListener("click", doFormat);
$btnMinify.addEventListener("click", doMinify);
$btnCopy.addEventListener("click", doCopy);
$btnClear.addEventListener("click", doClear);
$btnExpand.addEventListener("click", () => setAllCollapsed(false));
$btnCollapse.addEventListener("click", () => setAllCollapsed(true));

$input.addEventListener("input", updateInputMeta);

$input.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    doFormat();
  }
});

$search.addEventListener("input", () =>
  highlightSearch($search.value.trim())
);

// ---------- boot ----------

(function boot() {
  showPlaceholder();
  updateInputMeta();
  try {
    chrome.storage?.local?.get?.(
      [STORAGE_KEY_INPUT, STORAGE_KEY_RATIO],
      (res) => {
        if (res?.[STORAGE_KEY_RATIO]) applyRatio(res[STORAGE_KEY_RATIO]);
        const saved = res?.[STORAGE_KEY_INPUT];
        if (saved) {
          $input.value = saved;
          updateInputMeta();
          doFormat();
        }
      }
    );
  } catch {
    /* storage unavailable in dev preview, ignore */
  }
})();
