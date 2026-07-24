// Eklenti ikonuna tıklanınca popup yerine tam sayfa "dashboard" sekmesi açılır.
// Sayfa zaten açıksa yeni sekme açmak yerine mevcut sekmeye odaklanır.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("dashboard.html");

  const tabs = await chrome.tabs.query({ url });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    return;
  }

  await chrome.tabs.create({ url });
});
