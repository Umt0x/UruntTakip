document.addEventListener("DOMContentLoaded", () => {
  const SEARCH_PLATFORM_KEY = "mm-search-platform";
  const AUTO_RESET_KEY = "mm-auto-reset-price-next-month";
  const countEl = document.getElementById("count");
  const statusEl = document.getElementById("status");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const resetPriceBtn = document.getElementById("resetPriceBtn");
  const searchPlatform = document.getElementById("searchPlatform");
  const autoResetPrice = document.getElementById("autoResetPrice");
  const fileInput = document.getElementById("fileInput");

  function isPriceKey(k) { return k.startsWith("mm-price-") || k.startsWith("mm-price-date-"); }
  function isAddedKey(k) { return k.startsWith("mm-") && !isPriceKey(k) && k !== SEARCH_PLATFORM_KEY && k !== AUTO_RESET_KEY; }

  function refreshCount() {
    chrome.storage.local.get(null, (all) => {
      const added = Object.keys(all).filter((k) => isAddedKey(k) && all[k]).length;
      const price = Object.keys(all).filter((k) => k.startsWith("mm-price-") && !k.startsWith("mm-price-date-") && all[k]).length;
      countEl.textContent = "Eklendi: " + added + "  •  Fiyat kontrolü: " + price;
    });
  }

  chrome.storage.local.get({ [SEARCH_PLATFORM_KEY]: "hb", [AUTO_RESET_KEY]: false }, (settings) => {
    searchPlatform.value = settings[SEARCH_PLATFORM_KEY] === "ty" ? "ty" : "hb";
    autoResetPrice.checked = !!settings[AUTO_RESET_KEY];
  });
  refreshCount();

  searchPlatform.addEventListener("change", () => {
    chrome.storage.local.set({ [SEARCH_PLATFORM_KEY]: searchPlatform.value }, () => {
      statusEl.textContent = "✅ Arama platformu kaydedildi.";
    });
  });

  autoResetPrice.addEventListener("change", () => {
    chrome.storage.local.set({ [AUTO_RESET_KEY]: autoResetPrice.checked }, () => {
      statusEl.textContent = autoResetPrice.checked
        ? "✅ Aylık otomatik fiyat kontrolü sıfırlama açıldı."
        : "✅ Aylık otomatik sıfırlama kapatıldı.";
    });
  });

  resetPriceBtn.addEventListener("click", () => {
    chrome.storage.local.get(null, (all) => {
      const priceKeys = Object.keys(all).filter(isPriceKey);
      if (!priceKeys.length) {
        statusEl.textContent = "ℹ️ Sıfırlanacak fiyat kontrolü kaydı yok.";
        return;
      }
      chrome.storage.local.remove(priceKeys, () => {
        statusEl.textContent = "✅ " + priceKeys.filter((k) => !k.startsWith("mm-price-date-")).length + " fiyat kontrolü sıfırlandı. Eklendi kayıtları korundu.";
        refreshCount();
      });
    });
  });

  exportBtn.addEventListener("click", () => {
    chrome.storage.local.get(null, (all) => {
      const data = {};
      Object.keys(all).forEach((k) => { if (k.startsWith("mm-")) data[k] = all[k]; });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mediamarkt-takip-yedek-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      statusEl.textContent = "✅ Yedek indirildi (" + Object.keys(data).length + " kayıt).";
    });
  });

  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const keys = Object.keys(data).filter((k) => k.startsWith("mm-"));
        if (!keys.length) { statusEl.textContent = "⚠️ Dosyada geçerli kayıt bulunamadı."; return; }
        const toSet = {}; keys.forEach((k) => (toSet[k] = data[k]));
        chrome.storage.local.set(toSet, () => { statusEl.textContent = "✅ Geri yükleme tamamlandı (" + keys.length + " kayıt)."; refreshCount(); });
      } catch (e) { statusEl.textContent = "❌ Dosya okunamadı; geçerli bir yedek dosyası seçin."; }
    };
    reader.readAsText(file); fileInput.value = "";
  });
});
