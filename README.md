# JSON 预览助手 (Chrome 扩展)

一个轻量的 Chrome 浏览器扩展，用于快速粘贴和预览 JSON 文本。

## 功能

- 🎨 语法高亮（key / string / number / boolean / null）
- 🌳 可折叠 / 展开的树形结构
- 🔍 关键字搜索与高亮匹配
- 🧹 一键格式化 / 压缩 / 复制 / 清空
- 💾 自动记住上次输入（使用 `chrome.storage.local`）
- 🩹 容错解析：自动修复尾随逗号、单引号、未加引号的 key
- ⌨️ 快捷键：`Ctrl/⌘ + Enter` 格式化

## 目录结构

```
json-preview-extension/
├── manifest.json            # MV3 清单
├── popup/
│   ├── popup.html           # 弹窗结构
│   ├── popup.css            # 样式（深色主题）
│   └── popup.js             # 解析 + 渲染 + 交互
├── icons/                   # 图标目录（可选，放 16/32/48/128 PNG）
└── README.md
```

## 安装（开发模式）

1. 打开 Chrome，访问 `chrome://extensions/`
2. 右上角开启 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择本项目根目录 `json-preview-extension/`
5. 点击工具栏的扩展图标即可使用

## 添加自定义图标（可选）

将 16×16 / 32×32 / 48×48 / 128×128 的 PNG 放入 `icons/`，
命名为 `icon16.png`、`icon32.png`、`icon48.png`、`icon128.png`，
然后在 `manifest.json` 中加回：

```json
"icons": {
  "16": "icons/icon16.png",
  "32": "icons/icon32.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
},
"action": {
  "default_icon": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

## 使用示例

粘贴：

```
{name:'claude', tags:['json','preview',], ok:true}
```

即使包含单引号、未加引号的 key、尾随逗号，也会被自动修复并渲染为：

```
{
  "name": "claude",
  "tags": ["json", "preview"],
  "ok": true
}
```
