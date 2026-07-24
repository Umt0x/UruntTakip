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
    // MediaMarkt ürün kartındaki gerçek ürün başlığı.
    // Kupon, kampanya, görsel alt metni veya kartın genel metni kullanılmaz.
    const titleEl = card.querySelector('[data-test="product-title"]');
    const exactTitle = usableName(titleEl?.textContent);
    if (exactTitle) return exactTitle;

    // Site yapısı değişirse yalnızca başlık niteliğindeki metinlere bak.
    // img alt/title ve kart.innerText özellikle kullanılmıyor.
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

  function buildBadge(productName, platform) {
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
      card.appendChild(buildBadge(productName, platform));
    });
  }

  function isProductDetailPage() {
    return /\/product\//i.test(location.pathname);
  }

  function processDetailPage(platform) {
    if (document.getElementById("hb-detail-badge")) return;
    const productName = extractProductNameDetail();
    if (!productName) return;

    const wrap = buildBadge(productName, platform);
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
