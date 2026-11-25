(function () {
  var enabledChecks = {};

  function openScriptUrl() {
    var tagged = document.querySelector(
      "[data-pc-open-src], link[data-pc-open-src], script[src*='customizer-open.js']",
    );
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

  function loadCartPreviews() {
    if (window.__pcCartPreviewBound || document.querySelector("script[data-pc-cart]")) return;
    var src = "";
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var current = scripts[i].src || "";
      if (current.indexOf("customizer-loader") !== -1) {
        src = current.replace(/customizer-loader\.js(\?.*)?$/, "cart-previews.js$1");
        break;
      }
    }
    if (!src) return;
    var script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.setAttribute("data-pc-cart", "1");
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

  function selectedVariantId() {
    var input = document.querySelector('form[action*="/cart/add"] [name="id"]');
    return input && input.value ? String(input.value) : "";
  }

  function currentShop(root) {
    return (
      (root && root.getAttribute("data-shop")) ||
      (window.Shopify && window.Shopify.shop) ||
      location.hostname
    );
  }

  function checkProductEnabled(productId, shop) {
    var id = String(productId || "");
    if (!id) return Promise.resolve(null);
    if (enabledChecks[id]) return enabledChecks[id];
    var url =
      "/apps/product-customizer/bootstrap?product_id=" +
      encodeURIComponent(id) +
      "&shop=" +
      encodeURIComponent(shop || "");
    enabledChecks[id] = fetch(url, { credentials: "same-origin" })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        if (!data || data.ok === false) return null;
        return Boolean(data.enabled);
      })
      .catch(function () {
        return null;
      });
    return enabledChecks[id];
  }

  function hideCustomizerBlocks() {
    document.querySelectorAll(".product-customizer-block").forEach(function (block) {
      block.hidden = true;
      block.setAttribute("hidden", "");
      block.style.display = "none";
    });
  }

  function insertBlockIntoForm(block) {
    block.hidden = false;
    block.removeAttribute("hidden");
    block.style.display = "";
    var embed = block.closest(".product-customizer-embed");
    var form = document.querySelector('form[action*="/cart/add"]');
    if (form && !form.contains(block)) {
      var buttons = form.querySelector(".product-form__buttons");
      if (buttons) {
        buttons.insertBefore(block, buttons.firstChild);
      } else {
        var after =
          form.querySelector(".shopify-payment-button") || form.querySelector("[name='add']");
        if (after && after.parentNode) {
          after.parentNode.insertBefore(block, after);
        } else {
          form.appendChild(block);
        }
      }
      if (embed) embed.classList.add("is-placed");
    }
    var button = block.querySelector(".product-customizer-open");
    if (button) button.className = themeButtonClasses();
    var variantId = selectedVariantId();
    if (variantId) block.setAttribute("data-variant-id", variantId);
    loadOpenScript();
  }

  function placeCustomizeButton() {
    if (!/\/products\//.test(location.pathname)) return;
    var block =
      document.querySelector(".product-customizer-embed .product-customizer-block") ||
      document.querySelector(".product-customizer-block");
    if (!block) {
      hydrateBlock();
      return;
    }
    insertBlockIntoForm(block);
    checkProductEnabled(block.getAttribute("data-product-id"), currentShop(block)).then(
      function (enabled) {
        if (enabled === false) hideCustomizerBlocks();
      },
    );
  }

  function hydrateBlock() {
    if (window.__pcHydrating || document.querySelector(".product-customizer-block")) return;
    var match = location.pathname.match(/\/products\/([^/?#]+)/);
    if (!match) return;
    window.__pcHydrating = true;
    var handle = decodeURIComponent(match[1]);
    var shop = currentShop();
    fetch("/products/" + encodeURIComponent(handle) + ".js", { credentials: "same-origin" })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (product) {
        if (!product || document.querySelector(".product-customizer-block")) return null;
        return checkProductEnabled(String(product.id), shop).then(function (enabled) {
          return enabled === true ? product : null;
        });
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
          String(
            selectedVariantId() ||
              (product.variants && product.variants[0] && product.variants[0].id) ||
              "",
          ),
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
    loadCartPreviews();
    placeCustomizeButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
