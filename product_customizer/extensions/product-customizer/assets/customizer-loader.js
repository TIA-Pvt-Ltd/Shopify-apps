(function () {
  var PREVIEW_LABEL = "Click to View Image";

  function shopDomain() {
    return (window.Shopify && window.Shopify.shop) || location.hostname || "";
  }

  function withShop(url) {
    if (!url || url.indexOf("data:") === 0) return "";
    if (url.indexOf("shop=") !== -1 || url.indexOf("http") === 0) return url;
    if (url.charAt(0) !== "/") return url;
    var shop = shopDomain();
    return shop ? url + (url.indexOf("?") === -1 ? "?" : "&") + "shop=" + encodeURIComponent(shop) : url;
  }

  function previewOf(item) {
    var props = item.properties || {};
    var url = props._previewUrl || "";
    if (url && url.indexOf("data:") !== 0 && url !== PREVIEW_LABEL) return withShop(url);
    var id = customizationIdOf(item);
    return id ? withShop("/apps/product-customizer/p/" + encodeURIComponent(id) + ".png") : "";
  }

  function customizationIdOf(item) {
    var props = item.properties || {};
    return props._customizationId || props["Customization ID"] || "";
  }

  function isMediaContext(node) {
    return Boolean(
      node &&
        node.closest &&
        node.closest(
          ".cart-item__media, .cart-item__image, .cart-item__link, .cart-drawer-item__image, .cart__image, [class*='cart-item__media']",
        ),
    );
  }

  function detailsColumn(row) {
    return (
      row.querySelector(
        ".cart-item__details, .cart-item__info, .cart-drawer-item__details, td + td, .cart__item-details",
      ) || row
    );
  }

  function setCartImage(img, url) {
    if (!img || !url || img.getAttribute("data-customizer-preview") === url) return;
    if (!img.getAttribute("data-customizer-original")) {
      img.setAttribute("data-customizer-original", img.currentSrc || img.src || "");
    }
    img.setAttribute("data-customizer-preview", url);
    img.addEventListener("error", function () {
      var original = img.getAttribute("data-customizer-original");
      if (original && img.src !== original) {
        img.src = original;
        img.srcset = original;
      }
    }, { once: true });
    img.src = url;
    img.srcset = url;
    img.removeAttribute("sizes");
    img.classList.add("product-customizer-cart-image");
    var picture = img.closest("picture");
    if (picture) {
      picture.querySelectorAll("source").forEach(function (source) {
        source.setAttribute("srcset", url);
      });
    }
  }

  function cartItemImage(row) {
    if (!row) return null;
    if (row.tagName === "IMG") return row;
    return (
      row.querySelector(
        ".cart-item__image img, .cart-item__media img, .cart-drawer-item__image img, .cart__image img, [class*='cart-item'] img, [class*='CartItem'] img",
      ) || row.querySelector("img")
    );
  }

  function findCartRows() {
    return document.querySelectorAll(
      ".cart-item, [id^='CartItem-'], [id^='CartDrawer-Item-'], .cart-drawer__item, tr.cart-item, [data-cart-item], .cart__item, .cart-drawer-item",
    );
  }

  function findRowForItem(item, rows, index) {
    var list = Array.prototype.slice.call(rows);
    var key = item.key || "";
    var variantId = String(item.id || item.variant_id || "");
    var customizationId = customizationIdOf(item);

    if (key) {
      var byKey = list.find(function (row) {
        return row.innerHTML && row.innerHTML.indexOf(key) !== -1;
      });
      if (byKey) return byKey;
    }

    if (customizationId) {
      var byId = list.find(function (row) {
        return row.textContent && row.textContent.indexOf(customizationId) !== -1;
      });
      if (byId) return byId;
    }

    if (variantId) {
      var matches = list.filter(function (row) {
        var input = row.querySelector("[data-quantity-variant-id]");
        return input && String(input.getAttribute("data-quantity-variant-id")) === variantId;
      });
      if (matches.length === 1) return matches[0];
    }

    return list[index] || null;
  }

  function openPreview(url) {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function makePreviewAnchor(url) {
    var link = document.createElement("a");
    link.className = "product-customizer-preview-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = PREVIEW_LABEL;
    link.addEventListener(
      "click",
      function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        openPreview(url);
      },
      true,
    );
    return link;
  }

  function normalizedText(node) {
    return ((node && node.textContent) || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function findPropertyBlock(row, label) {
    var needle = String(label || "").toLowerCase();
    if (!needle) return null;
    var nodes = row.querySelectorAll(".product-option, .cart-item__property, li, p, dt, dd");
    var match = null;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (isMediaContext(node)) continue;
      var text = normalizedText(node);
      if (text.length > 80) continue;
      if (text.indexOf(needle) === 0 || text.indexOf(needle + ":") !== -1) {
        match = node.closest(".product-option, .cart-item__property, li, p") || node;
        break;
      }
    }
    return match;
  }

  function linkifyExistingPreview(row, url) {
    var linked = false;
    row.querySelectorAll("dd, .product-option, li, p, span").forEach(function (node) {
      if (isMediaContext(node) || node.querySelector(".product-customizer-preview-link")) return;
      var text = normalizedText(node);
      if (text === "click to view image" || text === "preview: click to view image") {
        node.textContent = "";
        if (text.indexOf("preview") === 0) {
          node.appendChild(document.createTextNode("Preview: "));
        }
        node.appendChild(makePreviewAnchor(url));
        linked = true;
      }
    });
    return linked;
  }

  function placePreviewLink(row, url) {
    row.querySelectorAll(".product-customizer-cart-props").forEach(function (el) {
      if (isMediaContext(el) || el.closest("a[href*='/products/']")) el.remove();
    });

    var existing = row.querySelector(".cart-item__details .product-customizer-preview-link, .cart-item__info .product-customizer-preview-link, .product-customizer-cart-props .product-customizer-preview-link");
    if (existing && !isMediaContext(existing) && !existing.closest("a[href*='/products/']")) {
      existing.href = url;
      return;
    }

    if (linkifyExistingPreview(row, url)) return;

    var wrap = document.createElement("div");
    wrap.className = "product-customizer-cart-props product-option";
    wrap.appendChild(document.createTextNode("Preview: "));
    wrap.appendChild(makePreviewAnchor(url));

    var after =
      findPropertyBlock(row, "customization id") ||
      findPropertyBlock(row, "view") ||
      findPropertyBlock(row, "color");
    var details = detailsColumn(row);

    if (after && after.parentNode && !isMediaContext(after) && !after.closest("a[href*='/products/']")) {
      after.parentNode.insertBefore(wrap, after.nextSibling);
      return;
    }

    if (details && !details.closest("a[href*='/products/']")) {
      details.appendChild(wrap);
      return;
    }

    row.appendChild(wrap);
  }

  function applyCartPreviews(cart) {
    var items = (cart && cart.items) || [];
    var rows = findCartRows();
    items.forEach(function (item, index) {
      var preview = previewOf(item);
      if (!preview) return;
      var row = findRowForItem(item, rows, index);
      if (!row) return;
      var image = cartItemImage(row);
      if (image) setCartImage(image, preview);
      placePreviewLink(row, preview);
    });
  }

  var timer;
  var pending = false;

  function refresh() {
    if (pending) return;
    pending = true;
    fetch("/cart.js", { credentials: "same-origin" })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (cart) {
        if (cart) applyCartPreviews(cart);
      })
      .catch(function () {})
      .finally(function () {
        pending = false;
      });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 200);
  }

  function bind() {
    if (window.__pcCartPreviewBound) return;
    window.__pcCartPreviewBound = true;
    refresh();
    document.addEventListener("cart:updated", schedule);
    window.addEventListener("pageshow", schedule);
    document.addEventListener("cart:refresh", schedule);
    var roots = document.querySelectorAll(
      "cart-items, main-cart-items, cart-drawer, #CartDrawer, #main-cart-items, .cart-items, form[action$='/cart']",
    );
    if (roots.length) {
      var observer = new MutationObserver(schedule);
      roots.forEach(function (root) {
        observer.observe(root, { childList: true, subtree: true });
      });
    } else if (/\/cart\/?$/.test(location.pathname)) {
      new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    }
  }

  function openScriptUrl() {
    var tagged = document.querySelector("[data-pc-open-src], link[data-pc-open-src], script[src*='customizer-open.js']");
    if (tagged) {
      return tagged.getAttribute("data-pc-open-src") || tagged.getAttribute("href") || tagged.src || "";
    }
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || "";
      if (src.indexOf("customizer-loader") !== -1) {
        return src.replace(/customizer-loader\.js(\?.*)?$/, "customizer-open.js$1");
      }
    }
    return "";
  }

  function loadOpenScript() {
    if (window.__pcCustomizerOpen || document.querySelector("script[data-pc-open]")) return;
    var src = openScriptUrl();
    if (!src) return;
    var script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.setAttribute("data-pc-open", "1");
    document.head.appendChild(script);
  }

  function themeButtonClasses() {
    var source = document.querySelector(
      'form[action*="/cart/add"] .product-form__submit, form[action*="/cart/add"] [name="add"], .shopify-payment-button__button--unbranded, .shopify-payment-button__button',
    );
    var names = source
      ? source.className.split(/\s+/)
      : ["button", "button--full-width", "button--secondary"];
    return names
      .filter(function (name) {
        return (
          name &&
          name !== "product-customizer-open" &&
          name.indexOf("loading") === -1 &&
          name !== "is-busy"
        );
      })
      .concat("product-customizer-open")
      .join(" ");
  }

  function applyThemeButton(button) {
    if (!button) return;
    button.className = themeButtonClasses();
  }

  function selectedVariantId() {
    var input = document.querySelector('form[action*="/cart/add"] [name="id"]');
    return input && input.value ? String(input.value) : "";
  }

  function placeCustomizeButton() {
    if (!/\/products\//.test(location.pathname)) return;
    var block = document.querySelector(".product-customizer-embed .product-customizer-block") ||
      document.querySelector(".product-customizer-block");
    if (!block) {
      hydrateBlock();
      return;
    }
    var embed = block.closest(".product-customizer-embed");
    var form = document.querySelector('form[action*="/cart/add"]');
    if (form && !form.contains(block)) {
      var buttons = form.querySelector(".product-form__buttons");
      if (buttons) {
        buttons.insertBefore(block, buttons.firstChild);
      } else {
        var after =
          form.querySelector(".shopify-payment-button") ||
          form.querySelector("[name='add']");
        if (after && after.parentNode) {
          after.parentNode.insertBefore(block, after);
        } else {
          form.appendChild(block);
        }
      }
      if (embed) embed.classList.add("is-placed");
    }
    applyThemeButton(block.querySelector(".product-customizer-open"));
    var variantId = selectedVariantId();
    if (variantId) block.setAttribute("data-variant-id", variantId);
    loadOpenScript();
  }

  function hydrateBlock() {
    if (window.__pcHydrating || document.querySelector(".product-customizer-block")) return;
    var match = location.pathname.match(/\/products\/([^/?#]+)/);
    if (!match) return;
    window.__pcHydrating = true;
    var handle = decodeURIComponent(match[1]);
    var shop = (window.Shopify && window.Shopify.shop) || location.hostname;
    fetch("/products/" + encodeURIComponent(handle) + ".js", { credentials: "same-origin" })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (product) {
        if (!product || document.querySelector(".product-customizer-block")) return;
        var root = document.createElement("div");
        root.className = "product-customizer-block";
        root.setAttribute("data-product-id", String(product.id));
        root.setAttribute("data-product-handle", product.handle || handle);
        root.setAttribute("data-shop", shop);
        root.setAttribute(
          "data-variant-id",
          String(selectedVariantId() || (product.variants && product.variants[0] && product.variants[0].id) || ""),
        );
        root.setAttribute("data-display-mode", "modal");
        var json = document.createElement("script");
        json.type = "application/json";
        json.setAttribute("data-product-customizer-json", "");
        json.textContent = JSON.stringify(product);
        var button = document.createElement("button");
        button.type = "button";
        button.className = "button button--full-width button--secondary product-customizer-open";
        button.textContent = "Customize Product";
        var mount = document.createElement("div");
        mount.className = "product-customizer-mount";
        mount.hidden = true;
        root.appendChild(json);
        root.appendChild(button);
        root.appendChild(mount);
        var wrap = document.createElement("div");
        wrap.className = "product-customizer-embed";
        wrap.appendChild(root);
        document.body.appendChild(wrap);
        placeCustomizeButton();
      })
      .catch(function () {})
      .finally(function () {
        window.__pcHydrating = false;
      });
  }

  function boot() {
    bind();
    placeCustomizeButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
