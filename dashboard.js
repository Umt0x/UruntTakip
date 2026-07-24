document.addEventListener("DOMContentLoaded", () => {
  const SEARCH_PLATFORM_KEY = "mm-search-platform";
  const AUTO_RESET_KEY = "mm-auto-reset-price-next-month";
  const LASTPRICE_PREFIX = "mm-lastprice-";
  const PRICECHANGE_PREFIX = "mm-pricechange-";

  const statAdded = document.getElementById("statAdded");
  const statPriceChecked = document.getElementById("statPriceChecked");
  const statTracked = document.getElementById("statTracked");
  const statChanged = document.getElementById("statChanged");
  const statUp = document.getElementById("statUp");
  const statDown = document.getElementById("statDown");

  const statusEl = document.getElementById("status");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const resetPriceBtn = document.getElementById("resetPriceBtn");
  const searchPlatform = document.getElementById("searchPlatform");
  const autoResetPrice = document.getElementById("autoResetPrice");
  const fileInput = document.getElementById("fileInput");

  const changeGrid = document.getElementById("changeGrid");
  const clearPriceChangesBtn = document.getElementById("clearPriceChangesBtn");
  const searchBox = document.getElementById("searchBox");
  const filterTabs = document.querySelectorAll(".mm-filter-tab");
  const themeToggle = document.getElementById("themeToggle");
  const THEME_KEY = "mm-theme";

  // Tema: chrome.storage.local kalıcı kaynak, localStorage ise sayfa açılışında
  // ekran "flaşlamasın" diye kullanılan hızlı senkron önbellek.
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    if (themeToggle) themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    try { localStorage.setItem("mm-theme-cache", theme); } catch (e) {}
  }

  chrome.storage.local.get({ [THEME_KEY]: "light" }, (settings) => {
    applyTheme(settings[THEME_KEY]);
  });

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      chrome.storage.local.set({ [THEME_KEY]: next });
    });
  }

  let currentFilter = "all"; // all | up | down
  let currentQuery = "";
  let latestEntries = [];

  function isPriceKey(k) { return k.startsWith("mm-price-") || k.startsWith("mm-price-date-"); }
  function isLastPriceKey(k) { return k.startsWith(LASTPRICE_PREFIX); }
  function isPriceChangeKey(k) { return k.startsWith(PRICECHANGE_PREFIX); }
  function isAddedKey(k) {
    return k.startsWith("mm-") && !isPriceKey(k) && !isLastPriceKey(k) && !isPriceChangeKey(k)
      && k !== SEARCH_PLATFORM_KEY && k !== AUTO_RESET_KEY;
  }

  function formatTRY(value) {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(value);
  }

  function formatDate(ts) {
    if (!ts) return "";
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function refreshStats() {
    chrome.storage.local.get(null, (all) => {
      const added = Object.keys(all).filter((k) => isAddedKey(k) && all[k]).length;
      const priceChecked = Object.keys(all).filter((k) => k.startsWith("mm-price-") && !k.startsWith("mm-price-date-") && all[k]).length;
      const tracked = Object.keys(all).filter(isLastPriceKey).length;
      const changes = Object.keys(all).filter(isPriceChangeKey).map((k) => all[k]).filter(Boolean);
      const up = changes.filter((c) => c.newPrice > c.oldPrice).length;
      const down = changes.filter((c) => c.newPrice < c.oldPrice).length;

      statAdded.textContent = added;
      statPriceChecked.textContent = priceChecked;
      statTracked.textContent = tracked;
      statChanged.textContent = changes.length;
      statUp.textContent = up;
      statDown.textContent = down;
    });
  }

  function applyFiltersAndRender() {
    let entries = latestEntries;

    if (currentFilter === "up") entries = entries.filter((e) => e.data.newPrice > e.data.oldPrice);
    if (currentFilter === "down") entries = entries.filter((e) => e.data.newPrice < e.data.oldPrice);

    if (currentQuery) {
      const q = currentQuery.toLowerCase();
      entries = entries.filter((e) =>
        e.code.toLowerCase().includes(q) ||
        (e.data.productName || "").toLowerCase().includes(q)
      );
    }

    changeGrid.innerHTML = "";

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "mm-empty";
      empty.textContent = latestEntries.length
        ? "Filtreyle eşleşen ürün yok."
        : "Şu an fiyatı değişen \"Eklendi\" ürün yok. Ürünleri MediaMarkt'ta gezerken otomatik taranır.";
      changeGrid.appendChild(empty);
      return;
    }

    entries.forEach(({ key, code, data }) => {
      const up = data.newPrice > data.oldPrice;
      const diff = data.newPrice - data.oldPrice;
      const pct = data.oldPrice ? (diff / data.oldPrice) * 100 : 0;

      const card = document.createElement("div");
      card.className = "mm-card " + (up ? "mm-card-up" : "mm-card-down");
      card.innerHTML =
        '<div class="mm-card-top">' +
          (data.imageUrl
            ? '<img class="mm-card-img" src="' + data.imageUrl + '" alt="">'
            : '<div class="mm-card-img mm-card-noimg">📦</div>') +
          '<div class="mm-card-badge-tag ' + (up ? "mm-tag-up" : "mm-tag-down") + '">' +
            (up ? "▲ ZAM" : "▼ İNDİRİM") +
          '</div>' +
        '</div>' +
        '<div class="mm-card-body">' +
          '<div class="mm-card-name">' + (data.productName ? escapeHtml(data.productName) : "Ürün") + '</div>' +
          '<div class="mm-card-code">No: ' + escapeHtml(code) + '</div>' +
          '<div class="mm-card-prices">' +
            '<span class="mm-card-old">' + formatTRY(data.oldPrice) + '</span>' +
            '<span class="mm-card-arrow">→</span>' +
            '<span class="mm-card-new">' + formatTRY(data.newPrice) + '</span>' +
          '</div>' +
          '<div class="mm-card-delta">' +
            (up ? "+" : "") + formatTRY(diff).replace("₺", "") + " ₺  ·  " + (up ? "+" : "") + pct.toFixed(1) + "%" +
          '</div>' +
          '<div class="mm-card-date">' + formatDate(data.changedAt) + '</div>' +
        '</div>' +
        '<div class="mm-card-actions">' +
          (data.url ? '<a class="mm-card-link" href="' + data.url + '" target="_blank" rel="noopener noreferrer">Ürüne Git ↗</a>' : '<span></span>') +
          '<button class="mm-card-dismiss" data-key="' + key + '">Gördüm ✓</button>' +
        '</div>';

      changeGrid.appendChild(card);
    });

    changeGrid.querySelectorAll(".mm-card-dismiss").forEach((btn) => {
      btn.addEventListener("click", () => {
        chrome.storage.local.remove(btn.dataset.key, () => {
          refreshStats();
          loadPriceChanges();
        });
      });
    });
  }

  function loadPriceChanges() {
    chrome.storage.local.get(null, (all) => {
      latestEntries = Object.keys(all)
        .filter(isPriceChangeKey)
        .map((key) => ({ key, code: key.slice(PRICECHANGE_PREFIX.length), data: all[key] }))
        .filter((e) => e.data && typeof e.data.oldPrice === "number" && typeof e.data.newPrice === "number")
        .sort((a, b) => (b.data.changedAt || 0) - (a.data.changedAt || 0));
      applyFiltersAndRender();
    });
  }

  filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      filterTabs.forEach((t) => t.classList.remove("mm-active"));
      tab.classList.add("mm-active");
      currentFilter = tab.dataset.filter;
      applyFiltersAndRender();
    });
  });

  if (searchBox) {
    searchBox.addEventListener("input", () => {
      currentQuery = searchBox.value.trim();
      applyFiltersAndRender();
    });
  }

  chrome.storage.local.get({ [SEARCH_PLATFORM_KEY]: "hb", [AUTO_RESET_KEY]: false }, (settings) => {
    searchPlatform.value = settings[SEARCH_PLATFORM_KEY] === "ty" ? "ty" : "hb";
    autoResetPrice.checked = !!settings[AUTO_RESET_KEY];
  });
  refreshStats();
  loadPriceChanges();

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
        refreshStats();
      });
    });
  });

  if (clearPriceChangesBtn) {
    clearPriceChangesBtn.addEventListener("click", () => {
      chrome.storage.local.get(null, (all) => {
        const keys = Object.keys(all).filter(isPriceChangeKey);
        if (!keys.length) {
          statusEl.textContent = "ℹ️ Temizlenecek fiyat değişikliği yok.";
          return;
        }
        chrome.storage.local.remove(keys, () => {
          statusEl.textContent = "✅ " + keys.length + " fiyat değişikliği kaydı temizlendi.";
          refreshStats();
          loadPriceChanges();
        });
      });
    });
  }

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
        chrome.storage.local.set(toSet, () => {
          statusEl.textContent = "✅ Geri yükleme tamamlandı (" + keys.length + " kayıt).";
          refreshStats();
          loadPriceChanges();
        });
      } catch (e) { statusEl.textContent = "❌ Dosya okunamadı; geçerli bir yedek dosyası seçin."; }
    };
    reader.readAsText(file); fileInput.value = "";
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (Object.keys(changes).some((k) => isPriceChangeKey(k) || isLastPriceKey(k))) {
      loadPriceChanges();
    }
    if (Object.keys(changes).some((k) => isAddedKey(k) || isPriceKey(k) || isLastPriceKey(k) || isPriceChangeKey(k))) {
      refreshStats();
    }
  });
});
