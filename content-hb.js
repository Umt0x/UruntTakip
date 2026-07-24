(function () {
  const CARD_SELECTOR = '[data-test="mms-product-card"]';
  const SEARCH_PLATFORM_KEY = "mm-search-platform";
  const SEARCH_CONFIG = {
    hb: {
      label: "Hepsiburada'da Ara",
      title: "Hepsiburada",
      url: "https://www.hepsiburada.com/ara?q="
    },
    ty: {
      label: "Trendyol'da Ara",
      title: "Trendyol",
      url: "https://www.trendyol.com/sr?q="
    }
  };

  const COMPARE_SITES = {
    vatan: { label: "Vatan", url: "https://www.vatanbilgisayar.com/arama/arama-sonuclari/?text=" },
    akakce: { label: "Akakçe", url: "https://www.akakce.com/arama/?q=" },
    cimri: { label: "Cimri", url: "https://www.cimri.com/arama?q=" }
  };

  function cleanName(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/\s*[|–—-]\s*MediaMarkt.*$/i, "")
      .trim();
  }

  function isPromoOrPrice(text) {
    const t = cleanName(text);
    if (!t) return true;
    return /(?:₺|\bTL\b|kupon|indirim|kazanç|fırsat|kampanya|sepette|taksit|kargo|teslimat|sponsorlu|karşılaştır|sepete ekle|kdv dahil|mağaza seç|birlikte al)/i.test(t);
  }

  function usableName(text) {
    const t = cleanName(text);
    return t.length >= 4 && t.length <= 220 && !isPromoOrPrice(t) ? t : null;
  }

  function extractProductNameFromCard(card) {
    const titleEl = card.querySelector('[data-test="product-title"]');
    const exactTitle = usableName(titleEl?.textContent);
    if (exactTitle) return exactTitle;

    const fallbackSelectors = [
      'h1', 'h2', 'h3', 'h4',
      '[data-test="mms-product-title"]',
      '[class*="product-name"]',
      '[class*="productName"]'
    ];
    for (const selector of fallbackSelectors) {
      const name = usableName(card.querySelector(selector)?.textContent);
      if (name) return name;
    }
    return null;
  }

  function extractProductNameDetail() {
    const candidates = [
      document.querySelector('[data-test="product-title"]')?.textContent,
      document.querySelector('h1')?.textContent
    ];
    for (const candidate of candidates) {
      const name = usableName(candidate);
      if (name) return name;
    }
    return null;
  }

  function extractMediaMarktPrice(scope) {
    const text = String(scope?.innerText || "");
    const match = text.match(/(?:₺\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*(?:TL|₺|-)/i);
    return match ? match[0].replace(/-$/, "").trim() : null;
  }

  function makeSessionId(productName) {
    let hash = 0;
    for (let i = 0; i < productName.length; i++) hash = ((hash << 5) - hash + productName.charCodeAt(i)) | 0;
    return Math.abs(hash).toString(36) + "-" + Date.now().toString(36);
  }

  function buildComparison(productName, scope) {
    const box = document.createElement("div");
    box.className = "mm-compare-box";
    const btn = document.createElement("button");
    btn.className = "mm-compare-btn";
    btn.type = "button";
    btn.textContent = "📊 Fiyatları Karşılaştır";
    const results = document.createElement("div");
    results.className = "mm-compare-results";
    results.hidden = true;
    box.append(btn, results);

    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const sessionId = makeSessionId(productName);
      results.hidden = false;
      results.innerHTML = '<div class="mm-compare-line"><b>MediaMarkt</b><span>' + (extractMediaMarktPrice(scope) || "Sayfadaki fiyat") + '</span></div>';
      Object.entries(COMPARE_SITES).forEach(([key, site]) => {
        const row = document.createElement("div");
        row.className = "mm-compare-line";
        row.dataset.site = key;
        row.innerHTML = '<b>' + site.label + '</b><span>Aranıyor…</span>';
        results.appendChild(row);
        window.open(site.url + encodeURIComponent(productName) + "#mmcmp=" + encodeURIComponent(sessionId), "_blank");
      });

      const update = () => {
        const keys = Object.keys(COMPARE_SITES).map(k => "mm-compare-" + sessionId + "-" + k);
        chrome.storage.local.get(keys, (data) => {
          Object.keys(COMPARE_SITES).forEach((key) => {
            const row = results.querySelector('[data-site="' + key + '"]');
            const value = data["mm-compare-" + sessionId + "-" + key];
            if (!row || !value) return;
            const text = value.priceText || "Fiyat okunamadı";
            row.innerHTML = '<b>' + COMPARE_SITES[key].label + '</b><a target="_blank" rel="noopener noreferrer" href="' + value.url + '">' + text + '</a>';
          });
        });
      };
      update();
      const poll = setInterval(update, 1200);
      setTimeout(() => clearInterval(poll), 16000);
    });
    return box;
  }

  function buildBadge(productName, platform, scope) {
    const config = SEARCH_CONFIG[platform] || SEARCH_CONFIG.hb;
    const wrap = document.createElement("div");
    wrap.className = "hb-card-badge";

    const btn = document.createElement("button");
    btn.className = "hb-search-btn";
    btn.type = "button";
    btn.title = config.title + " üzerinde yalnızca ürün adını ara: " + productName;
    btn.innerHTML = '🔎 <span class="hb-search-label">' + config.label + "</span>";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open(config.url + encodeURIComponent(productName), "_blank", "noopener,noreferrer");
    });

    wrap.appendChild(btn);
    wrap.appendChild(buildComparison(productName, scope));
    return wrap;
  }

  function clearSearchBadges() {
    document.querySelectorAll(".hb-card-badge").forEach((el) => el.remove());
    document.querySelectorAll("[data-hb-processed]").forEach((el) => delete el.dataset.hbProcessed);
  }

  function processListingCards(platform) {
    document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
      if (card.dataset.hbProcessed) return;
      const productName = extractProductNameFromCard(card);
      if (!productName) return;

      card.dataset.hbProcessed = "1";
      if (getComputedStyle(card).position === "static") card.style.position = "relative";
      card.appendChild(buildBadge(productName, platform, card));
    });
  }

  function isProductDetailPage() {
    return /\/product\//i.test(location.pathname);
  }

  function processDetailPage(platform) {
    if (document.getElementById("hb-detail-badge")) return;
    const productName = extractProductNameDetail();
    if (!productName) return;

    const wrap = buildBadge(productName, platform, document.body);
    wrap.id = "hb-detail-badge";
    wrap.classList.add("hb-detail-fixed");
    document.body.appendChild(wrap);
  }

  function run() {
    chrome.storage.local.get({ [SEARCH_PLATFORM_KEY]: "hb" }, (settings) => {
      const platform = settings[SEARCH_PLATFORM_KEY] === "ty" ? "ty" : "hb";
      if (isProductDetailPage()) processDetailPage(platform);
      else processListingCards(platform);
    });
  }

  run();
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[SEARCH_PLATFORM_KEY]) {
      clearSearchBadges();
      run();
    }
  });

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      clearSearchBadges();
      run();
    }
  }, 800);
})();
