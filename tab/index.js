"use strict";

// ---------- DOM refs ----------

const $input       = document.getElementById("input");
const $output      = document.getElementById("output");
const $status      = document.getElementById("status");
const $search      = document.getElementById("search");
const $inputMeta   = document.getElementById("input-meta");
const $editorTitle = document.getElementById("editor-title");
const $sidebar     = document.getElementById("sidebar");
const $fileList    = document.getElementById("file-list");
const $splitter1   = document.getElementById("splitter1");
const $splitter2   = document.getElementById("splitter2");
const $workspace   = document.querySelector(".workspace");
const $editorPane  = document.querySelector(".editor-pane");
const $previewPane = document.querySelector(".preview-pane");

const $btnNewJson    = document.getElementById("btn-new-json");
const $btnNewMd      = document.getElementById("btn-new-md");
const $btnOpen       = document.getElementById("btn-open");
const $btnSave       = document.getElementById("btn-save");
const $btnFormat     = document.getElementById("btn-format");
const $btnMinify     = document.getElementById("btn-minify");
const $btnCopy       = document.getElementById("btn-copy");
const $btnExpand     = document.getElementById("btn-expand");
const $btnCollapse   = document.getElementById("btn-collapse");
const $btnToggleSidebar = document.getElementById("btn-toggle-sidebar");

// ---------- state ----------

const STORAGE_KEY_FILES  = "jsonPreview.files";
const STORAGE_KEY_ACTIVE = "jsonPreview.activeFile";

let files = [];       // { id, name, type, content, handle }
let activeFileId = null;
let debounceTimer = null;

// ---------- helpers ----------

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function setStatus(text, type) {
  $status.textContent = text || "";
  $status.className = "status" + (type ? " " + type : "");
}

function updateInputMeta() {
  const len = $input.value.length;
  const bytes = new Blob([$input.value]).size;
  $inputMeta.textContent = len ? `${len} 字符 · ${bytes} B` : "";
}

function getActiveFile() {
  return files.find((f) => f.id === activeFileId) || null;
}

function fileIcon(type) {
  return type === "md" ? "📝" : "📄";
}

// ---------- persistence ----------

function saveState() {
  try {
    const serializable = files.map(({ id, name, type, content }) => ({
      id, name, type, content,
    }));
    chrome.storage?.local?.set?.({
      [STORAGE_KEY_FILES]: serializable,
      [STORAGE_KEY_ACTIVE]: activeFileId,
    });
  } catch { /* ignore */ }
}

function loadState(callback) {
  try {
    chrome.storage?.local?.get?.([STORAGE_KEY_FILES, STORAGE_KEY_ACTIVE], (res) => {
      const saved = res?.[STORAGE_KEY_FILES];
      if (Array.isArray(saved) && saved.length) {
        files = saved.map((f) => ({ ...f, handle: null }));
        activeFileId = res?.[STORAGE_KEY_ACTIVE] || files[0].id;
      }
      callback();
    });
  } catch {
    callback();
  }
}

// ---------- sidebar render ----------

function renderSidebar() {
  $fileList.innerHTML = "";
  files.forEach((f) => {
    const li = document.createElement("li");
    li.className = "file-item" + (f.id === activeFileId ? " active" : "");
    li.dataset.id = f.id;

    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = fileIcon(f.type);

    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = f.name;
    name.title = f.name;

    const del = document.createElement("button");
    del.className = "file-delete";
    del.textContent = "×";
    del.title = "删除";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteFile(f.id);
    });

    li.appendChild(icon);
    li.appendChild(name);
    li.appendChild(del);

    li.addEventListener("click", () => switchFile(f.id));
    // double click to rename
    name.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startRename(f.id, name);
    });

    $fileList.appendChild(li);
  });
}

function startRename(id, el) {
  const file = files.find((f) => f.id === id);
  if (!file) return;
  const input = document.createElement("input");
  input.type = "text";
  input.value = file.name;
  input.style.cssText = "width:100%;font-size:12px;padding:1px 3px;background:var(--bg);color:var(--fg);border:1px solid var(--accent);border-radius:3px;outline:none;";
  el.replaceWith(input);
  input.focus();
  input.select();

  const finish = () => {
    const v = input.value.trim();
    if (v) file.name = v;
    saveState();
    renderSidebar();
    updateEditorTitle();
  };
  input.addEventListener("blur", finish);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    if (e.key === "Escape") { input.value = file.name; input.blur(); }
  });
}

// ---------- file operations ----------

function createFile(type) {
  const count = files.filter((f) => f.type === type).length + 1;
  const ext = type === "md" ? ".md" : ".json";
  const name = `untitled-${count}${ext}`;
  const content = type === "md" ? `# ${name}\n\n` : "{\n  \n}";
  const file = { id: uid(), name, type, content, handle: null };
  files.push(file);
  switchFile(file.id);
  saveState();
}

function deleteFile(id) {
  if (files.length <= 1) {
    setStatus("至少保留一个文件", "error");
    return;
  }
  if (!confirm("确定删除此文件？")) return;
  files = files.filter((f) => f.id !== id);
  if (activeFileId === id) {
    activeFileId = files[0].id;
  }
  renderSidebar();
  loadActiveFile();
  saveState();
}

function switchFile(id) {
  // save current content before switching
  const current = getActiveFile();
  if (current) {
    current.content = $input.value;
  }
  activeFileId = id;
  renderSidebar();
  loadActiveFile();
  saveState();
}

function loadActiveFile() {
  const file = getActiveFile();
  if (!file) return;
  $input.value = file.content;
  updateInputMeta();
  updateEditorTitle();
  updatePreview();
}

function updateEditorTitle() {
  const file = getActiveFile();
  $editorTitle.textContent = file ? file.name : "编辑器";
}

// ---------- File System Access API ----------

async function openFile() {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: "JSON / Markdown",
          accept: {
            "application/json": [".json"],
            "text/markdown": [".md"],
            "text/plain": [".txt", ".md", ".json"],
          },
        },
      ],
      multiple: false,
    });
    const file = await handle.getFile();
    const content = await file.text();
    const name = file.name;
    const type = name.endsWith(".md") ? "md" : "json";

    // check if already open
    const existing = files.find((f) => f.name === name);
    if (existing) {
      existing.content = content;
      existing.handle = handle;
      switchFile(existing.id);
    } else {
      const newFile = { id: uid(), name, type, content, handle };
      files.push(newFile);
      switchFile(newFile.id);
    }
    saveState();
    setStatus(`已打开 ${name}`, "ok");
  } catch (err) {
    if (err.name !== "AbortError") {
      setStatus(`打开失败：${err.message}`, "error");
    }
  }
}

async function saveFile() {
  const file = getActiveFile();
  if (!file) return;

  // sync content
  file.content = $input.value;

  try {
    if (!file.handle) {
      const ext = file.type === "md" ? ".md" : ".json";
      file.handle = await window.showSaveFilePicker({
        suggestedName: file.name,
        types: [
          {
            description: file.type === "md" ? "Markdown" : "JSON",
            accept: file.type === "md"
              ? { "text/markdown": [".md"] }
              : { "application/json": [".json"] },
          },
        ],
      });
      // update name from handle
      const handleFile = await file.handle.getFile();
      file.name = handleFile.name;
    }

    const writable = await file.handle.createWritable();
    await writable.write(file.content);
    await writable.close();

    renderSidebar();
    updateEditorTitle();
    saveState();
    setStatus(`已保存 ${file.name}`, "ok");
  } catch (err) {
    if (err.name !== "AbortError") {
      setStatus(`保存失败：${err.message}`, "error");
    }
  }
}

// ---------- preview ----------

function updatePreview() {
  const file = getActiveFile();
  if (!file) {
    $output.innerHTML = '<div class="placeholder">无文件</div>';
    $output.className = "output";
    return;
  }

  if (file.type === "md") {
    renderMarkdown(file.content);
  } else {
    renderJson(file.content);
  }
}

function renderMarkdown(content) {
  $output.className = "output markdown-preview";
  if (!content.trim()) {
    $output.innerHTML = '<div class="placeholder">开始输入 Markdown 内容...</div>';
    return;
  }
  try {
    $output.innerHTML = marked.parse(content, { breaks: true, gfm: true });
  } catch (err) {
    $output.innerHTML = `<div class="placeholder">渲染出错: ${err.message}</div>`;
  }
}

function renderJson(content) {
  $output.className = "output";
  if (!content.trim()) {
    $output.innerHTML = '<div class="placeholder">输入 JSON 后按 Ctrl/⌘ + Enter 格式化</div>';
    return;
  }
  try {
    const value = tryParse(content);
    renderTree(value);
    setStatus(`✓ JSON 解析成功 · ${JSON.stringify(value).length} 字符`, "ok");
  } catch (err) {
    $output.innerHTML = `<div class="placeholder">JSON 解析错误: ${err.message}</div>`;
    setStatus(`✗ ${err.message}`, "error");
  }
}

// ---------- JSON parsing ----------

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

// ---------- JSON tree render ----------

function createEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function renderTree(value) {
  $output.innerHTML = "";
  const tree = createEl("div", "tree");
  tree.appendChild(renderValue(value));
  $output.appendChild(tree);
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
  const toggle = createEl("span", arr.length ? "toggle" : "toggle empty", arr.length ? "▾" : " ");
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

// ---------- toolbar actions ----------

function doFormat() {
  const file = getActiveFile();
  if (!file || file.type !== "json") return;
  try {
    const value = tryParse($input.value);
    const pretty = JSON.stringify(value, null, 2);
    $input.value = pretty;
    file.content = pretty;
    updateInputMeta();
    renderJson(pretty);
    saveState();
  } catch (err) {
    setStatus(`✗ 格式化失败：${err.message}`, "error");
  }
}

function doMinify() {
  const file = getActiveFile();
  if (!file || file.type !== "json") return;
  try {
    const value = tryParse($input.value);
    const min = JSON.stringify(value);
    $input.value = min;
    file.content = min;
    updateInputMeta();
    renderJson(min);
    setStatus(`✓ 已压缩 · ${min.length} 字符`, "ok");
    saveState();
  } catch (err) {
    setStatus(`✗ 压缩失败：${err.message}`, "error");
  }
}

async function doCopy() {
  try {
    const text = $input.value;
    const file = getActiveFile();
    let result = text;
    if (file && file.type === "json") {
      try {
        result = JSON.stringify(tryParse(text), null, 2);
      } catch { result = text; }
    }
    await navigator.clipboard.writeText(result);
    setStatus("✓ 已复制到剪贴板", "ok");
  } catch (err) {
    setStatus(`✗ 复制失败：${err.message}`, "error");
  }
}

// ---------- search ----------

function clearHits() {
  $output.querySelectorAll(".hit").forEach((el) => el.classList.remove("hit"));
}

function highlightSearch(term) {
  clearHits();
  if (!term) { setStatus(""); return; }
  const lower = term.toLowerCase();
  const nodes = $output.querySelectorAll(".key, .string, .number, .boolean, .null");
  let count = 0;
  nodes.forEach((el) => {
    if (el.textContent.toLowerCase().includes(lower)) {
      el.classList.add("hit");
      count++;
    }
  });
  setStatus(count ? `找到 ${count} 处匹配` : "无匹配", count ? "ok" : "error");
}

// ---------- splitter ----------

function setupSplitter(splitterEl, leftEl, rightEl, storageKey) {
  let dragging = false;

  splitterEl.addEventListener("mousedown", (e) => {
    dragging = true;
    document.body.classList.add("dragging");
    splitterEl.classList.add("dragging");
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const leftRect = leftEl.getBoundingClientRect();
    const rightRect = rightEl.getBoundingClientRect();
    const total = leftRect.width + rightRect.width;
    const offset = e.clientX - leftRect.left;
    const ratio = Math.max(0.15, Math.min(0.85, offset / total));
    leftEl.style.flex = `${ratio} 1 0`;
    rightEl.style.flex = `${1 - ratio} 1 0`;
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("dragging");
    splitterEl.classList.remove("dragging");
  });
}

setupSplitter($splitter2, $editorPane, $previewPane, "split2");

// ---------- sidebar toggle ----------

$btnToggleSidebar.addEventListener("click", () => {
  $sidebar.classList.toggle("collapsed");
  $btnToggleSidebar.textContent = $sidebar.classList.contains("collapsed") ? "▶" : "◀";
});

// ---------- wire up ----------

$btnNewJson.addEventListener("click", () => createFile("json"));
$btnNewMd.addEventListener("click", () => createFile("md"));
$btnOpen.addEventListener("click", openFile);
$btnSave.addEventListener("click", saveFile);
$btnFormat.addEventListener("click", doFormat);
$btnMinify.addEventListener("click", doMinify);
$btnCopy.addEventListener("click", doCopy);
$btnExpand.addEventListener("click", () => setAllCollapsed(false));
$btnCollapse.addEventListener("click", () => setAllCollapsed(true));

$input.addEventListener("input", () => {
  updateInputMeta();
  const file = getActiveFile();
  if (file) file.content = $input.value;

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    updatePreview();
    saveState();
  }, 300);
});

$input.addEventListener("keydown", (e) => {
  // Ctrl/Cmd + Enter → format (JSON only)
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    doFormat();
  }
  // Ctrl/Cmd + S → save
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    saveFile();
  }
});

// global keyboard shortcut for save
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    saveFile();
  }
});

$search.addEventListener("input", () => highlightSearch($search.value.trim()));

// ---------- boot ----------

(function boot() {
  loadState(() => {
    // ensure at least one file
    if (files.length === 0) {
      files.push({
        id: uid(),
        name: "untitled.json",
        type: "json",
        content: "",
        handle: null,
      });
      activeFileId = files[0].id;
    }
    renderSidebar();
    loadActiveFile();
  });
})();
