// Open the JSON preview tab when the toolbar icon is clicked.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("tab/index.html");

  // If a preview tab is already open, focus it instead of opening a new one.
  const existing = await chrome.tabs.query({ url });
  if (existing && existing.length > 0) {
    const tab = existing[0];
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url });
});
