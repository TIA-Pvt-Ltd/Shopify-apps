(function () {
  function previewOf(item) {
    var props = item.properties || {};
    var url = props._previewUrl || props.Preview || "";
    if (url && url.indexOf("data:") !== 0) return url;
    var id = props._customizationId || props["Customization ID"] || "";
    return id ? "/apps/product-customizer/p/" + encodeURIComponent(id) : "";
  }

  function setCartImage(img, url) {
    if (!img || !url || img.getAttribute("data-customizer-preview") === url) return;
    img.setAttribute("data-customizer-preview", url);
    img.src = url;
    img.srcset = url;
    img.removeAttribute("sizes");
    img.classList.add("product-customizer-cart-image");
  }

  function findCartRows() {
    return document.querySelectorAll(
      ".cart-item, [id^='CartItem-'], [id^='CartDrawer-Item-'], .cart-drawer__item, tr.cart-item, [data-cart-item], .cart__item",
    );
  }

  function applyCartPreviews(cart) {
    var items = (cart && cart.items) || [];
    var rows = findCartRows();
    items.forEach(function (item, index) {
      var preview = previewOf(item);
      if (!preview) return;
      var customizationId =
        (item.properties &&
          (item.properties._customizationId || item.properties["Customization ID"])) ||
        "";
      var row = null;
      if (customizationId) {
        rows.forEach(function (node) {
          if (!row && node.textContent.indexOf(customizationId) !== -1) row = node;
        });
      }
      if (!row) row = rows[index];
      if (!row) return;
      var images = row.querySelectorAll("img");
      if (!images.length && row.tagName === "IMG") images = [row];
      images.forEach(function (img) {
        setCartImage(img, preview);
      });
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
    var root = document.querySelector(
      "cart-items, main-cart-items, cart-drawer, #CartDrawer, #main-cart-items, .cart-items, form[action$='/cart']",
    );
    if (root) {
      new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
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
