/* ===============================
   CART COUNT BADGE
   Purpose: Update cart count display sa navbar/badge
================================ */
function updateCartCount() {
  const cart = JSON.parse(localStorage.getItem("drinCart")) || [];

  const totalItems = cart.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0);
  }, 0);

  const badge = document.getElementById("cartCount");

  if (badge) {
    badge.textContent = totalItems;
  }
}

/* ===============================
   DOM ELEMENTS
   Purpose: Kunin lahat ng HTML elements na ginagamit ng cart page
================================ */
const cartList = document.getElementById("cartList");
const cartTotal = document.getElementById("cartTotal");
const checkoutBtn = document.getElementById("checkoutBtn");
const selectedCount = document.getElementById("selectedCount");

/* ===============================
   CART STORAGE
   Purpose: Kunin saved cart items from localStorage
================================ */
let cart = JSON.parse(localStorage.getItem("drinCart")) || [];

/* ===============================
   HELPER FUNCTIONS
   Purpose: Safe conversion, escaping, formatting
================================ */
function safeText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(text) {
  return String(text ?? "").replaceAll('"', "&quot;");
}

function formatPrice(value) {
  return `₱${safeNumber(value, 0).toLocaleString("en-PH")}`;
}

/* ===============================
   PRODUCT / STOCK HELPERS
   Purpose: Kunin item ID, stock, at limit quantity based sa stock
================================ */
function getItemId(item) {
  return item.id || item.productId;
}

function saveCart() {
  localStorage.setItem("drinCart", JSON.stringify(cart));
  updateCartCount();
}

function syncCheckoutItems() {
  let checkout =
    JSON.parse(localStorage.getItem("drinCheckoutItems")) || [];

  if (!checkout.length) return;

  checkout = checkout.filter(checkoutItem =>
    cart.some(cartItem =>
      String(cartItem.id || cartItem.productId) ===
      String(checkoutItem.id || checkoutItem.productId) &&

      String(cartItem.variantLabel || "") ===
      String(checkoutItem.variantLabel || "")
    )
  );

  localStorage.setItem(
    "drinCheckoutItems",
    JSON.stringify(checkout)
  );
}

function getProducts() {
  return JSON.parse(localStorage.getItem("drinProducts")) || [];
}

function getProductStock(productId, cartItem = null) {
  const products = getProducts();
  const product = products.find((item) => String(item.id) === String(productId));

  if (product) {
    return safeNumber(product.stock, -1);
  }

  if (cartItem && cartItem.stock !== undefined) {
    return safeNumber(cartItem.stock, -1);
  }

  return -1;
}

function clampQty(productId, qty, cartItem = null) {
  const stock = getProductStock(productId, cartItem);

  if (qty < 0) return 0;
  if (stock === -1) return qty;
  if (qty > stock) return stock;

  return qty;
}

/* ===============================
   SELECTED CART
   Purpose: Kunin lang selected items na may quantity
================================ */
function getSelectedCart() {
  return cart.filter((item) => {
    return item.selected && Number(item.quantity) > 0;
  });
}

/* ===============================
   RENDER CART
   Purpose: I-display lahat ng cart items sa cart page
================================ */
function renderCart() {
  if (!cartList || !cartTotal) return;

  cartList.innerHTML = "";

  if (!Array.isArray(cart) || cart.length === 0) {
    cartList.innerHTML = `
      <div class="empty-cart">
        <h3>Your cart is empty</h3>
        <p>Add products first before checkout.</p>
        <a href="../index.html">Go back to shop</a>
      </div>
    `;

    cartTotal.textContent = "₱0";

    if (selectedCount) selectedCount.textContent = "0";
    if (checkoutBtn) checkoutBtn.disabled = false;

    return;
  }

  let totalAmount = 0;

  cart.forEach((item, index) => {
    if (item.selected === undefined) {
      item.selected = true;
    }

    const stock = getProductStock(getItemId(item), item);

    let quantity = safeNumber(item.quantity, 1);
    quantity = clampQty(getItemId(item), quantity, item);
    cart[index].quantity = quantity;

    const isZeroQty = quantity === 0;
    const isOutOfStock = stock === 0;

    if (isZeroQty || isOutOfStock) {
      cart[index].selected = false;
      item.selected = false;
    }

    const price = safeNumber(item.price, 0);
    const itemTotal = quantity * price;

    if (item.selected && quantity > 0) {
      totalAmount += itemTotal;
    }

    const card = document.createElement("div");
    card.className = `cart-item ${item.selected ? "selected" : "unselected"} ${isZeroQty || isOutOfStock ? "unavailable" : ""
      }`;

    card.innerHTML = `
      <div class="cart-check">
        <input
          type="checkbox"
          ${item.selected ? "checked" : ""}
          ${isZeroQty || isOutOfStock ? "disabled" : ""}
          onchange="toggleSelect(${index})"
        />
      </div>

      <div class="cart-item-image">
  <img
  src="${escapeAttribute(item.image || "../Image/no-image.png")}"
  alt="${escapeHtml(safeText(item.name, "Product"))}"
  onerror="this.onerror=null; this.src='../Image/no-image.png'"
/>
</div>

      <div class="cart-item-info">
        <span class="cart-item-category">
          ${escapeHtml(safeText(item.category, "General"))}
        </span>

        <h3 class="cart-item-title">
          ${escapeHtml(safeText(item.name, "Unnamed Product"))}
          ${item.variantLabel
        ? `<br><small>Variation: ${escapeHtml(item.variantLabel)}</small>`
        : ""
      }
        </h3>

        <p class="cart-item-price">${formatPrice(price)}</p>

        <p class="cart-item-stock ${isOutOfStock ? "out-stock" : stock !== -1 && quantity >= stock ? "max-stock" : ""
      }">
          ${isZeroQty
        ? "Qty is 0"
        : isOutOfStock
          ? "Out of stock"
          : stock !== -1 && quantity >= stock
            ? "Maximum stock reached"
            : stock === -1
              ? "Stock: Available"
              : "Stock: " + stock
      }
        </p>

        <div class="cart-item-actions">
          <div class="qty-box">
            <button
              type="button"
              onclick="decreaseQty(${index})"
              ${isZeroQty ? "disabled" : ""}
            >
              −
            </button>

            <input
              type="number"
              class="qty-input"
              value="${quantity}"
              min="0"
              ${stock === -1 ? "" : `max="${stock}"`}
              oninput="manualQty(${index}, this.value)"
            />

            <button
              type="button"
              onclick="increaseQty(${index})"
              ${stock !== -1 && quantity >= stock ? "disabled" : ""}
            >
              +
            </button>
          </div>

          <div class="item-total">${formatPrice(itemTotal)}</div>

          <button type="button" class="remove-btn" onclick="removeItem(${index})">
            Remove
          </button>
        </div>
      </div>
    `;

    cartList.appendChild(card);
  });

  saveCart();
  cartTotal.textContent = formatPrice(totalAmount);

  const selectedItems = getSelectedCart();

  if (selectedCount) {
    selectedCount.textContent = selectedItems.reduce((sum, item) => {
      return sum + (Number(item.quantity) || 0);
    }, 0);
  }


  if (checkoutBtn) {
    // Allow clicking Checkout to show the selection notice.
    // Disable only when the entire cart is empty.
    checkoutBtn.disabled = false;
  }


  const selectAll = document.getElementById("selectAll");

  if (selectAll) {
    const selectableItems = cart.filter((item) => {
      const qty = Number(item.quantity) || 0;
      const stock = getProductStock(getItemId(item), item);
      return qty > 0 && stock !== 0;
    });

    selectAll.checked =
      selectableItems.length > 0 &&
      selectedItems.length === selectableItems.length;
  }
}

/* ===============================
   SELECT / UNSELECT ITEMS
   Purpose: Toggle selected cart item or select all items
================================ */
function toggleSelect(index) {
  if (!cart[index]) return;

  const qty = safeNumber(cart[index].quantity, 0);
  const stock = getProductStock(getItemId(cart[index]), cart[index]);

  if (qty <= 0 || stock === 0) {
    cart[index].selected = false;
    saveCart();
    renderCart();
    return;
  }

  cart[index].selected = !cart[index].selected;
  saveCart();
  renderCart();
}

function toggleSelectAll(checkbox) {
  cart.forEach((item) => {
    const qty = Number(item.quantity) || 0;
    const stock = getProductStock(getItemId(item), item);

    item.selected = checkbox.checked && qty > 0 && stock !== 0;
  });

  saveCart();
  renderCart();
}

/* ===============================
   QUANTITY CONTROLS
   Purpose: Increase, decrease, manual input quantity
================================ */
function increaseQty(index) {
  if (!cart[index]) return;

  const currentQty = safeNumber(cart[index].quantity, 0);
  const stock = getProductStock(getItemId(cart[index]), cart[index]);

  if (stock !== -1 && currentQty >= stock) return;


  if (currentQty >= 50) {
    showCartNotice(
      "Quantity Limit",
      "Maximum 50 pcs per variant only."
    );
    return;
  }
  cart[index].quantity = currentQty + 1;

  if (cart[index].quantity > 0 && stock !== 0) {
    cart[index].selected = true;
  }

  saveCart();
  renderCart();
}

function decreaseQty(index) {
  if (!cart[index]) return;

  const currentQty = safeNumber(cart[index].quantity, 0);

  if (currentQty > 0) {
    cart[index].quantity = currentQty - 1;
  }

  if (cart[index].quantity <= 0) {
    cart[index].quantity = 0;
    cart[index].selected = false;
  }

  saveCart();
  syncCheckoutItems();
  renderCart();
}

function manualQty(index, value) {
  if (!cart[index]) return;

  let qty = safeNumber(value, 0);
  if (qty > 50) {
    qty = 50;
  }

  qty = clampQty(getItemId(cart[index]), qty, cart[index]);

  cart[index].quantity = qty;

  const stock = getProductStock(getItemId(cart[index]), cart[index]);

  if (qty <= 0 || stock === 0) {
    cart[index].selected = false;
  }

  saveCart();
  syncCheckoutItems();
  renderCart();
}

/* ===============================
   REMOVE ITEM + UNDO
   Purpose: Remove cart item with undo toast support
================================ */
let lastRemovedItem = null;
let lastRemovedIndex = null;
let undoTimer = null;

function removeItem(index) {
  if (!cart[index]) return;

  const itemCard = document.querySelectorAll(".cart-item")[index];

  if (itemCard) {
    itemCard.classList.add("removing");
  }

  lastRemovedItem = { ...cart[index] };
  lastRemovedIndex = index;

  setTimeout(() => {
    cart.splice(index, 1);

    saveCart();
    syncCheckoutItems();   // ADD THIS

    renderCart();
    showUndoToast(lastRemovedItem.name || "Item");
  }, 250);
}

function showUndoToast(itemName) {
  const toast = document.getElementById("cartToast");
  const toastText = document.getElementById("cartToastText");

  if (!toast || !toastText) return;

  toastText.textContent = `${itemName} removed`;
  toast.classList.add("show");

  clearTimeout(undoTimer);

  undoTimer = setTimeout(() => {
    toast.classList.remove("show");
    lastRemovedItem = null;
    lastRemovedIndex = null;
  }, 1500);
}

function undoRemove() {
  if (!lastRemovedItem || lastRemovedIndex === null) return;

  cart.splice(lastRemovedIndex, 0, lastRemovedItem);
  saveCart();
  renderCart();

  const toast = document.getElementById("cartToast");
  if (toast) toast.classList.remove("show");

  lastRemovedItem = null;
  lastRemovedIndex = null;
  clearTimeout(undoTimer);
}

/* ===============================
   CHECKOUT VALIDATION
   Purpose: Limit checkout to max 50 items and max ₱50,000
================================ */
function goToCheckout() {
  const selectedItems = getSelectedCart();

  const MAX_CHECKOUT_ROWS = 50;


  const totalValue = selectedItems.reduce((sum, item) => {
    return sum + ((Number(item.price) || 0) * (Number(item.quantity) || 0));
  }, 0);



  if (cart.length === 0) {
    showCartNotice(
      "Your Cart Is Empty",
      "Your shopping cart is currently empty. Browse our products and add your favorites before checkout."
    );
    return;
  }

  if (selectedItems.length === 0) {
    showCartNotice(
      "No Product Selected",
      "Please select at least one product from your cart before proceeding to checkout."
    );
    return;
  }



  if (selectedItems.length > MAX_CHECKOUT_ROWS) {
    return;
  }


  const checkoutItems = selectedItems.map(item => {
    const safeImage =
      item.variant_image ||
      item.product_image ||
      item.image ||
      item.img ||
      item.photo ||
      "";

    const finalImage =
      String(safeImage).startsWith("data:")
        ? ""
        : safeImage;

    return {
      ...item,
      image: finalImage,
      variant_image: finalImage,
      product_image: finalImage,

      weight: Number(
        item.weight ??
        item.parcel_weight ??
        item.shippingWeight ??
        0.01
      ),

      length: Number(
        item.length ??
        item.parcel_length ??
        item.shippingLength ??
        1
      ),

      width: Number(
        item.width ??
        item.parcel_width ??
        item.shippingWidth ??
        1
      ),

      height: Number(
        item.height ??
        item.parcel_height ??
        item.shippingHeight ??
        1
      ),
    };
  });

  localStorage.setItem("drinCheckoutItems", JSON.stringify(checkoutItems));

  if (typeof fbq !== "undefined") {
    fbq("track", "InitiateCheckout", {
      value: totalValue,
      currency: "PHP"
    });
  }

  window.location.href = "../Checkout/checkout.html";
}
/* ===============================
   INIT
   Purpose: Initial render when page loads
================================ */
renderCart();

/* ===============================
   GLOBAL FUNCTIONS
   Purpose: Expose functions for inline HTML onclick/onchange
================================ */
window.increaseQty = increaseQty;
window.decreaseQty = decreaseQty;
window.manualQty = manualQty;
window.removeItem = removeItem;
window.goToCheckout = goToCheckout;
window.toggleSelect = toggleSelect;
window.toggleSelectAll = toggleSelectAll;
window.undoRemove = undoRemove;

function goBackProduct() {

  const productId =
    localStorage.getItem("selectedProductId");

  if (productId) {

    window.location.href =
      `../Product/index.html?id=${productId}`;

  } else {

    history.back();

  }

}

function smartBack(fallback = "../index.html") {

  if (
    document.referrer &&
    document.referrer !== window.location.href
  ) {
    window.history.back();
  } else {
    window.location.href = fallback;
  }

}

function showCartNotice(title, message) {
  const modal = document.createElement("div");

  modal.className = "cart-premium-modal";

  modal.innerHTML = `
    <div class="cart-premium-card">
      <h3>${title}</h3>
      <p>${message}</p>
      <button type="button">OK</button>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("button").onclick = () => {
    modal.remove();
  };
}

function shopMoreProducts() {

  sessionStorage.setItem(
    "scrollToProducts",
    "true"
  );

  window.location.href =
    "../index.html";

}

window.shopMoreProducts = shopMoreProducts;

window.addEventListener("pageshow", function () {

  cart = JSON.parse(localStorage.getItem("drinCart")) || [];

  renderCart();
  updateCartCount();

});

/* ===============================
   GLOBAL MAINTENANCE MODE
================================ */

window.maintenanceMode = false;

async function checkMaintenanceMode() {

  const popup =
    document.getElementById(
      "maintenancePopup"
    );

  if (!popup) return;

  try {

    const { data, error } =
      await supabaseClient
        .from("site_settings")
        .select("value")
        .eq(
          "key",
          "maintenance_mode"
        )
        .maybeSingle();

    if (error) return;

    const enabled =
      data?.value === "true";

    window.maintenanceMode =
      enabled;

    popup.style.display =
      enabled
        ? "flex"
        : "none";

  } catch (err) {

    console.error(err);

  }

}

document.addEventListener(
  "DOMContentLoaded",
  () => {

    checkMaintenanceMode();

    setInterval(
      checkMaintenanceMode,
      5000
    );

  }
);


/* =====================================
   CART - YOU MAY ALSO LIKE
   4 products initially, up to 8
===================================== */

async function loadCartRecommendations() {
  const section = document.getElementById("cartRecommendations");
  const grid = document.getElementById("cartRecommendationsGrid");
  const moreBtn = document.getElementById("cartRecommendationsMore");

  if (!section || !grid || !moreBtn) return;
  if (typeof supabaseClient === "undefined") return;

  try {
    const { data, error } = await supabaseClient
      .from("products")
      .select("*")
      .limit(200);

    if (error) throw error;

    const cartIds = new Set(
      cart.map(item => String(item.id || item.productId))
    );

    const cartCategories = new Set(
      cart.map(item => String(item.category || "").trim().toLowerCase())
        .filter(Boolean)
    );

    // Find categories from Supabase if cart items lack category.
    (data || []).forEach(product => {
      if (cartIds.has(String(product.id)) && product.category) {
        cartCategories.add(String(product.category).trim().toLowerCase());
      }
    });


    const availableProducts = (data || []).filter(product => {
      if (cartIds.has(String(product.id))) return false;

      const variations = Array.isArray(product.variations)
        ? product.variations
        : [];


      const stock = variations.length
        ? variations.reduce(
          (sum, v) => sum + Math.max(0, Number(v.stock) || 0),
          0
        )
        : Number(product.stock) || 0;

      // Exclude products with no available stock
      if (stock <= 0) return false;

      return true;

    });

    // Randomize all available products (Fisher-Yates shuffle)
    for (let i = availableProducts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      [availableProducts[i], availableProducts[j]] =
        [availableProducts[j], availableProducts[i]];
    }

    // Show maximum 8 random recommendations
    const recommendations = availableProducts.slice(0, 8);


    if (!recommendations.length) {
      section.hidden = true;
      return;
    }

    grid.replaceChildren();

    recommendations.forEach((product, index) => {
      const variations = Array.isArray(product.variations)
        ? product.variations
        : [];

      const availableVariant = variations.find(
        v => Number(v.stock) > 0
      );

      const price = Number(
        availableVariant?.price ?? product.price ?? 0
      );

      const discount = Number(
        availableVariant?.discountPrice ??
        availableVariant?.discount_price ??
        product.discount_price ??
        product.discountPrice ??
        0
      );

      const finalPrice =
        discount > 0 && discount < price ? discount : price;


      const image =
        product.image ||
        "../Image/no-image.png";


      const card = document.createElement("a");
      card.className = "cart-recommendation-card";
      card.href = `../Product/index.html?id=${encodeURIComponent(product.id)}`;

      const imageEl = document.createElement("img");
      // Store image URL without downloading it yet
      imageEl.dataset.src = image;
      imageEl.alt = product.title || "Product";
      imageEl.loading = "lazy";
      imageEl.onerror = () => {
        imageEl.onerror = null;
        imageEl.src = "../Image/no-image.png";
      };

      const info = document.createElement("div");
      info.className = "cart-recommendation-info";

      const name = document.createElement("div");
      name.className = "cart-recommendation-name";
      name.textContent = product.title || "Unnamed Product";


      const priceEl = document.createElement("div");
      priceEl.className = "cart-recommendation-price";

      const salePrice = document.createElement("span");
      salePrice.className = "cart-sale-price";
      salePrice.textContent = `₱${finalPrice.toLocaleString("en-PH")}`;

      priceEl.appendChild(salePrice);

      // Show original price and discount only when valid
      if (discount > 0 && discount < price) {
        const originalPrice = document.createElement("span");
        originalPrice.className = "cart-original-price";
        originalPrice.textContent = `₱${price.toLocaleString("en-PH")}`;

        const discountBadge = document.createElement("span");
        discountBadge.className = "cart-discount-badge";
        discountBadge.textContent =
          `-${Math.round(((price - discount) / price) * 100)}%`;

        priceEl.append(originalPrice, discountBadge);
      }

      info.append(name, priceEl);

      card.append(imageEl, info);

      // Staggered product card loading
      card.style.opacity = "0";
      card.style.transform = "translateY(10px)";
      card.style.transition = "opacity 0.3s ease, transform 0.3s ease";

      grid.appendChild(card);

      // First 4 appear one by one
      setTimeout(() => {
        card.style.opacity = "1";
        card.style.transform = "translateY(0)";
      }, index * 120);
    });

    const cards = [...grid.children];
    let visible = 4;


    function updateVisibility() {
      cards.forEach((card, index) => {
        const shouldShow = index < visible;

        card.hidden = !shouldShow;

        if (!shouldShow) return;

        const img = card.querySelector("img");

        // Download image only when its card becomes visible
        if (img && img.dataset.src) {
          img.src = img.dataset.src;
          delete img.dataset.src;
        }
      });

      moreBtn.hidden = visible >= cards.length;
    }


    moreBtn.onclick = () => {
      visible = Math.min(visible + 4, cards.length);
      updateVisibility();
    };

    // Preserve the CSS hidden state on each card.
    if (!document.getElementById("cartRecommendationHideStyle")) {
      const style = document.createElement("style");
      style.id = "cartRecommendationHideStyle";
      style.textContent =
        ".cart-recommendation-card[hidden]{display:none!important;}";
      document.head.appendChild(style);
    }

    updateVisibility();
    section.hidden = false;

  } catch (error) {
    console.error("Cart recommendations error:", error);
    section.hidden = true;
  }
}

loadCartRecommendations();

