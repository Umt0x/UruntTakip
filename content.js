(function () {
  const STORAGE_PREFIX = "mm-";
  const AUTO_RESET_KEY = "mm-auto-reset-price-next-month";
  const LASTPRICE_PREFIX = "mm-lastprice-";
  const PRICECHANGE_PREFIX = "mm-pricechange-";

  // MediaMarkt'ta gerçek ürün kartı seçicisi (DevTools'tan doğrulandı)
  const CARD_SELECTOR = '[data-test="mms-product-card"]';

  // Ürün linkinden (href) ürün numarasını/kodunu çıkarmaya çalışır
  function extractProductCode(href) {
    try {
      const path = new URL(href, location.origin).pathname;
      let fileName = path.substring(path.lastIndexOf("/") + 1).replace(/\.html?$/i, "");
      fileName = fileName.replace(/^_+/, "");
      const tokens = fileName.split(/[-_]/).filter(Boolean);
      for (let i = tokens.length - 1; i >= 0; i--) {
        if (/\d/.test(tokens[i]) && tokens[i].length >= 4) return tokens[i].toUpperCase();
      }
      return tokens.length ? tokens[tokens.length - 1].toUpperCase() : fileName.toUpperCase();
    } catch (e) {
      return null;
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }

  function parseTurkishPrice(text) {
    if (!text) return null;
    const cleaned = String(text)
      .replace(/\u00a0/g, " ")
      .replace(/TL/gi, "")
      .replace(/₺/g, "")
      .replace(/\s/g, "")
      .replace(/,-$/, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".")
      .replace(/[^\d.]/g, "");
    const value = Number.parseFloat(cleaned);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function formatTRY(value) {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  function calculateTargetPrice(price) {
    if (!Number.isFinite(price) || price < 1000) return null;
    if (price < 5000) return { multiplier: 2, result: price * 2 };
    if (price <= 10000) return { multiplier: 1.8, result: price * 1.8 };
    return { multiplier: 1.5, result: price * 1.5 };
  }

  function extractVisiblePrice(root) {
    if (!root) return null;

    const preferredSelectors = [
      '[data-test*="price"]',
      '[class*="price"]',
      '[class*="Price"]',
      'span'
    ];

    const candidates = [];
    preferredSelectors.forEach((selector, priority) => {
      root.querySelectorAll(selector).forEach((el) => {
        const text = (el.textContent || "").trim();
        if (!/[₺]|\bTL\b/i.test(text)) return;
        if (el.offsetParent === null) return;
        const price = parseTurkishPrice(text);
        if (!price) return;
        candidates.push({ price, priority, length: text.length });
      });
    });

    if (!candidates.length) return null;
    candidates.sort((a, b) => a.priority - b.priority || a.length - b.length);
    return candidates[0].price;
  }

  // Ürün adını rozet üzerinde kullanmak ve fiyat değişikliği kaydında göstermek için
  function extractProductNameSimple(root) {
    if (!root) return null;
    const el =
      root.querySelector('[data-test="product-title"]') ||
      root.querySelector('[data-test="mms-product-title"]') ||
      root.querySelector('h1') ||
      root.querySelector('h2') ||
      root.querySelector('h3');
    const text = (el?.textContent || "").replace(/\s+/g, " ").trim();
    return text && text.length >= 4 && text.length <= 220 ? text : null;
  }

  // Ürün görselini rozet altındaki fiyat değişikliği kaydında kullanmak için
  function extractProductImage(root) {
    if (!root) return null;
    const img = root.querySelector("img[src]");
    if (!img) return null;
    return img.currentSrc || img.src || null;
  }

  function buildCalculationTable(price) {
    const box = document.createElement("div");
    box.className = "mm-calculation-box";

    const calc = calculateTargetPrice(price);
    if (!price) {
      box.innerHTML = '<div class="mm-calc-title">Hesaplama</div><div class="mm-calc-empty">Fiyat okunamadı</div>';
      return box;
    }
    if (!calc) {
      box.innerHTML = '<div class="mm-calc-title">Hesaplama</div>' +
        '<div class="mm-calc-row"><span>Ürün fiyatı</span><strong>' + formatTRY(price) + '</strong></div>' +
        '<div class="mm-calc-empty">1.000 TL altı için kural yok</div>';
      return box;
    }

    box.innerHTML =
      '<div class="mm-calc-title">Hesaplama</div>' +
      '<div class="mm-calc-row"><span>Ürün fiyatı</span><strong>' + formatTRY(price) + '</strong></div>' +
      '<div class="mm-calc-row"><span>Çarpan</span><strong>× ' + String(calc.multiplier).replace(".", ",") + '</strong></div>' +
      '<div class="mm-calc-row mm-calc-result"><span>Hesaplanan</span><strong>' + formatTRY(calc.result) + '</strong></div>';
    return box;
  }

  function copyToClipboard(text, feedbackEl) {
    const done = () => {
      if (!feedbackEl) return;
      const old = feedbackEl.textContent;
      feedbackEl.textContent = "Kopyalandı!";
      setTimeout(() => (feedbackEl.textContent = old), 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function monthStamp(date = new Date()) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  }

  // Bağımsız bir aç/kapa butonu üretir. Fiyat kontrolünde ay bilgisi de tutulur.
  function createToggleButton(key, trueLabel, falseLabel, activeClass, options = {}) {
    const btn = document.createElement("button");
    btn.className = "mm-toggle-btn " + activeClass + "-btn";

    function setVisual(val) {
      btn.textContent = val ? trueLabel : falseLabel;
      btn.classList.toggle(activeClass, val);
    }

    const dateKey = options.dateKey;
    const keysToRead = dateKey ? [key, dateKey, AUTO_RESET_KEY] : [key];
    chrome.storage.local.get(keysToRead, (result) => {
      if (dateKey && result[key] && result[AUTO_RESET_KEY] && result[dateKey] && result[dateKey] !== monthStamp()) {
        chrome.storage.local.remove([key, dateKey], () => setVisual(false));
        return;
      }
      setVisual(!!result[key]);
    });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.storage.local.get([key], (result) => {
        const newVal = !result[key];
        if (dateKey) {
          if (newVal) {
            chrome.storage.local.set({ [key]: true, [dateKey]: monthStamp() }, () => setVisual(true));
          } else {
            chrome.storage.local.remove([key, dateKey], () => setVisual(false));
          }
        } else {
          chrome.storage.local.set({ [key]: newVal }, () => setVisual(newVal));
        }
      });
    });

    return btn;
  }

  // Bir ürünün fiyatını, yalnızca "Eklendi" işaretliyse önceki kayıtlı fiyatla karşılaştırır.
  // Fark varsa mm-pricechange-<kod> kaydını oluşturur/günceller ve popup bunu okuyup gösterir.
  function trackPriceChange(productCode, currentPrice, meta) {
    if (!productCode || !currentPrice) return;

    const addedKey = STORAGE_PREFIX + productCode;
    const lastPriceKey = LASTPRICE_PREFIX + productCode;
    const changeKey = PRICECHANGE_PREFIX + productCode;

    chrome.storage.local.get([addedKey, lastPriceKey], (result) => {
      // Yalnızca "Eklendi" işaretli ürünlerde çalışsın; binlerce diğer ürün için hiç iz bırakmasın.
      if (!result[addedKey]) return;

      const prev = result[lastPriceKey];

      if (!prev || typeof prev.price !== "number") {
        // İlk kez görülüyor: referans (baseline) fiyat olarak kaydet, henüz değişiklik sayılmaz.
        chrome.storage.local.set({
          [lastPriceKey]: {
            price: currentPrice,
            productName: meta.productName || null,
            imageUrl: meta.imageUrl || null,
            url: meta.url || null,
            checkedAt: Date.now()
          }
        });
        return;
      }

      if (Math.abs(prev.price - currentPrice) < 0.01) {
        return; // fiyat aynı, yapılacak bir şey yok
      }

      // Fiyat değişti: hem değişiklik kaydını hem yeni referans fiyatı güncelle
      chrome.storage.local.set({
        [changeKey]: {
          oldPrice: prev.price,
          newPrice: currentPrice,
          productName: meta.productName || prev.productName || null,
          imageUrl: meta.imageUrl || prev.imageUrl || null,
          url: meta.url || prev.url || null,
          changedAt: Date.now()
        },
        [lastPriceKey]: {
          price: currentPrice,
          productName: meta.productName || prev.productName || null,
          imageUrl: meta.imageUrl || prev.imageUrl || null,
          url: meta.url || prev.url || null,
          checkedAt: Date.now()
        }
      });
    });
  }

  function buildBadge(productCode, priceRoot) {
    const wrap = document.createElement("div");
    wrap.className = "mm-card-badge";

    // Eklendi / Eklenmedi (eski anahtar formatı korunuyor, geçmiş kayıtlar bozulmasın diye)
    const addedKey = STORAGE_PREFIX + productCode;
    const addedBtn = createToggleButton(addedKey, "Eklendi", "Eklenmedi", "mm-added");
    wrap.appendChild(addedBtn);

    // Fiyat Kontrolü Yapıldı / Yapılmadı
    const priceKey = STORAGE_PREFIX + "price-" + productCode;
    const priceDateKey = STORAGE_PREFIX + "price-date-" + productCode;
    const priceBtn = createToggleButton(priceKey, "Fiyat Kontrol ✓", "Fiyat Kontrolü Yok", "mm-price-checked", { dateKey: priceDateKey });
    wrap.appendChild(priceBtn);

    if (productCode) {
      const codeRow = document.createElement("div");
      codeRow.className = "mm-code-row";

      const codeText = document.createElement("span");
      codeText.className = "mm-code-text";
      codeText.textContent = "No: " + productCode;
      codeRow.appendChild(codeText);

      const copyBtn = document.createElement("button");
      copyBtn.className = "mm-copy-btn";
      copyBtn.title = "Ürün numarasını kopyala";
      copyBtn.textContent = "📋";
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        copyToClipboard(productCode, codeText);
      });
      codeRow.appendChild(copyBtn);
      wrap.appendChild(codeRow);

      // Ürün numarasının hemen altında fiyat hesaplama tablosu
      const currentPrice = extractVisiblePrice(priceRoot || document);
      wrap.appendChild(buildCalculationTable(currentPrice));

      // Yalnızca "Eklendi" işaretli ürünlerde fiyat zam/indirim takibi
      trackPriceChange(productCode, currentPrice, {
        productName: extractProductNameSimple(priceRoot || document),
        imageUrl: extractProductImage(priceRoot || document),
        url: location.href.split("#")[0]
      });
    }

    return wrap;
  }

  function processListingCards() {
    const cards = document.querySelectorAll(CARD_SELECTOR);
    cards.forEach((card) => {
      if (card.dataset.mmProcessed) return;

      const anchor = card.querySelector('a[href*="/product/"]') || card.querySelector("a[href]");
      if (!anchor) return;

      const productCode = extractProductCode(anchor.href);
      if (!productCode) return;

      card.dataset.mmProcessed = "1";
      const style = getComputedStyle(card);
      if (style.position === "static") {
        card.style.position = "relative";
      }

      card.appendChild(buildBadge(productCode, card));
    });
  }

  function isProductDetailPage() {
    return /\/product\//i.test(location.pathname);
  }

  function processDetailPage() {
    if (document.getElementById("mm-detail-badge")) return;
    const productCode = extractProductCode(location.href) || location.pathname;

    const wrap = buildBadge(productCode, document);
    wrap.id = "mm-detail-badge";
    wrap.classList.add("mm-detail-fixed");
    document.body.appendChild(wrap);
  }

  function run() {
    if (isProductDetailPage()) {
      processDetailPage();
    } else {
      processListingCards();
    }
  }

  run();

  // Sayfaya sonradan yüklenen (lazy-load / sonsuz kaydırma) ürün kartlarını da yakala
  const observer = new MutationObserver(() => run());
  observer.observe(document.body, { childList: true, subtree: true });

  // SPA içi URL değişimlerinde (kategori değişimi, filtre vb.) yeniden tara
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      document.querySelectorAll("[data-mm-processed]").forEach((el) => delete el.dataset.mmProcessed);
      const oldDetail = document.getElementById("mm-detail-badge");
      if (oldDetail) oldDetail.remove();
      run();
    }
  }, 800);
})();
