(function () {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const sessionId = hash.get("mmcmp");
  if (!sessionId) return;

  function clean(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function siteName() {
    if (/vatanbilgisayar\.com$/i.test(location.hostname.replace(/^www\./, ""))) return "vatan";
    if (/akakce\.com$/i.test(location.hostname.replace(/^www\./, ""))) return "akakce";
    if (/cimri\.com$/i.test(location.hostname.replace(/^www\./, ""))) return "cimri";
    return "unknown";
  }

  function parsePrice(text) {
    const normalized = clean(text).replace(/\u00a0/g, " ");
    const matches = [...normalized.matchAll(/(?:₺\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d{3,7}(?:,\d{1,2})?)\s*(?:TL|₺)/gi)];
    for (const m of matches) {
      const value = Number(m[1].replace(/\./g, "").replace(",", "."));
      if (value >= 50 && value <= 10000000) return { text: m[0].trim(), value };
    }
    return null;
  }

  function findTitle() {
    const selectors = [
      '[data-test*="product-title"]', '[class*="product-name"]', '[class*="productName"]',
      '[class*="product-title"]', '[class*="productTitle"]', 'h1', 'h2', 'h3'
    ];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const t = clean(el.textContent);
        if (t.length >= 8 && t.length <= 240 && !/kupon|kampanya|indirim|reklam/i.test(t)) return t;
      }
    }
    return clean(document.title).replace(/\s*[|–—-]\s*(Vatan|Akakçe|Cimri).*$/i, "");
  }

  function findPrice() {
    const selectors = [
      '[class*="price"]', '[class*="Price"]', '[data-test*="price"]',
      '[itemprop="price"]', '[content*="TRY"]'
    ];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const p = parsePrice(el.getAttribute("content") || el.textContent);
        if (p) return p;
      }
    }
    return parsePrice(document.body.innerText || "");
  }

  function report() {
    const site = siteName();
    if (site === "unknown") return;
    const price = findPrice();
    const result = {
      site,
      title: findTitle(),
      priceText: price ? price.text : null,
      priceValue: price ? price.value : null,
      url: location.href.split("#")[0],
      checkedAt: Date.now()
    };
    chrome.storage.local.set({ ["mm-compare-" + sessionId + "-" + site]: result });
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    report();
    if (attempts >= 12) clearInterval(timer);
  }, 1000);
  report();
})();
