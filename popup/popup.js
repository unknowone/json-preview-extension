"use strict";

const $input = document.getElementById("input");
const $output = document.getElementById("output");
const $status = document.getElementById("status");
const $search = document.getElementById("search");
const $btnFormat = document.getElementById("btn-format");
const $btnMinify = document.getElementById("btn-minify");
const $btnCopy = document.getElementById("btn-copy");
const $btnClear = document.getElementById("btn-clear");

const STORAGE_KEY = "jsonPreview.lastInput";

// ---------- helpers ----------

function setStatus(text, type) {
  $status.textContent = text || "";
  $status.className = "status" + (type ? " " + type : "");
}

function showPlaceholder() {
  $output.innerHTML = '<div class="placeholder">在左侧粘贴 JSON 后点击「格式化」或按 Ctrl+Enter</div>';
}

/**
 * Tolerant JSON parser:
 * 1. JSON.parse
 * 2. Try trimming stray wrappers / trailing commas
 * 3. Fall back to `new Function` eval for JS-object-like input (safe-ish, in popup scope)
 */
function tryParse(raw) {
  const text = raw.trim();
  if (!text) throw new Error("输入为空");

  try {
    return JSON.parse(text);
  } catch (e1) {
    // Try to repair: trailing commas, single quotes, unquoted keys
    const repaired = text
      .replace(/,\s*([}\]])/g, "$1") // trailing commas
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":') // unquoted keys
      .replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, (_, s) => JSON.stringify(s));
    try {
      return JSON.parse(repaired);
    } catch (e2) {
      throw e1; // surface the original, clearer error
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

  const toggle = createEl("span", keys.length ? "toggle" : "toggle empty", keys.length ? "▾" : " ");
  container.appendChild(toggle);
  container.appendChild(createEl("span", "punc", "{"));

  if (keys.length === 0) {
    container.appendChild(createEl("span", "punc", "}"));
    return container;
  }

  const summary = createEl("span", "summary", `… ${keys.length} keys`);
  container.appendChild(summary);

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
  const toggle = createEl("span", arr.length ? "toggle" : "toggle empty", arr.length ? "▾" : " ");
  container.appendChild(toggle);
  container.appendChild(createEl("span", "punc", "["));

  if (arr.length === 0) {
    container.appendChild(createEl("span", "punc", "]"));
    return container;
  }

  const summary = createEl("span", "summary", `… ${arr.length} items`);
  container.appendChild(summary);

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

// ---------- actions ----------

function doFormat() {
  const raw = $input.value;
  try {
    const value = tryParse(raw);
    render(value);
    const size = new Blob([raw]).size;
    setStatus(`解析成功 · ${size} B`, "ok");
    chrome.storage?.local?.set({ [STORAGE_KEY]: raw });
  } catch (err) {
    $output.innerHTML = "";
    setStatus(`解析失败：${err.message}`, "error");
  }
}

function doMinify() {
  const raw = $input.value;
  try {
    const value = tryParse(raw);
    const min = JSON.stringify(value);
    $input.value = min;
    render(value);
    setStatus(`已压缩 · ${min.length} 字符`, "ok");
  } catch (err) {
    setStatus(`压缩失败：${err.message}`, "error");
  }
}

async function doCopy() {
  const raw = $input.value;
  try {
    const value = tryParse(raw);
    const pretty = JSON.stringify(value, null, 2);
    await navigator.clipboard.writeText(pretty);
    setStatus("已复制格式化后的 JSON", "ok");
  } catch (err) {
    setStatus(`复制失败：${err.message}`, "error");
  }
}

function doClear() {
  $input.value = "";
  $search.value = "";
  showPlaceholder();
  setStatus("");
  chrome.storage?.local?.remove?.(STORAGE_KEY);
}

// ---------- search ----------

function clearHits(root) {
  root.querySelectorAll(".hit").forEach((el) => el.classList.remove("hit"));
}

function highlightSearch(term) {
  clearHits($output);
  if (!term) return;
  const lower = term.toLowerCase();
  const nodes = $output.querySelectorAll(".key, .string, .number, .boolean, .null");
  let count = 0;
  nodes.forEach((el) => {
    if (el.textContent.toLowerCase().includes(lower)) {
      el.classList.add("hit");
      count++;
    }
  });
  setStatus(count ? `匹配 ${count} 处` : "无匹配", count ? "ok" : "error");
}

// ---------- wire up ----------

$btnFormat.addEventListener("click", doFormat);
$btnMinify.addEventListener("click", doMinify);
$btnCopy.addEventListener("click", doCopy);
$btnClear.addEventListener("click", doClear);

$input.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    doFormat();
  }
});

$search.addEventListener("input", () => highlightSearch($search.value.trim()));

// restore last input
(function boot() {
  showPlaceholder();
  try {
    chrome.storage?.local?.get?.([STORAGE_KEY], (res) => {
      const saved = res && res[STORAGE_KEY];
      if (saved) {
        $input.value = saved;
        doFormat();
      }
    });
  } catch {
    /* no storage in dev preview, ignore */
  }
})();
