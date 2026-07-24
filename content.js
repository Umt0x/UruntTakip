(function () {
  const STORAGE_PREFIX = "mm-";
  const AUTO_RESET_KEY = "mm-auto-reset-price-next-month";

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

  function buildBadge(productCode) {
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

      card.appendChild(buildBadge(productCode));
    });
  }

  function isProductDetailPage() {
    return /\/product\//i.test(location.pathname);
  }

  function processDetailPage() {
    if (document.getElementById("mm-detail-badge")) return;
    const productCode = extractProductCode(location.href) || location.pathname;

    const wrap = buildBadge(productCode);
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
