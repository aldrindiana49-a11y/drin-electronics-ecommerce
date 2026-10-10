if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

window.addEventListener("pageshow", () => {
  window.scrollTo(0, 0);
});

let products = [];
let cart = JSON.parse(localStorage.getItem("drinCart")) || [];

const params = new URLSearchParams(window.location.search);
const productId = params.get("id") || localStorage.getItem("selectedProductId");

const quantityInput = document.getElementById("quantityInput");
const plusBtn = document.getElementById("plusBtn");
const minusBtn = document.getElementById("minusBtn");
const addToCartBtn = document.getElementById("addToCartBtn");
const message = document.getElementById("message");

let productsLoading = true;

const loadingModal =
  document.getElementById("productLoadingModal");

function showLoading() {
  if (loadingModal) {
    loadingModal.classList.remove("hide");
  }
}

function hideLoading() {
  if (loadingModal) {
    loadingModal.classList.add("hide");
  }
}

function setProductActionsLoading(isLoading) {
  productsLoading = isLoading;

  document
    .querySelectorAll("#addToCartBtn, #buyNowBtn")
    .forEach(btn => {
      if (!btn) return;

      btn.disabled = isLoading;
      btn.style.pointerEvents = isLoading ? "none" : "auto";
      btn.style.opacity = isLoading ? "0.55" : "1";
    });

  if (addToCartBtn) {
    addToCartBtn.textContent = isLoading ? "Loading..." : "🛒 Add to Cart";
  }
}

if (addToCartBtn) {
  addToCartBtn.disabled = true;
  addToCartBtn.textContent = "Loading...";
}

const variantContainer = document.getElementById("variantContainer");
let selectedVariant = null;

function renderVariantSelector() {
  if (!variantContainer) return;

  const variants = getVariants(product);

  if (!variants.length) {
    variantContainer.innerHTML = "";
    selectedVariant = null;
    return;
  }

  const realVariants = variants
    .map((variant, originalIndex) => ({
      variant,
      originalIndex
    }))
    .filter(item =>
      item.variant.label &&
      item.variant.label !== "Default"
    );

  if (!realVariants.length) {
    variantContainer.innerHTML = "";
    selectedVariant = null;
    return;
  }

  const inStockVariants = realVariants.filter(
    item => safeNumber(item.variant.stock) > 0
  );

  const outOfStockVariants = realVariants.filter(
    item => safeNumber(item.variant.stock) <= 0
  );

  let visibleVariants = 6;
  let visibleOutOfStock = 6;

  function renderVariants() {

    const visibleInStock =
      inStockVariants.slice(0, visibleVariants);

    const visibleOutStock =
      outOfStockVariants.slice(0, visibleOutOfStock);

    variantContainer.innerHTML = `
      <h4 class="variant-title">
        ${product.variantTitle || "Variation"}
      </h4>

      <div class="variant-options variant-instock">

        ${visibleInStock.map(({ variant, originalIndex }) => `
          <button
            type="button"
            class="variant-btn ${selectedVariant?.label === variant.label
        ? "active"
        : ""
      }"
            data-index="${originalIndex}"
          >
            ${variant.label}
          </button>
        `).join("")}

      </div>

      ${visibleVariants < inStockVariants.length ? `
        <div class="variant-load-more-wrap">
          <button
            type="button"
            id="loadMoreVariantsBtn"
            class="variant-load-more-btn"
          >
            Load More Variants
          </button>
        </div>
      ` : ""}

      ${outOfStockVariants.length ? `
        <div class="variant-outstock-group">

          <div class="variant-outstock-title">
            Out of Stock
          </div>

          <div class="variant-options variant-outstock">

            ${visibleOutStock.map(({ variant, originalIndex }) => `
              <button
                type="button"
                class="variant-btn out-of-stock"
                data-index="${originalIndex}"
              >
                ${variant.label}
              </button>
            `).join("")}

          </div>

          ${visibleOutOfStock < outOfStockVariants.length ? `
            <div class="variant-load-more-wrap">
              <button
                type="button"
                id="loadMoreOutOfStockBtn"
                class="variant-load-more-btn variant-load-more-outstock"
              >
                Load More Out of Stock
              </button>
            </div>
          ` : ""}

        </div>
      ` : ""}
    `;

    variantContainer
      .querySelectorAll(".variant-btn")
      .forEach(button => {

        button.addEventListener("click", function () {

          const variant =
            variants[Number(this.dataset.index)];

          if (!variant) return;

          if (safeNumber(variant.stock) <= 0) {
            showOutOfStockAlert();
            return;
          }

          selectedVariant = variant;

          if (window.innerWidth <= 768) {
            openVariantPopup();
            return;
          }

          variantContainer
            .querySelectorAll(".variant-btn")
            .forEach(btn =>
              btn.classList.remove("active")
            );

          this.classList.add("active");

          updateVariantUI(variant);
        });
      });

    document
      .getElementById("loadMoreVariantsBtn")
      ?.addEventListener("click", () => {

        visibleVariants += 6;
        renderVariants();
      });

    document
      .getElementById("loadMoreOutOfStockBtn")
      ?.addEventListener("click", () => {

        visibleOutOfStock += 6;
        renderVariants();
      });
  }

  selectedVariant = null;

  renderVariants();
}

function updateVariantUI(variant) {
  const price = safeNumber(variant.price);
  const discount = safeNumber(variant.discountPrice);
  const finalPrice = discount > 0 && discount < price ? discount : price;
  const percent = discount > 0 && discount < price
    ? Math.round(((price - discount) / price) * 100)
    : 0;

  document.getElementById("productPrice").textContent = formatPrice(finalPrice);
  document.getElementById("productOldPrice").textContent = percent ? formatPrice(price) : "";
  document.getElementById("discountBadge").textContent = percent ? `-${percent}%` : "";
  document.getElementById("stockText").textContent =
    safeNumber(variant.stock) > 0 ? `Stock: ${variant.stock} available` : "Out of stock";

  if (variant.image) {
    document.getElementById("productImg").src = variant.image;
  }

  quantityInput.max = safeNumber(variant.stock);
  quantityInput.value = safeNumber(variant.stock) > 0 ? 1 : 0;

  updateOutOfStockDisplay(variant.stock);
}

function showOutOfStockAlert() {
  let popup =
    document.getElementById("outStockPopup");

  if (!popup) {
    popup = document.createElement("div");
    popup.id = "outStockPopup";
    popup.className = "out-stock-popup";

    popup.innerHTML = `
      <div class="out-stock-popup-box">
        <div class="out-stock-popup-icon">
          ⚠️
        </div>

        <h3>Currently Out of Stock</h3>

        <p>
          Sorry, this product is currently unavailable.
          Please check again later or browse our other available products.
        </p>

        <div class="out-stock-popup-note">
          We are working to restock this item as soon as possible.
        </div>

        <div class="out-stock-popup-actions">
          <button
            type="button"
            class="out-stock-popup-close"
            onclick="closeOutOfStockAlert()"
          >
            Close
          </button>

          <button
            type="button"
            class="out-stock-popup-shop"
            onclick="window.location.href='../index.html'"
          >
            Browse Products
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(popup);

    popup.addEventListener("click", (event) => {
      if (event.target === popup) {
        closeOutOfStockAlert();
      }
    });
  }

  requestAnimationFrame(() => {
    popup.classList.add("show");
  });
}

function closeOutOfStockAlert() {
  const popup =
    document.getElementById("outStockPopup");

  if (!popup) return;

  popup.classList.remove("show");
}

function updateOutOfStockDisplay(stock) {
  const isOutOfStock = safeNumber(stock) <= 0;

  const productContainer =
    document.querySelector(".product-container");

  const mobileBottomNav =
    document.querySelector(".mobile-bottom-nav");

  const buyNowButton =
    document.getElementById("buyNowBtn");

  productContainer?.classList.toggle(
    "is-out-of-stock",
    isOutOfStock
  );

  mobileBottomNav?.classList.toggle(
    "product-out-of-stock",
    isOutOfStock
  );

  if (addToCartBtn) {
    addToCartBtn.disabled = false;

    addToCartBtn.textContent = isOutOfStock
      ? "Out of Stock"
      : "🛒 Add to Cart";
  }

  if (buyNowButton) {
    buyNowButton.disabled = false;

    buyNowButton.textContent = isOutOfStock
      ? "Out of Stock"
      : "⚡ Buy Now";
  }

  if (quantityInput) {
    quantityInput.disabled = isOutOfStock;

    if (isOutOfStock) {
      quantityInput.value = 0;
    }
  }

  plusBtn?.toggleAttribute("disabled", isOutOfStock);
  minusBtn?.toggleAttribute("disabled", isOutOfStock);
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatPrice(value) {
  return `₱${safeNumber(value).toLocaleString()}`;
}

function getVariants(product) {
  return Array.isArray(product?.variants) ? product.variants : [];
}

function getBestVariant(product) {
  const variants = getVariants(product);
  if (!variants.length) return null;

  const inStock = variants.find(v => safeNumber(v.stock) > 0);
  return inStock || variants[0];
}

function getProductStock(product) {
  const variants = getVariants(product);

  if (variants.length) {
    return variants.reduce((sum, v) => sum + safeNumber(v.stock), 0);
  }

  return safeNumber(product?.stock);
}

function getProductPrice(product) {
  const variant = getBestVariant(product);

  const price = variant ? safeNumber(variant.price) : safeNumber(product?.price);
  const discount = variant ? safeNumber(variant.discountPrice) : safeNumber(product?.discountPrice);

  return discount > 0 && discount < price ? discount : price;
}

function getProductImage(product) {
  const variant = getBestVariant(product);

  return (
    variant?.image ||
    product?.image ||
    "https://via.placeholder.com/500x400?text=No+Image"
  );
}

function getProductGallery(product) {
  const gallery = Array.isArray(product?.gallery)
    ? product.gallery
    : [];

  const mainImage =
    product?.image ||
    getProductImage(product);

  return [mainImage, ...gallery]
    .filter(Boolean)
    .filter((img, index, arr) => arr.indexOf(img) === index)
    .slice(0, 5);
}

function findProduct() {
  if (productId) {
    const found = products.find(p => String(p.id) === String(productId));
    if (found) return found;
  }

  const selected = JSON.parse(localStorage.getItem("selectedProduct") || "null");
  if (selected) return selected;

  return products[0] || null;
}

let product = null;

async function loadProductsFromSupabase() {

  showLoading();

  setProductActionsLoading(true);

  const { data, error } = await supabaseClient
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {

    console.log("PRODUCT ERROR:", error);

    setProductActionsLoading(false);
    hideLoading();

    products = [];
    renderHomepageProducts(products);

    return;
  }

  products = (data || []).map((item) => {


    const firstVariation =
      Array.isArray(item.variations) && item.variations.length
        ? item.variations[0]
        : {};

    const mainPrice = safeNumber(
      item.price || firstVariation.price,
      0
    );

    const mainDiscount = safeNumber(
      item.discount_price ||
      item.discountPrice ||
      firstVariation.discountPrice ||
      firstVariation.discount_price ||
      0,
      0
    );

    const variants =
      item.variations && item.variations.length
        ? item.variations.map((variant) => ({
          ...variant,
          discountPrice:
            variant.discountPrice ||
            variant.discount_price ||
            item.discount_price ||
            item.discountPrice ||
            0
        }))
        : [
          {
            label: "Default",
            price: mainPrice,
            discountPrice: mainDiscount,
            stock: item.stock,
            sold_count: item.sold_count || 0,
            image: item.image
          }
        ];


    return {

      weight: safeNumber(item.weight || firstVariation.weight, 0),
      length: safeNumber(item.length || firstVariation.length, 0),
      width: safeNumber(item.width || firstVariation.width, 0),
      height: safeNumber(item.height || firstVariation.height, 0),
      allow_cod: item.allow_cod,
      id: item.id,
      name: item.title,
      brand: item.brand || "",
      category: item.category,
      description: item.description,
      variantTitle: item.variant_title || "Variation",
      variants,
      image: item.image,
      gallery: Array.isArray(item.gallery) ? item.gallery : [],
      price: mainPrice,
      discountPrice: mainDiscount,
      stock: item.stock,
      sold_count: item.sold_count || 0,
      average_rating: item.average_rating || 4.8
    };
  });

  product = findProduct();

  if (!product) {

    document.querySelector(".product-container").innerHTML = `
      <div>
        <h2>Product not found</h2>
        <p>No product data found.</p>
      </div>
    `;

    hideLoading();
    setProductActionsLoading(false);

    return;
  }

  renderProduct();
  await initializeWishlist();
  renderSuggestedProducts();
  initLazyImages();
  loadProductVouchers();
  updateCartCount();
  setProductActionsLoading(false);
  hideLoading();

  if (typeof fbq !== "undefined") {
    fbq("track", "ViewContent", {
      content_ids: [product.id],
      content_name: product.name,
      content_type: "product",
      value: Number(getProductPrice(product)),
      currency: "PHP"
    });
  }
}

loadProductsFromSupabase();

function renderProduct() {
  const stock = getProductStock(product);

  document.getElementById("productName").textContent =
    product.name || "Unnamed Product";

  setTimeout(updateTitleToggle, 0);

  const variant = getBestVariant(product);

  let price = variant ? variant.price : product.price;
  let discount = variant ? variant.discountPrice : product.discountPrice;

  let finalPrice = price;
  let percent = 0;

  if (discount && discount < price) {
    finalPrice = discount;
    percent = Math.round(((price - discount) / price) * 100);
  }

  document.getElementById("productPrice").textContent =
    formatPrice(finalPrice);

  document.getElementById("productOldPrice").textContent =
    percent ? formatPrice(price) : "";

  document.getElementById("discountBadge").textContent =
    percent ? `-${percent}%` : "";

  document.getElementById("stockText").textContent =
    stock > 0
      ? `Stock: ${stock} available`
      : "Out of stock";

  const codNotice =
    document.getElementById("codNotice");

  const codAvailable =
    document.getElementById("codAvailable");

  if (codNotice && codAvailable) {

    if (product.allow_cod === false) {
      codNotice.style.display = "block";
      codAvailable.style.display = "none";
    } else {
      codNotice.style.display = "none";
      codAvailable.style.display = "block";
    }

  }

  renderProductGallery();

  initLazyImages();

  const descEl =
    document.getElementById("productDescription") ||
    document.querySelector(".description");

  if (descEl) {
    descEl.textContent =
      product.description || "No description available.";
  }

  renderVariantSelector();

  document.title =
    `${product.name} | Drin Electronics`;

  document
    .querySelector('meta[property="og:title"]')
    ?.setAttribute("content", product.name);

  document
    .querySelector('meta[property="og:description"]')
    ?.setAttribute(
      "content",
      product.description || "Quality electronic products."
    );

  document
    .querySelector('meta[property="og:image"]')
    ?.setAttribute(
      "content",
      getProductImage(product)
    );

  document
    .querySelector('meta[property="og:url"]')
    ?.setAttribute(
      "content",
      window.location.href
    );

  quantityInput.max = stock;

  updateOutOfStockDisplay(stock);

  loadProductReviews();
  loadProductSoldCount();

}

function renderProductGallery() {
  const imageBox = document.querySelector(".product-image");
  if (!imageBox) return;

  const images = getProductGallery(product);
  let currentIndex = 0;

  imageBox.innerHTML = `
    <div class="product-gallery-slider">
      <button type="button" class="gallery-nav prev" id="galleryPrevBtn">‹</button>

     <img id="productImg"
     class="lazy-image"
     data-src="${images[0] || ""}"
     src=""
     alt="Product Image" />

      <button type="button" class="gallery-nav next" id="galleryNextBtn">›</button>
    </div>

    <div class="product-thumbnails">
      ${images.map((img, index) => `
        <button
          type="button"
          class="product-thumb ${index === 0 ? "active" : ""}"
          data-index="${index}"
        >
          <img src="${img}" />
        </button>
      `).join("")}
    </div>
  `;



  let galleryTimer = null;
  let galleryRequest = 0;

  function showImage(index) {
    const img = document.getElementById("productImg");

    if (!img || !images.length) return;
    if (index < 0 || index >= images.length) return;
    if (index === currentIndex && img.src) return;

    clearTimeout(galleryTimer);

    const requestId = ++galleryRequest;
    const nextSrc = images[index];

    currentIndex = index;

    imageBox.querySelectorAll(".product-thumb").forEach((thumb, i) => {
      thumb.classList.toggle("active", i === index);
    });

    const preload = new Image();

    preload.onload = () => {
      if (requestId !== galleryRequest) return;

      img.style.transform = "none";
      img.style.opacity = "0";

      galleryTimer = setTimeout(() => {
        if (requestId !== galleryRequest) return;

        img.src = nextSrc;

        requestAnimationFrame(() => {
          img.style.opacity = "1";
        });
      }, 160);
    };

    preload.onerror = () => {
      if (requestId !== galleryRequest) return;

      img.src = nextSrc;
      img.style.transform = "none";
      img.style.opacity = "1";
    };

    preload.src = nextSrc;
  }



  imageBox.querySelectorAll(".product-thumb").forEach((btn) => {

    // CLICK OR TAP
    btn.addEventListener("click", function () {
      showImage(Number(this.dataset.index));
    });

    // AUTO CHANGE WHEN MOUSE HOVERS
    btn.addEventListener("mouseenter", function () {
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        return;
      }

      showImage(Number(this.dataset.index));
    });

    // KEYBOARD FOCUS
    btn.addEventListener("focus", function () {
      showImage(Number(this.dataset.index));
    });

  });


  document.getElementById("galleryPrevBtn")?.addEventListener("click", () => {
    const prevIndex = currentIndex <= 0 ? images.length - 1 : currentIndex - 1;
    showImage(prevIndex);
  });

  document.getElementById("galleryNextBtn")?.addEventListener("click", () => {
    const nextIndex = currentIndex >= images.length - 1 ? 0 : currentIndex + 1;
    showImage(nextIndex);
  });


  // SMOOTH MOBILE GALLERY SWIPE

  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;

  const slider = imageBox.querySelector(".product-gallery-slider");


  slider?.addEventListener("click", (e) => {

    if (e.target.closest(".gallery-nav")) return;


    const modal = document.getElementById("productZoomModal");
    const zoomImage = document.getElementById("productZoomImage");
    const mainImage = document.getElementById("productImg");

    if (!modal || !zoomImage || !mainImage) return;

    const imageUrl =
      mainImage.getAttribute("src") ||
      mainImage.getAttribute("data-src");

    if (!imageUrl) return;

    zoomImage.src = imageUrl;
    zoomImage.style.transform = "none";

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  });


  slider?.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = true;
  }, { passive: true });

  slider?.addEventListener("touchend", (e) => {
    if (!isSwiping) return;

    isSwiping = false;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const distanceX = touchEndX - touchStartX;
    const distanceY = touchEndY - touchStartY;

    // Ignore vertical scrolling
    if (Math.abs(distanceY) > Math.abs(distanceX)) return;

    // Ignore very short swipes
    if (Math.abs(distanceX) < 40) return;

    if (distanceX < 0) {
      // Swipe left
      showImage((currentIndex + 1) % images.length);
    } else {
      // Swipe right
      showImage((currentIndex - 1 + images.length) % images.length);
    }
  }, { passive: true });



}


function getCart() {
  return JSON.parse(localStorage.getItem("drinCart")) || [];
}

function saveCart(cartData) {
  localStorage.setItem("drinCart", JSON.stringify(cartData));
}

function updateCartCount() {
  const cartData = getCart();
  const totalQty = cartData.reduce((sum, item) => sum + safeNumber(item.quantity), 0);

  const cartCount = document.getElementById("cartCount");
  const mobileCartCount = document.getElementById("mobileCartCount");

  if (cartCount) cartCount.textContent = totalQty;
  if (mobileCartCount) mobileCartCount.textContent = totalQty;
}

const MAX_CART_QTY = 50;

function validateQuantity() {
  const stock = getProductStock(product);
  let qty = parseInt(quantityInput.value);

  if (isNaN(qty) || qty < 1) qty = 1;
  const maxQty =
    Math.min(stock, MAX_CART_QTY);

  if (qty > maxQty)
    qty = maxQty;

  quantityInput.value = qty;
  return qty;
}

plusBtn.addEventListener("click", () => {
  const stock = getProductStock(product);
  let qty = validateQuantity();

  if (qty < stock) {
    quantityInput.value = qty + 1;
  } else {
    showMessage("Maximum stock reached.", "error");
  }
});

minusBtn.addEventListener("click", () => {
  let qty = validateQuantity();

  if (qty > 1) {
    quantityInput.value = qty - 1;
  }
});

quantityInput.addEventListener("input", validateQuantity);

addToCartBtn.addEventListener("click", () => {
  if (productsLoading) return;

  const stock = getProductStock(product);

  if (stock <= 0) {
    showOutOfStockAlert();
    return;
  }

  const qty = validateQuantity();

  const variants = getVariants(product)
    .slice()
    .sort((a, b) => {
      const aOutOfStock = safeNumber(a.stock) <= 0 ? 1 : 0;
      const bOutOfStock = safeNumber(b.stock) <= 0 ? 1 : 0;

      return aOutOfStock - bOutOfStock;
    });

  if (variants.length > 1 && window.innerWidth <= 768) {
    openVariantPopup();
    return;
  }

  if (
    variants.length > 1 &&
    !selectedVariant
  ) {
    if (window.innerWidth <= 768) {
      openVariantPopup();
    } else {
      showMessage(
        `Please select ${product.variantTitle || "variation"}.`,
        "error"
      );

      variantContainer?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }

    return;
  }

  let cartData = getCart();

  const selectedVariantLabel = selectedVariant?.label || "";

  const selectedStock = selectedVariant
    ? safeNumber(selectedVariant.stock)
    : stock;

  const selectedPrice = selectedVariant
    ? (
      safeNumber(selectedVariant.discountPrice) > 0
        ? safeNumber(selectedVariant.discountPrice)
        : safeNumber(selectedVariant.price)
    )
    : getProductPrice(product);

  const selectedImage =
    selectedVariant?.image ||
    getProductImage(product);

  const existingItem = cartData.find(item =>
    String(item.id) === String(product.id) &&
    String(item.variantLabel || "") === String(selectedVariantLabel)
  );

  const parcelSource =
    selectedVariant ||
    getBestVariant(product) ||
    product;

  if (existingItem) {
    const newQty = safeNumber(existingItem.quantity) + qty;

    existingItem.image = selectedImage;
    existingItem.variant_image = selectedImage;
    existingItem.product_image = product.image;
    existingItem.stock = selectedStock;
    existingItem.selected = true;

    if (newQty > selectedStock) {
      existingItem.quantity = selectedStock;
      showMessage("Cart updated to maximum available stock.", "error");
    } else {
      existingItem.quantity = newQty;
      showMessage("Quantity added to cart!", "success");
    }

  } else {
    cartData.push({

      allow_cod: product.allow_cod,
      weight: Number(parcelSource.weight ?? product.weight ?? 0.01),
      length: Number(parcelSource.length ?? product.length ?? 1),
      width: Number(parcelSource.width ?? product.width ?? 1),
      height: Number(parcelSource.height ?? product.height ?? 1),

      id: product.id,
      name: product.name,
      variantLabel: selectedVariantLabel,
      price: selectedPrice,

      image: selectedImage,
      variant_image: selectedImage,
      product_image: product.image,

      stock: selectedStock,
      quantity: qty,
      selected: true
    });

    showMessage("Product added to cart!", "success");
  }

  saveCart(cartData);
  updateCartCount();

  if (typeof fbq !== "undefined") {
    fbq("track", "AddToCart", {
      content_ids: [product.id],
      content_name: product.name,
      content_type: "product",
      value: Number(selectedPrice * qty),
      currency: "PHP"
    });
  }

  if (
    document.getElementById("cartToast")
      ?.dataset.type !== "error"
  ) {

    setTimeout(() => {
      animateToCart();
    }, 120);

  }
});

const buyNowBtn =
  document.getElementById("buyNowBtn");

buyNowBtn?.addEventListener("click", () => {

  if (productsLoading) return;

  const stock =
    getProductStock(product);

  if (stock <= 0) {
    showOutOfStockAlert();
    return;
  }

  const qty =
    validateQuantity();

  const variants =
    getVariants(product);

  if (variants.length > 1 && !selectedVariant) {

    showMessage(
      `Please select ${product.variantTitle || "variation"}.`,
      "error"
    );

    variantContainer?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    return;
  }

  const checkoutItem = {
    allow_cod: product.allow_cod,
    id: product.id,
    name: product.name,
    variantLabel: selectedVariant?.label || "",
    price: selectedVariant
      ? (
        safeNumber(selectedVariant.discountPrice) > 0
          ? safeNumber(selectedVariant.discountPrice)
          : safeNumber(selectedVariant.price)
      )
      : getProductPrice(product),

    image: selectedVariant?.image || getProductImage(product),
    product_image: product.image,
    variant_image: selectedVariant?.image || getProductImage(product),

    stock: selectedVariant
      ? safeNumber(selectedVariant.stock)
      : stock,

    quantity: qty,
    selected: true,

    weight: selectedVariant?.weight || product.weight || 0.5,
    length: selectedVariant?.length || product.length || 10,
    width: selectedVariant?.width || product.width || 10,
    height: selectedVariant?.height || product.height || 10
  };

  let cartData = getCart();

  const existingItem = cartData.find(item =>
    String(item.id) === String(product.id) &&
    String(item.variantLabel || "") === String(selectedVariant?.label || "")
  );

  if (existingItem) {

    existingItem.quantity =
      safeNumber(existingItem.quantity) + qty;

    existingItem.selected = true;

    existingItem.weight = checkoutItem.weight;
    existingItem.length = checkoutItem.length;
    existingItem.width = checkoutItem.width;
    existingItem.height = checkoutItem.height;

  } else {

    cartData.push(checkoutItem);

  }

  saveCart(cartData);

  updateCartCount();

  if (typeof fbq !== "undefined") {
    fbq("track", "AddToCart", {
      content_ids: [product.id],
      content_name: product.name,
      content_type: "product",
      value: Number(checkoutItem.price * qty),
      currency: "PHP"
    });
  }

  window.location.href =
    "../Cart/index.html";

});

function showMessage(text, type) {
  const toast = document.getElementById("cartToast");

  if (window.innerWidth > 768) {

    const btn =
      document.activeElement?.id === "wishlistBtn"
        ? document.getElementById("wishlistBtn")
        : document.getElementById("addToCartBtn");

    if (btn && toast) {

      const rect = btn.getBoundingClientRect();

      toast.style.position = "fixed";

      toast.style.left =
        (rect.left + rect.width / 2) + "px";

      toast.style.top =
        (rect.bottom + 10) + "px";

      toast.style.transform =
        "translateX(-50%)";
    }

  }

  if (toast) {

    toast.textContent = text;

    toast.classList.add("show");

    toast.classList.toggle(
      "success",
      type === "success"
    );

    toast.classList.toggle(
      "error",
      type === "error"
    );
    toast.dataset.type = type;

    setTimeout(() => {

      toast.classList.remove(
        "show",
        "success",
        "error"
      );

    }, 2500);

    return;
  }

  message.textContent = text;
  message.style.color = type === "success" ? "#16a34a" : "#dc2626";

  setTimeout(() => {
    message.textContent = "";
  }, 2500);
}

let suggestedLimit = 10;
function renderSuggestedProducts() {
  const container = document.getElementById("suggestedProducts");
  if (!container) return;

  const shuffledProducts = products
    .filter(p => {

      if (String(p.id) === String(product.id)) {
        return false;
      }

      return getProductStock(p) > 0;

    })
    .sort(() => Math.random() - 0.5);

  const list = shuffledProducts.slice(0, suggestedLimit);

  if (!list.length) {
    container.innerHTML = `
      <div class="suggested-card">
        <h3>No suggested products yet</h3>
        <p>Add more products in admin.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(item => `
  <div class="homepage-product-card" onclick="openSuggestedProduct('${item.id}')">
    
    <div class="homepage-product-image">
     <img
  class="lazy-image"
  data-src="${item.image || 'https://via.placeholder.com/500x400?text=No+Image'}"
  src=""
  alt="${item.name}">
    </div>
    
<div class="homepage-product-info">

    <h3>${item.name}</h3>

<div class="product-rating">
  <span class="rating-stars">★★★★★</span>
  <span class="rating-text">${item.average_rating || 4.8}</span>
</div>

<div class="homepage-product-pricing">
  ${renderSuggestedPrice(item)}
</div>

      <span class="homepage-product-stock">
        Stock: ${getProductStock(item)}
      </span>
    </div>

  </div>
`).join("");

  const hasMore =
    products.filter(p => {

      if (String(p.id) === String(product.id)) {
        return false;
      }

      return getProductStock(p) > 0;

    }).length > suggestedLimit;

  if (hasMore) {

    container.innerHTML += `

      <div class="suggested-loadmore-wrap">

        <button
          class="suggested-loadmore-btn"
          onclick="loadMoreSuggestedProducts()">

          Load More

        </button>

      </div>
    `;
  }
}

function renderSuggestedPrice(item) {
  const variant = getBestVariant(item);

  const price = variant
    ? safeNumber(variant.price)
    : safeNumber(item.price);

  const discount = variant
    ? safeNumber(variant.discountPrice)
    : safeNumber(item.discountPrice);

  if (discount > 0 && discount < price) {
    return `
      <span class="current-price">${formatPrice(discount)}</span>
      <span class="old-price">${formatPrice(price)}</span>
    `;
  }

  return `
    <span class="current-price">${formatPrice(price)}</span>
  `;
}

function openSuggestedProduct(id) {

  const selected =
    products.find(
      p => String(p.id) === String(id)
    );

  if (selected) {

    localStorage.setItem(
      "selectedProduct",
      JSON.stringify(selected)
    );

    localStorage.setItem(
      "selectedProductId",
      selected.id
    );
  }

  window.location.href =
    `index.html?id=${encodeURIComponent(id)}`;
}

// ===== SIDEBAR MENU FIX =====
const menuBtn = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");

function openSidebar() {
  sidebar.classList.add("active");
  overlay.classList.add("active");
}

function closeSidebar() {
  sidebar.classList.remove("active");
  overlay.classList.remove("active");
}

if (menuBtn) {
  menuBtn.addEventListener("click", openSidebar);
}

if (overlay) {
  overlay.addEventListener("click", closeSidebar);
}

// TITLE TOGGLE - SHOW ONLY IF MORE THAN 2 LINES
const title = document.getElementById("productName");
const titleToggle = document.getElementById("titleToggle");

function updateTitleToggle() {
  if (!title || !titleToggle) return;

  title.classList.remove("expanded");
  title.style.webkitLineClamp = "2";

  requestAnimationFrame(() => {
    const isOverflowing =
      title.scrollHeight > title.clientHeight + 2;

    titleToggle.style.display =
      isOverflowing ? "block" : "none";

    titleToggle.textContent = "Read more";
  });
}


if (title && titleToggle) {

  titleToggle.addEventListener("click", () => {

    const expanded =
      title.classList.toggle("expanded");

    title.style.webkitLineClamp =
      expanded ? "unset" : "2";

    titleToggle.textContent =
      expanded ? "Show less" : "Read more";
  });

  updateTitleToggle();

  window.addEventListener(
    "resize",
    updateTitleToggle
  );
}

// DESCRIPTION TOGGLE
const desc = document.getElementById("productDescription");
const descToggle = document.getElementById("descToggle");

descToggle.textContent = "Read more";

if (desc && descToggle) {
  descToggle.addEventListener("click", () => {
    desc.classList.toggle("description-limit");
    descToggle.textContent = desc.classList.contains("description-limit")
      ? "Read more"
      : "Show less";
  });
}

async function loadProductVouchers() {

  const voucherList = document.getElementById("voucherList");
  const voucherSection = document.querySelector(".voucher-section");

  if (!voucherList) return;

  const { data, error } = await supabaseClient
    .from("vouchers")
    .select("*")
    .eq("is_active", true)
    .eq("voucher_type", "regular")
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    voucherList.innerHTML = "";
    if (voucherSection) voucherSection.style.display = "none";
    return;
  }

  if (voucherSection) voucherSection.style.display = "block";

  voucherList.innerHTML = data.map((voucher, index) => {

    const amount = Number(voucher.discount_amount || 0).toLocaleString();

    const minSpend = Number(voucher.min_spend || 0).toLocaleString();

    const code = voucher.code || "DRIN";

    return `
      <div class="voucher-card ${index === 0 ? "active" : ""}">
        
        <strong>₱${amount} OFF</strong>

        <span>Min. spend ₱${minSpend}</span>

        <button onclick="claimProductVoucher('${code}', this)">
          Claim
        </button>

      </div>
    `;
  }).join("");

  enableVoucherDragSwipe();

}

async function claimProductVoucher(code, btn) {

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  if (!user) {

    showPremiumLoginPopup();
    return;

  }

  localStorage.setItem(
    "claimedVoucherCode",
    code
  );

  document.querySelectorAll(".voucher-card")
    .forEach(card => card.classList.remove("active"));

  btn.closest(".voucher-card")
    .classList.add("active");

  const claimBtn =
    btn.querySelector("button");

  if (claimBtn) {

    claimBtn.innerHTML =
      "✅ Claimed";

    claimBtn.disabled = true;

    claimBtn.classList.add(
      "voucher-claimed"
    );

    claimBtn.style.transform =
      "scale(.96)";

    setTimeout(() => {

      claimBtn.style.transform =
        "scale(1)";

    }, 180);

  }

  showVoucherToast(
    "✅ Voucher Claimed Successfully"
  );
}

// DESKTOP + MOBILE VOUCHER DRAG SWIPE
function enableVoucherDragSwipe() {
  const slider = document.getElementById("voucherList");
  if (!slider) return;

  let isDown = false;
  let startX;
  let scrollLeft;

  slider.addEventListener("mousedown", (e) => {
    isDown = true;
    slider.classList.add("dragging");
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
  });

  slider.addEventListener("mouseleave", () => {
    isDown = false;
    slider.classList.remove("dragging");
  });

  slider.addEventListener("mouseup", () => {
    isDown = false;
    slider.classList.remove("dragging");
  });

  slider.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();

    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 1.5;

    slider.scrollLeft = scrollLeft - walk;
  });
}

function scrollVoucher(direction) {

  const voucherList = document.getElementById("voucherList");

  if (!voucherList) return;

  const scrollAmount = 300;

  voucherList.scrollBy({
    left: direction * scrollAmount,
    behavior: "smooth"
  });
}


/* VOUCHER DESKTOP POSITION + CLICK TOGGLE */

const voucherSectionEl = document.querySelector(".voucher-section");
const desktopVoucherSlotEl = document.getElementById("desktopVoucherSlot");

if (voucherSectionEl && desktopVoucherSlotEl) {

  const voucherOriginalPosition = document.createComment(
    "ORIGINAL VOUCHER POSITION"
  );

  voucherSectionEl.parentNode.insertBefore(
    voucherOriginalPosition,
    voucherSectionEl
  );


  function moveVoucherByScreen() {
    const isDesktop = window.innerWidth > 768;

    if (isDesktop) {
      desktopVoucherSlotEl.appendChild(voucherSectionEl);
    } else {
      voucherOriginalPosition.parentNode.insertBefore(
        voucherSectionEl,
        voucherOriginalPosition.nextSibling
      );
    }

    const voucherToggle = document.getElementById("voucherToggle");
    const voucherPanel = document.getElementById("voucherPanel");

    if (voucherToggle && voucherPanel) {
      if (isDesktop) {
        voucherPanel.hidden = true;
        voucherToggle.textContent = "🎟 View Vouchers ▾";
        voucherToggle.setAttribute("aria-expanded", "false");
      } else {
        voucherPanel.hidden = false;
        voucherToggle.setAttribute("aria-expanded", "true");
      }
    }
  }


  moveVoucherByScreen();

  window.addEventListener("resize", moveVoucherByScreen);
}

const voucherToggleButton = document.getElementById("voucherToggle");
const voucherPanelElement = document.getElementById("voucherPanel");

if (voucherToggleButton && voucherPanelElement) {

  voucherToggleButton.addEventListener("click", () => {
    const isOpening = voucherPanelElement.hidden;

    voucherPanelElement.hidden = !isOpening;

    voucherToggleButton.setAttribute(
      "aria-expanded",
      String(isOpening)
    );

    voucherToggleButton.textContent = isOpening
      ? "🎟 Hide Vouchers ▴"
      : "🎟 View Vouchers ▾";
  });

}


/* MOVE COD BESIDE PRICE ON DESKTOP ONLY */

const codBadgeForDesktop = document.getElementById("codAvailable");
const desktopCodDestination = document.getElementById("desktopCodSlot");

if (codBadgeForDesktop && desktopCodDestination) {

  const originalCodMarker = document.createComment(
    "ORIGINAL COD POSITION"
  );

  codBadgeForDesktop.parentNode.insertBefore(
    originalCodMarker,
    codBadgeForDesktop
  );

  function updateCodBadgeLocation() {

    if (window.innerWidth > 768) {

      if (codBadgeForDesktop.parentNode !== desktopCodDestination) {
        desktopCodDestination.appendChild(codBadgeForDesktop);
      }

    } else {

      if (codBadgeForDesktop.previousSibling !== originalCodMarker) {
        originalCodMarker.parentNode.insertBefore(
          codBadgeForDesktop,
          originalCodMarker.nextSibling
        );
      }

    }
  }

  updateCodBadgeLocation();

  window.addEventListener("resize", updateCodBadgeLocation);
}


const protectionToggle = document.getElementById("protectionToggle");
const protectionMore = document.getElementById("protectionMore");

if (protectionToggle && protectionMore) {
  protectionToggle.addEventListener("click", () => {
    protectionMore.classList.toggle("show");

    protectionToggle.textContent =
      protectionMore.classList.contains("show")
        ? "Show Less"
        : "Read More";
  });
}

let variantPopup;
let variantPopupOptions;

function openVariantPopup() {

  variantPopup =
    document.getElementById("variantPopup");

  variantPopupOptions =
    document.getElementById("variantPopupOptions");

  if (window.innerWidth > 768) return;

  const variants = getVariants(product);

  if (!variants.length) return;

  document.getElementById("variantPopupName").textContent =
    product.name;

  document.getElementById("variantPopupTitle").textContent =
    product.variantTitle || "Variation";

  document.getElementById("variantPopupImage").src =
    getProductImage(product);

  document.getElementById("variantPopupPrice").textContent =
    formatPrice(getProductPrice(product));

  document.getElementById("variantPopupStock").textContent =
    `Stock: ${getProductStock(product)}`;

  const inStockVariants = variants
    .map((variant, originalIndex) => ({
      variant,
      originalIndex
    }))
    .filter(item => safeNumber(item.variant.stock) > 0);

  let visiblePopupVariants = 6;

  function renderPopupVariants() {

    const visibleInStock =
      inStockVariants.slice(0, visiblePopupVariants);

    variantPopupOptions.innerHTML = `
    <div class="variant-popup-instock">

      ${visibleInStock.map(({ variant, originalIndex }) => `
        <button
          type="button"
          class="variant-popup-option"
          data-index="${originalIndex}"
        >
          ${variant.label}
        </button>
      `).join("")}

    </div>

    ${visiblePopupVariants < inStockVariants.length ? `
      <div class="variant-popup-loadmore-wrap">
        <button
          type="button"
          id="loadMorePopupVariantsBtn"
          class="variant-load-more-btn"
        >
          Load More Variants
        </button>
      </div>
    ` : ""}
  `;

    if (selectedVariant) {

      const selectedIndex = variants.findIndex(
        item => item.label === selectedVariant.label
      );

      const activeBtn =
        variantPopupOptions.querySelector(
          `[data-index="${selectedIndex}"]`
        );

      activeBtn?.classList.add("active");
    }

    variantPopupOptions
      .querySelectorAll(".variant-popup-option")
      .forEach((btn) => {

        btn.addEventListener("click", function () {

          const variant =
            variants[Number(this.dataset.index)];

          if (!variant) return;

          variantPopupOptions
            .querySelectorAll(".variant-popup-option")
            .forEach(item =>
              item.classList.remove("active")
            );

          this.classList.add("active");

          selectedVariant = variant;

          document.getElementById("variantPopupImage").src =
            variant.image || getProductImage(product);

          document.getElementById("variantPopupPrice").textContent =
            formatPrice(
              safeNumber(variant.discountPrice) > 0
                ? variant.discountPrice
                : variant.price
            );

          document.getElementById("variantPopupStock").textContent =
            `Stock: ${variant.stock}`;
        });
      });

    document
      .getElementById("loadMorePopupVariantsBtn")
      ?.addEventListener("click", () => {

        visiblePopupVariants += 6;

        renderPopupVariants();
      });
  }

  renderPopupVariants();

  variantPopup.classList.add("show");

}

function closeVariantPopup() {
  const popup = document.getElementById("variantPopup");
  if (!popup) return;

  popup.classList.remove("show");

  document
    .querySelectorAll(".variant-popup-option")
    .forEach(btn => btn.classList.remove("active"));
}

document
  .getElementById("closeVariantPopup")
  ?.addEventListener("click", closeVariantPopup);

document
  .getElementById("variantPopup")
  ?.addEventListener("click", (e) => {

    if (e.target.id === "variantPopup") {
      closeVariantPopup();
    }

  });

const popupQtyInput =
  document.getElementById("popupQtyInput");

document
  .getElementById("popupQtyPlus")
  ?.addEventListener("click", () => {

    let qty =
      Number(popupQtyInput.value) || 1;

    const maxStock =
      Math.min(
        selectedVariant
          ? safeNumber(selectedVariant.stock)
          : getProductStock(product),
        MAX_CART_QTY
      );

    if (qty < maxStock) {

      popupQtyInput.value = qty + 1;

    } else {

      showMessage("Quantity limit reached.", "error");

    }

  });

document
  .getElementById("popupQtyMinus")
  ?.addEventListener("click", () => {

    let qty =
      Number(popupQtyInput.value) || 1;

    if (qty > 1) {
      popupQtyInput.value = qty - 1;
    }

  });

document.addEventListener("click", (e) => {
  const btn = e.target.closest("#confirmVariantAdd");
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  if (!selectedVariant) {
    showMessage(`Please select ${product.variantTitle || "variation"}.`, "error");
    return;
  }

  const qty = Number(popupQtyInput.value) || 1;
  const stock = safeNumber(selectedVariant.stock);

  if (qty > stock) {
    showMessage("Quantity limit reached.", "error");
    return;
  }

  let cartData = getCart();

  const existingItem = cartData.find(item =>
    String(item.id) === String(product.id) &&
    item.variantLabel === selectedVariant.label
  );

  if (existingItem) {
    const newQty = safeNumber(existingItem.quantity) + qty;

    existingItem.weight = Number(selectedVariant?.weight ?? product.weight ?? 0.01);
    existingItem.length = Number(selectedVariant?.length ?? product.length ?? 1);
    existingItem.width = Number(selectedVariant?.width ?? product.width ?? 1);
    existingItem.height = Number(selectedVariant?.height ?? product.height ?? 1);

    if (newQty > stock) {
      existingItem.quantity = stock;
      showMessage("Cart updated to maximum available stock.", "error");
    } else {
      existingItem.quantity = newQty;
      showMessage("Quantity added to cart!", "success");
    }

  } else {
    cartData.push({

      allow_cod: product.allow_cod,

      id: product.id,
      name: product.name,
      variantLabel: selectedVariant.label,

      price: safeNumber(selectedVariant.discountPrice) > 0
        ? safeNumber(selectedVariant.discountPrice)
        : safeNumber(selectedVariant.price),

      image: selectedVariant.image || getProductImage(product),
      variant_image: selectedVariant.image || getProductImage(product),
      product_image: product.image,

      weight: Number(selectedVariant?.weight ?? product.weight ?? 0.01),
      length: Number(selectedVariant?.length ?? product.length ?? 1),
      width: Number(selectedVariant?.width ?? product.width ?? 1),
      height: Number(selectedVariant?.height ?? product.height ?? 1),

      stock: stock,
      quantity: qty,
      selected: true
    });

    showMessage("Product added to cart!", "success");
  }

  saveCart(cartData);
  updateCartCount();

  if (typeof fbq !== "undefined") {
    fbq("track", "AddToCart", {
      content_ids: [product.id],
      content_name: product.name,
      content_type: "product",
      value: Number(
        (
          safeNumber(selectedVariant.discountPrice) > 0
            ? safeNumber(selectedVariant.discountPrice)
            : safeNumber(selectedVariant.price)
        ) * qty
      ),
      currency: "PHP"
    });
  }

  closeVariantPopup();
  animateToCart();
});

document.getElementById("mobileCartBtn")
  ?.addEventListener("touchend", function (e) {

    e.preventDefault();
    e.stopPropagation();

    window.location.href = "../cart/cart.html";
  });

async function renderStoreBranding() {

  const mobileNavLogo =
    document.getElementById("mobileNavLogo");

  const navLogo =
    document.getElementById("navLogo");

  const navLogoFallback =
    document.getElementById("navLogoFallback");

  const { data, error } =
    await supabaseClient
      .from("store_settings")
      .select("logo_url, store_name")
      .limit(1)
      .maybeSingle();

  console.log("LOGO DATA:", data, error);

  if (error || !data?.logo_url) return;

  const logo =
    data?.logo_url ||
    "https://zdinvxowzpkolbfzpcac.supabase.co/storage/v1/object/public/product-images/logo.png";

  if (navLogo) {

    navLogo.src = logo + "?v=" + Date.now();

    navLogo.style.display = "block";
    navLogo.style.visibility = "visible";

    navLogo.onerror = () => {
      console.log("Logo failed to load");
    };

    console.log("FINAL LOGO:", navLogo.src);
  }

  if (mobileNavLogo) {

    mobileNavLogo.src = logo + "?v=" + Date.now();

    mobileNavLogo.style.display = "block";
    mobileNavLogo.style.visibility = "visible";
    mobileNavLogo.style.opacity = "1";

    mobileNavLogo.onerror = () => {
      console.log("Mobile logo failed to load");
    };

    console.log("FINAL MOBILE LOGO:", mobileNavLogo.src);
  }
}
renderStoreBranding();


renderDynamicSidebarCategories();

function smartBack(fallback = "../index.html") {
  sessionStorage.setItem("scrollTopOnBack", "1");

  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = fallback;
  }
}

function goHome() {
  window.location.href = "../index.html";
}

function renderDynamicSidebarCategories() {

  const sidebar =
    document.getElementById("dynamicSidebarCategories");

  if (!sidebar) return;

  const categories = [
    ...new Set(
      products
        .map(p => p.category)
        .filter(Boolean)
    )
  ];

  sidebar.innerHTML = `
    <li>
      <a href="../index.html">
        All Products
      </a>
    </li>

    ${categories.map(category => `
      <li>
        <a
          href="../index.html"
          onclick="
            localStorage.setItem(
              'selectedCategory',
              '${category}'
            );
          "
        >
          ${category}
        </a>
      </li>
    `).join("")}
  `;
}

const desktopSearchInput =
  document.getElementById("desktopSearchInput");

const desktopSearchBtn =
  document.getElementById("desktopSearchBtn");

function handleProductSearch() {

  const keyword =
    desktopSearchInput?.value
      .trim()
      .toLowerCase();

  if (!keyword) return;

  const filtered =
    products.filter(product => {

      return (
        String(product.name || "").toLowerCase().includes(keyword) ||
        String(product.category || "").toLowerCase().includes(keyword) ||
        String(product.description || "").toLowerCase().includes(keyword)
      );

    });

  renderSearchResults(filtered);
  document
    .getElementById("suggestedProducts")
    ?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
}

desktopSearchBtn?.addEventListener(
  "click",
  handleProductSearch
);

desktopSearchInput?.addEventListener(
  "keydown",
  (e) => {

    if (e.key === "Enter") {

      handleProductSearch();

    }

  }
);

function renderSearchResults(list) {

  const container =
    document.getElementById("suggestedProducts");

  if (!container) return;

  if (!list.length) {

    container.innerHTML = `
      <div class="suggested-card">
        <h3>No products found</h3>
      </div>
    `;

    return;
  }

  container.innerHTML = list.map(item => `
    <div
      class="homepage-product-card"
      onclick="openSuggestedProduct('${item.id}')"
    >

      <div class="homepage-product-image">
        <img
          src="${item.image || 'https://via.placeholder.com/500x400?text=No+Image'}"
          alt="${item.name}"
        >
      </div>

      <div class="homepage-product-info">

  <h3>${item.name}</h3>

  <div class="product-rating">
  <span class="rating-stars">★★★★★</span>
  <span class="rating-text">${item.average_rating || 4.8}</span>
</div>

  <div class="homepage-product-pricing">
     ${renderSuggestedPrice(item)}
  </div>

</div>

    </div>
  `).join("");
}

document
  .getElementById("clearSearchBtn")
  ?.addEventListener("click", () => {
    const input = document.getElementById("desktopSearchInput");

    if (input) {
      input.value = "";
      input.focus();
    }

    renderSuggestedProducts();
  });

const shareBtn =
  document.getElementById("shareBtn");

shareBtn?.addEventListener(
  "click",
  async () => {

    const shareData = {

      title: product.name,

      text:
        product.description ||
        "Check this product from Drin Electronics",

      url: `https://drinelectronicsph.com/.netlify/functions/product-og?id=${encodeURIComponent(product.id)}`
    };

    try {

      if (navigator.share) {

        await navigator.share(shareData);

      } else {

        await navigator.clipboard.writeText(
          window.location.href
        );

        showMessage(
          "Product link copied!",
          "success"
        );
      }

    } catch (err) {

      console.log(err);

    }

  }
);

/* PRODUCT PAGE VOUCHER TOAST */

function showVoucherToast(message) {

  let toast =
    document.getElementById(
      "voucherToast"
    );

  if (!toast) {

    toast =
      document.createElement("div");

    toast.id =
      "voucherToast";

    toast.className =
      "voucher-toast";

    document.body.appendChild(
      toast
    );

  }

  toast.textContent =
    message;

  toast.classList.add(
    "show"
  );

  setTimeout(() => {

    toast.classList.remove(
      "show"
    );

  }, 2200);

}

function loadMoreSuggestedProducts() {

  suggestedLimit += 10;

  renderSuggestedProducts();

  initLazyImages();

}

function showPremiumLoginPopup() {
  const existing = document.getElementById("premiumLoginPopup");
  if (existing) existing.remove();

  const popup = document.createElement("div");
  popup.id = "premiumLoginPopup";

  popup.innerHTML = `
    <div class="premium-login-overlay">
      <div class="premium-login-box">
        <div class="premium-login-icon">🔒</div>
        <h3>Login Required</h3>
        <p>Please login first to claim vouchers and enjoy member benefits.</p>

        <div class="premium-login-actions">
          
        <button class="premium-login-btn"
  onclick="window.location.href='https://drinelectronicsph.com/login/?redirect=' + encodeURIComponent(window.location.href)">
  Login Now
</button>

          <button class="premium-cancel-btn" onclick="closePremiumLoginPopup()">
            Cancel
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(popup);
}

function closePremiumLoginPopup() {
  document.getElementById("premiumLoginPopup")?.remove();
}

async function updateAuthUI() {

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  const accountBtn =
    document.getElementById("accountBtn");

  const profileDropdown =
    document.getElementById("profileDropdown") ||
    document.getElementById("accountDropdown");

  if (!accountBtn) return;

  if (user) {

    accountBtn.classList.add("logged-in");

    if (profileDropdown) {

      profileDropdown.innerHTML = `
      <a href="/homeprofile/">My Profile</a>
     <a href="javascript:void(0)" id="logoutBtn">Logout</a>
    `;

    }

  } else {

    accountBtn.classList.remove("logged-in");

    if (profileDropdown) {

      profileDropdown.innerHTML = `
      <a href="/login/?redirect=${encodeURIComponent(window.location.href)}">Login</a>
      <a href="/signup/">Signup</a>
    `;

    }

  }

}

window.addEventListener("load", async () => {
  await updateAuthUI();
});

let authInitialized = false;

supabaseClient.auth.onAuthStateChange(async (event) => {

  if (!authInitialized) {
    authInitialized = true;
    await updateAuthUI();
    return;
  }

  await updateAuthUI();

  if (event === "SIGNED_OUT") {
    localStorage.removeItem("drinUser");

    wishlistUser = null;
    updateWishlistButton(false);
    await updateAuthUI();
  }

});

function animateToCart() {

  const productImg =
    document.getElementById("cartToast");

  const cartIcon =
    document.querySelector(
      "#cartCount, #mobileCartCount"
    );

  if (!productImg || !cartIcon) return;

  const imgRect =
    productImg.getBoundingClientRect();

  const cartRect =
    cartIcon.getBoundingClientRect();

  const flyingImg =
    productImg.cloneNode(true);

  flyingImg.style.position = "fixed";

  flyingImg.style.left =
    imgRect.left + "px";

  flyingImg.style.top =
    imgRect.top + "px";

  flyingImg.style.width = "80px";
  flyingImg.style.height = "80px";

  flyingImg.style.objectFit = "cover";

  flyingImg.style.borderRadius = "12px";

  flyingImg.style.zIndex = "9999999";

  flyingImg.style.pointerEvents = "none";

  flyingImg.style.transition =
    "all 0.75s ease";

  document.body.appendChild(
    flyingImg
  );

  setTimeout(() => {

    flyingImg.style.left =
      cartRect.left + "px";

    flyingImg.style.top =
      cartRect.top + "px";

    flyingImg.style.width =
      "20px";

    flyingImg.style.height =
      "20px";

    flyingImg.style.opacity =
      "0.2";

  }, 20);

  setTimeout(() => {

    flyingImg.remove();

  }, 800);
}

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

function initLazyImages() {

  const images =
    document.querySelectorAll("img[data-src]");

  const observer =
    new IntersectionObserver((entries) => {

      entries.forEach(entry => {

        if (entry.isIntersecting) {

          const img = entry.target;

          img.src = img.dataset.src;

          img.onload = () => {
            img.classList.add("loaded");
          };

          observer.unobserve(img);
        }

      });

    });

  images.forEach(img => {
    observer.observe(img);
  });

}

async function logoutUser(event) {

  if (event) event.preventDefault();

  try {

    const { error } =
      await supabaseClient.auth.signOut();

    if (error) {
      console.log("LOGOUT ERROR:", error);
      alert("Logout failed.");
      return;
    }

  } catch (err) {
    console.log("LOGOUT ERROR:", err);
  }
}

document.addEventListener("click", function (e) {

  if (e.target.id === "logoutBtn") {
    logoutUser(e);
  }

});

function maskName(name) {
  if (!name) return "Anonymous";

  if (name.length <= 3) {
    return name[0] + "***";
  }

  return name.substring(0, 3) + "***";
}

async function loadProductReviews() {
  const { data, error } = await supabaseClient
    .from("product_reviews")
    .select("*")
    .eq("product_id", String(product.id));

  if (error) {
    console.log("REVIEWS ERROR:", error);
    return;
  }

  if (!data || !data.length) {
    const reviewsList =
      document.getElementById("productReviewsList");

    if (reviewsList) {
      reviewsList.innerHTML = `
      <div class="no-reviews-message">
        <div class="no-reviews-star">☆</div>
        <strong>No reviews yet</strong>
        <p>Be the first to review this product.</p>
      </div>
    `;
    }

    return;
  }

  const total =
    data.reduce((sum, r) => sum + Number(r.rating), 0);

  const avg =
    (total / data.length).toFixed(1);

  const stars =
    avg >= 5 ? "★★★★★" :
      avg >= 4 ? "★★★★☆" :
        avg >= 3 ? "★★★☆☆" :
          avg >= 2 ? "★★☆☆☆" : "★☆☆☆☆";

  document.getElementById("productStars").textContent = stars;
  document.getElementById("productRatingText").textContent = avg;

  const reviewsList =
    document.getElementById("productReviewsList");

  if (reviewsList) {

    let visibleReviews = 3;

    function renderReviews() {

      const reviewsToShow =
        data.slice(0, visibleReviews);

      reviewsList.innerHTML = `
      ${reviewsToShow.map(review => `
        <div class="review-card">

          <div class="review-stars">
            ${"★".repeat(Number(review.rating))}
          </div>

          ${review.comment ? `
            <p>${review.comment}</p>
          ` : ""}

          ${review.review_image ? `
            <img 
              src="${review.review_image}"
              class="review-image"
              onclick="openReviewImage('${review.review_image}')"
            >
          ` : ""}

          <small>
            ${maskName(review.customer_name)} • Verified Buyer
          </small>

        </div>
      `).join("")}

      ${visibleReviews < data.length ? `
        <div class="reviews-load-more-wrap">
          <button
            type="button"
            id="loadMoreReviewsBtn"
            class="reviews-load-more-btn"
          >
            Load More Reviews
          </button>
        </div>
      ` : ""}
    `;

      document
        .getElementById("loadMoreReviewsBtn")
        ?.addEventListener("click", () => {
          visibleReviews += 3;
          renderReviews();
        });
    }

    renderReviews();
  }
}

async function loadProductSoldCount() {
  const sold = Number(product.sold_count || 0);

  document.getElementById("productSoldCount").textContent =
    "Sold " + sold;
}

function openReviewImage(src) {
  document.getElementById("reviewImagePreview").src = src;
  document.getElementById("reviewImageModal")
    .classList.add("show");
}

function closeReviewImage() {
  document.getElementById("reviewImageModal")
    .classList.remove("show");
}

window.openReviewImage = openReviewImage;
window.closeReviewImage = closeReviewImage;



function openDeliveryInfo() {
  document.getElementById("deliveryModal").classList.add("show");
}

function closeDeliveryInfo() {
  document.getElementById("deliveryModal").classList.remove("show");
}

/* =====================================
   PRODUCT WISHLIST
===================================== */

const wishlistBtn = document.getElementById("wishlistBtn");
const wishlistIcon = document.getElementById("wishlistIcon");

let wishlistUser = null;
let productIsWishlisted = false;

async function initializeWishlist() {
  if (!wishlistBtn) return;

  wishlistBtn.disabled = true;

  try {

    const {
      data: { session },
      error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError) {
      console.error("Wishlist session error:", sessionError);
    }

    const user = session?.user || null;

    wishlistUser = user;

    if (!wishlistUser || !product?.id) {
      updateWishlistButton(false);
      return;
    }

    const { data, error } = await supabaseClient
      .from("wishlists")
      .select("id")
      .eq("user_id", wishlistUser.id)
      .eq("product_id", String(product.id))
      .maybeSingle();

    if (error) {
      console.error("Wishlist check error:", error);
      return;
    }

    productIsWishlisted = Boolean(data);
    updateWishlistButton(productIsWishlisted);

  } finally {
    wishlistBtn.disabled = false;
  }
}

function updateWishlistButton(isWishlisted) {
  productIsWishlisted = isWishlisted;

  if (!wishlistBtn || !wishlistIcon) return;

  wishlistBtn.classList.toggle("active", isWishlisted);
  wishlistIcon.textContent = isWishlisted ? "♥" : "♡";

  wishlistBtn.setAttribute(
    "aria-label",
    isWishlisted
      ? "Remove product from wishlist"
      : "Add product to wishlist"
  );

  wishlistBtn.title = isWishlisted
    ? "Remove from Wishlist"
    : "Add to Wishlist";
}

async function toggleWishlist() {
  if (!wishlistBtn || !product?.id) return;

  const {
    data: { session },
    error: sessionError
  } = await supabaseClient.auth.getSession();

  if (sessionError) {
    console.error("Wishlist session error:", sessionError);
  }

  const user = session?.user || null;

  if (!user) {
    await supabaseClient.auth.signOut();

    showWishlistLoginPopup();
    return;
  }

  wishlistUser = user;
  wishlistBtn.disabled = true;

  try {
    if (productIsWishlisted) {
      const { error } = await supabaseClient
        .from("wishlists")
        .delete()
        .eq("user_id", user.id)
        .eq("product_id", String(product.id));

      if (error) throw error;

      updateWishlistButton(false);
      showMessage("Removed from wishlist.", "success");

    } else {
      const { error } = await supabaseClient
        .from("wishlists")
        .insert({
          user_id: user.id,
          product_id: String(product.id)
        });

      if (error && error.code !== "23505") {
        throw error;
      }

      updateWishlistButton(true);
      showWishlistSuccessPopup();
    }

  } catch (error) {
    console.error("Wishlist update error:", error);
    showMessage("Unable to update wishlist.", "error");

  } finally {
    wishlistBtn.disabled = false;
  }
}

function showWishlistLoginPopup() {
  document.querySelector(".wishlist-login-overlay")?.remove();

  const overlay = document.createElement("div");

  overlay.className =
    "premium-login-overlay wishlist-login-overlay";

  overlay.innerHTML = `
    <div class="premium-login-box">

      <div class="premium-login-icon">
        ♡
      </div>

      <h3>Save this product</h3>

      <p>
        Create an account or log in to save products
        and access your wishlist anytime from your profile.
      </p>

      <div class="premium-login-actions">

        <button
          type="button"
          class="premium-login-btn signup-wishlist-btn"
        >
          Create Account
        </button>

        <button
          type="button"
          class="wishlist-login-btn login-wishlist-btn"
        >
          Login
        </button>

        <button
          type="button"
          class="premium-cancel-btn"
        >
          Not Now
        </button>

      </div>

    </div>
  `;

  document.body.appendChild(overlay);

  const returnUrl =
    encodeURIComponent(window.location.href);

  overlay
    .querySelector(".signup-wishlist-btn")
    ?.addEventListener("click", () => {
      window.location.href =
        `../signup/?redirect=${returnUrl}`;
    });

  overlay
    .querySelector(".login-wishlist-btn")
    ?.addEventListener("click", () => {
      window.location.href =
        `../login/?redirect=${returnUrl}`;
    });

  overlay
    .querySelector(".premium-cancel-btn")
    ?.addEventListener("click", () => {
      overlay.remove();
    });

  overlay.addEventListener("click", event => {
    if (event.target === overlay) {
      overlay.remove();
    }
  });
}

function showWishlistSuccessPopup() {
  document.querySelector(".wishlist-success-overlay")?.remove();

  const overlay = document.createElement("div");

  overlay.className =
    "wishlist-success-overlay";

  overlay.innerHTML = `
    <div class="wishlist-success-box">

      <div class="wishlist-success-icon">
        ♥
      </div>

      <h3>Saved to Wishlist</h3>

      <p>
        This product has been saved.
        You can view it anytime from your profile.
      </p>

      <div class="wishlist-success-actions">

        <button
          type="button"
          class="wishlist-view-btn"
        >
          View Wishlist
        </button>

        <button
          type="button"
          class="wishlist-continue-btn"
        >
          Continue Shopping
        </button>

      </div>

    </div>
  `;

  document.body.appendChild(overlay);

  overlay
    .querySelector(".wishlist-view-btn")
    ?.addEventListener("click", () => {
      window.location.href = "../homeprofile/";
    });

  overlay
    .querySelector(".wishlist-continue-btn")
    ?.addEventListener("click", () => {
      overlay.remove();
    });

  overlay.addEventListener("click", event => {
    if (event.target === overlay) {
      overlay.remove();
    }
  });

  setTimeout(() => {
    overlay.remove();
  }, 6000);
}

wishlistBtn?.addEventListener("click", toggleWishlist);

/* =====================================
   PRODUCT SOCIAL SHARE
===================================== */

function getProductPreviewUrl() {
  if (!product?.id) {
    return window.location.href;
  }

  return (
    "https://drinelectronicsph.com/.netlify/functions/product-og" +
    "?id=" +
    encodeURIComponent(product.id)
  );
}

function getProductShareTitle() {
  return (
    product?.name ||
    document.getElementById("productName")?.textContent?.trim() ||
    "Drin Electronics Product"
  );
}

function getProductShareImage() {
  return (
    selectedVariant?.image ||
    getProductImage(product) ||
    document.getElementById("productImg")?.src ||
    ""
  );
}

/* FACEBOOK NEWS FEED */
document
  .querySelector(".social-share.facebook")
  ?.addEventListener("click", () => {
    const previewUrl =
      encodeURIComponent(getProductPreviewUrl());

    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${previewUrl}`,
      "_blank",
      "width=650,height=550,noopener,noreferrer"
    );
  });

/* MESSENGER */
document
  .querySelector(".social-share.messenger")
  ?.addEventListener("click", async () => {
    const previewUrl = getProductPreviewUrl();
    const title = getProductShareTitle();

    /*
      Sa mobile, bubuksan nito ang native share menu.
      Puwedeng piliin ang Messenger.
    */
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: "Check this product from Drin Electronics",
          url: previewUrl
        });

        return;

      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }

        console.error("Native share error:", error);
      }
    }

    /*
      Desktop fallback:
      direktang Facebook Messenger Send Dialog.
    */
    const encodedUrl =
      encodeURIComponent(previewUrl);

    const appId =
      "4266303070285606";

    const messengerUrl =
      "https://www.facebook.com/dialog/send" +
      `?app_id=${encodeURIComponent(appId)}` +
      `&link=${encodedUrl}` +
      `&redirect_uri=${encodedUrl}`;

    window.open(
      messengerUrl,
      "_blank",
      "width=650,height=650,noopener,noreferrer"
    );
  });

/* PINTEREST */
document
  .querySelector(".social-share.pinterest")
  ?.addEventListener("click", () => {
    const previewUrl =
      encodeURIComponent(getProductPreviewUrl());

    const image =
      encodeURIComponent(getProductShareImage());

    const description =
      encodeURIComponent(getProductShareTitle());

    window.open(
      "https://pinterest.com/pin/create/button/" +
      `?url=${previewUrl}` +
      `&media=${image}` +
      `&description=${description}`,
      "_blank",
      "width=750,height=650,noopener,noreferrer"
    );
  });

/* X / TWITTER */
document
  .querySelector(".social-share.twitter")
  ?.addEventListener("click", () => {
    const previewUrl =
      encodeURIComponent(getProductPreviewUrl());

    const title =
      encodeURIComponent(getProductShareTitle());

    window.open(
      `https://twitter.com/intent/tweet?url=${previewUrl}&text=${title}`,
      "_blank",
      "width=650,height=500,noopener,noreferrer"
    );
  });

document
  .querySelector(".social-share.twitter")
  ?.addEventListener("click", () => {
    window.open(
      `https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareTitle}`,
      "_blank",
      "width=650,height=500"
    );
  });

document
  .querySelector(".social-share.pinterest")
  ?.addEventListener("click", () => {
    const image = encodeURIComponent(
      document.getElementById("productImg")?.src || ""
    );

    window.open(
      `https://pinterest.com/pin/create/button/?url=${shareUrl}&media=${image}&description=${shareTitle}`,
      "_blank",
      "width=750,height=650"
    );
  });

document
  .querySelector(".social-share.messenger")
  ?.addEventListener("click", () => {

    const previewUrl =
      `https://drinelectronicsph.com/.netlify/functions/product-og` +
      `?id=${encodeURIComponent(product.id)}`;

    const facebookAppId =
      "ILAGAY_DITO_ANG_TUNAY_NA_FACEBOOK_APP_ID";

    const encodedPreviewUrl =
      encodeURIComponent(previewUrl);

    const messengerUrl =
      "https://www.facebook.com/dialog/send" +
      `?app_id=${encodeURIComponent(facebookAppId)}` +
      `&link=${encodedPreviewUrl}` +
      `&redirect_uri=${encodedPreviewUrl}`;

    window.open(
      messengerUrl,
      "_blank",
      "width=650,height=650"
    );

  });

function openSkyroInfoModal() {
  const modal = document.getElementById("skyroInfoModal");

  if (modal) {
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
  }
}

function closeSkyroInfoModal() {
  const modal = document.getElementById("skyroInfoModal");

  if (modal) {
    modal.classList.remove("show");
    document.body.style.overflow = "";
  }
}

window.openSkyroInfoModal = openSkyroInfoModal;
window.closeSkyroInfoModal = closeSkyroInfoModal;


/* =========================================
   PRODUCT IMAGE FULLSCREEN ZOOM
========================================= */

(function initProductImageZoom() {
  const modal = document.getElementById("productZoomModal");
  const zoomImage = document.getElementById("productZoomImage");
  let mainImage = document.getElementById("productImg");

  const closeBtn = document.getElementById("productZoomClose");
  const prevBtn = document.getElementById("productZoomPrev");
  const nextBtn = document.getElementById("productZoomNext");
  const stage = modal?.querySelector(".product-zoom-stage");

  if (!modal || !zoomImage || !mainImage || !stage) return;

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let startX = 0;
  let startY = 0;
  let startDistance = 0;
  let startScale = 1;
  let dragging = false;


  function positionZoomArrows() {
    if (window.innerWidth <= 768) return;

    const prev = document.getElementById("productZoomPrev");
    const next = document.getElementById("productZoomNext");

    if (!prev || !next || !zoomImage.naturalWidth) return;

    const imageRect = zoomImage.getBoundingClientRect();

    // Actual displayed image area, kahit object-fit: contain
    const imageWidth = Math.min(
      imageRect.width,
      imageRect.height *
      (zoomImage.naturalWidth / zoomImage.naturalHeight)
    );

    const imageLeft = imageRect.left +
      (imageRect.width - imageWidth) / 2;

    const imageRight = imageLeft + imageWidth;

    // Buttons positioned just outside the image edges
    const gap = 6;

    modal.style.setProperty(
      "--zoom-prev-left",
      `${Math.max(8, imageLeft - prev.offsetWidth - gap)}px`
    );

    modal.style.setProperty(
      "--zoom-next-right",
      `${Math.max(8, window.innerWidth - imageRight - next.offsetWidth - gap)}px`
    );
  }

  zoomImage.addEventListener("load", positionZoomArrows);
  window.addEventListener("resize", positionZoomArrows);


  function updateTransform() {
    zoomImage.style.transform =
      `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }

  function resetZoom() {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    updateTransform();
  }


  function openZoom() {
    const currentImage = document.getElementById("productImg");
    if (!currentImage) return;

    const imageUrl =
      currentImage.getAttribute("src") ||
      currentImage.getAttribute("data-src");

    if (!imageUrl) return;

    zoomImage.src = imageUrl;
    resetZoom();

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }


  function closeZoom() {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    resetZoom();
  }


  function changeImage(direction) {
    const thumbnails = Array.from(
      document.querySelectorAll(".product-thumb")
    );

    if (thumbnails.length <= 1) return;

    let currentIndex = thumbnails.findIndex(
      thumb => thumb.classList.contains("active")
    );

    if (currentIndex < 0) currentIndex = 0;

    const nextIndex =
      (currentIndex + direction + thumbnails.length) % thumbnails.length;

    const nextThumb = thumbnails[nextIndex];
    const nextImage = nextThumb.querySelector("img");

    if (!nextImage) return;

    zoomImage.src = nextImage.getAttribute("src");
    resetZoom();

    nextThumb.click();
  }


  document.addEventListener("click", (event) => {
    if (event.target.closest("#productImg")) {
      openZoom();
    }
  });


  closeBtn?.addEventListener("click", closeZoom);

  prevBtn?.addEventListener("click", () => changeImage(-1));
  nextBtn?.addEventListener("click", () => changeImage(1));

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target === stage) {
      closeZoom();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!modal.classList.contains("show")) return;

    if (event.key === "Escape") closeZoom();
    if (event.key === "ArrowLeft") changeImage(-1);
    if (event.key === "ArrowRight") changeImage(1);
  });

  // DESKTOP: MOUSE WHEEL ZOOM
  stage.addEventListener("wheel", (event) => {
    event.preventDefault();

    const amount = event.deltaY < 0 ? 0.2 : -0.2;
    scale = Math.min(4, Math.max(1, scale + amount));

    if (scale === 1) {
      offsetX = 0;
      offsetY = 0;
    }

    updateTransform();
  }, { passive: false });

  // MOBILE: PINCH TO ZOOM
  function touchDistance(touches) {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );
  }

  stage.addEventListener("touchstart", (event) => {
    if (event.touches.length === 2) {
      startDistance = touchDistance(event.touches);
      startScale = scale;
      dragging = false;
    } else if (event.touches.length === 1) {
      startX = event.touches[0].clientX - offsetX;
      startY = event.touches[0].clientY - offsetY;
      dragging = true;
    }
  }, { passive: false });

  stage.addEventListener("touchmove", (event) => {
    if (event.touches.length === 2 && startDistance > 0) {
      event.preventDefault();

      const distance = touchDistance(event.touches);

      scale = Math.min(
        4,
        Math.max(1, startScale * (distance / startDistance))
      );

      updateTransform();

    } else if (event.touches.length === 1 && dragging && scale > 1) {
      event.preventDefault();

      offsetX = event.touches[0].clientX - startX;
      offsetY = event.touches[0].clientY - startY;

      updateTransform();
    }
  }, { passive: false });

  stage.addEventListener("touchend", (event) => {
    if (event.touches.length < 2) startDistance = 0;
    if (event.touches.length === 0) dragging = false;
  });

  // DOUBLE CLICK / DOUBLE TAP ZOOM
  zoomImage.addEventListener("dblclick", () => {
    scale = scale > 1 ? 1 : 2;

    if (scale === 1) {
      offsetX = 0;
      offsetY = 0;
    }

    updateTransform();
  });
})();
