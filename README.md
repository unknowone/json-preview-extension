# JSON 预览助手 (Chrome 扩展)

一个轻量的 Chrome 浏览器扩展：点击图标打开**新标签页**，**左侧**粘贴原文本，**右侧**显示格式化 / 高亮 / 折叠后的预览结果。

## 截图布局

```
┌────────────────────────────────────────────────────────────────────┐
│ { }  JSON 预览助手      [格式化][压缩][复制][全部展开][全部折叠][清空] │
├───────────────────────────────┬────────────────────────────────────┤
│ 原文本               128 字符 │ 预览结果      [ 🔍 搜索 key/value ] │
├───────────────────────────────┼────────────────────────────────────┤
│                               │ ▾ {                                │
│ {"name":"claude",             │     "name": "claude",              │
│  "tags":["json","preview"],   │   ▾ "tags": [                      │
│  "ok":true}                   │       "json",                      │
│                               │       "preview"                    │
│                               │     ],                             │
│                               │     "ok": true                     │
│                               │   }                                │
├───────────────────────────────┴────────────────────────────────────┤
│ ✓ 解析成功 · 压缩后 52 字符                                           │
└────────────────────────────────────────────────────────────────────┘
         ↑ 中间竖条可拖动调整左右比例，比例会被记住
```

## 功能

- 🪟 **新标签页**布局，空间充足，不受 popup 大小限制
- 📐 **左右分栏**：左输入 / 右预览，中间竖线可拖动调整比例（记忆）
- 🎨 语法高亮（key / string / number / boolean / null）
- 🌳 可折叠 / 展开的树形结构，支持「全部展开 / 全部折叠」
- 🔍 关键字搜索，实时高亮所有匹配
- 🧰 工具栏：格式化 / 压缩 / 复制 / 清空
- 💾 自动记住上次输入与分栏比例（`chrome.storage.local`）
- 🩹 **容错解析**：自动修复尾随逗号、单引号、未加引号的 key
- ⌨️ 快捷键：`Ctrl / ⌘ + Enter` 格式化

## 目录结构

```
json-preview-extension/
├── manifest.json        # MV3 清单
├── background.js        # service worker：点击图标 → 打开 tab
├── tab/
│   ├── index.html       # 左右分栏页面
│   ├── index.css        # 深色主题样式
│   └── index.js         # 解析 + 渲染 + 交互 + 拖动分栏
├── icons/               # 可选图标目录
└── README.md
```

## 安装（开发模式）

1. 打开 Chrome，访问 `chrome://extensions/`
2. 右上角开启 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择本项目根目录 `json-preview-extension/`
5. 点击工具栏的扩展图标，会在新 tab 中打开 JSON 预览页面

## 工作原理

- `manifest.json` 的 `action` 没有配置 `default_popup`，只有 `default_title`
- 点击图标会触发 `background.js` 的 `chrome.action.onClicked` 事件
- service worker 打开 `tab/index.html` 作为一个扩展页面新标签
- 如果已有预览 tab 打开，则聚焦过去而不是重复开新 tab

## 使用示例

即使粘贴了下面这种"看起来像 JSON 但不合法"的文本：

```
{name:'claude', tags:['json','preview',], ok:true}
```

也会被自动修复并渲染为：

```
{
  "name": "claude",
  "tags": ["json", "preview"],
  "ok": true
}
```

## 添加自定义图标（可选）

将 16 / 32 / 48 / 128 的 PNG 放入 `icons/`，命名为
`icon16.png` / `icon32.png` / `icon48.png` / `icon128.png`，
然后在 `manifest.json` 中追加：

```json
"icons": {
  "16": "icons/icon16.png",
  "32": "icons/icon32.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
},
"action": {
  "default_title": "打开 JSON 预览",
  "default_icon": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```
