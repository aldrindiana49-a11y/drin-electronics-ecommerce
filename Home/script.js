if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

const menuBtn = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");

const mobileSearchToggleBtn = document.getElementById("mobileSearchToggleBtn");
const mobileSearchPanel = document.getElementById("mobileSearchPanel");
const closeMobileSearchBtn = document.getElementById("closeMobileSearchBtn");
const clearMobileSearchBtn = document.getElementById("clearMobileSearchBtn");
const mobileSearchInput = document.getElementById("mobileSearchInput");

const desktopSearchInput = document.getElementById("desktopSearchInput");
const desktopSearchBtn = document.getElementById("desktopSearchBtn");

const homepageProductList = document.getElementById("homepageProductList");
const cartCount = document.getElementById("cartCount");

const bannerShell = document.getElementById("bannerShell");
const bannerTrack = document.getElementById("bannerTrack");
const bannerDots = document.getElementById("bannerDots");
const bannerPrevBtn = document.getElementById("bannerPrevBtn");
const bannerNextBtn = document.getElementById("bannerNextBtn");

const sidebarLogo = document.getElementById("sidebarLogo");
const sidebarLogoFallback = document.getElementById("sidebarLogoFallback");
const storeName = document.getElementById("storeName");
const storeTagline = document.getElementById("storeTagline");

const navLogo = document.getElementById("navLogo");
const navLogoFallback = document.getElementById("navLogoFallback");

const accountBtn = document.getElementById("accountBtn");
const accountDropdown = document.getElementById("accountDropdown");

let products = [];
let homepageProductLimit = 10;
let homepageRenderedCount = 0;
let isSearching = false;
let currentPage = 1;
const pageSize = 10;
let filteredProducts = [];
let rawBanners = JSON.parse(localStorage.getItem("drinBanners")) || [];
let cart = JSON.parse(localStorage.getItem("drinCart")) || [];

let activeBanners = [];
let currentBannerIndex = 0;
let bannerInterval = null;
let isBannerResetting = false;

const defaultStoreSettings = {
  branding: {
    storeName: "Drin Electronics",
    tagline: "Quality amplifier parts and electronics",
    logo: ""
  },
  theme: {
    primaryColor: "#00bcd4",
    primaryDark: "#0097a7"
  }
};

function safeText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
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

function formatPrice(value) {
  return `₱${safeNumber(value, 0).toLocaleString()}`;
}

/* PRODUCTS */
function getRawProducts() {
  const liveProducts = JSON.parse(localStorage.getItem("drinProducts")) || [];
  const testProducts = JSON.parse(localStorage.getItem("drinTestProducts")) || [];

  if (Array.isArray(liveProducts) && liveProducts.length) return liveProducts;
  return Array.isArray(testProducts) ? testProducts : [];
}

function normalizeVariant(variant, index = 0) {
  return {
    id: safeText(variant?.id, `variant-${index + 1}`),
    label: safeText(variant?.label, index === 0 ? "Default" : `Option ${index + 1}`),
    price: safeNumber(variant?.price, 0),
    discountPrice: safeNumber(variant?.discountPrice, 0),
    stock: safeNumber(variant?.stock, 0),
    sku: safeText(variant?.sku, ""),
    weight: safeNumber(variant?.weight, 0),
    length: safeNumber(variant?.length, 0),
    width: safeNumber(variant?.width, 0),
    height: safeNumber(variant?.height, 0),
    image: safeText(variant?.image, "")
  };
}

function getVariantFinalPrice(variant) {
  const original = safeNumber(variant?.price, 0);
  const discount = safeNumber(variant?.discountPrice, 0);
  return discount > 0 && discount < original ? discount : original;
}

function getBestVariant(variants = []) {
  const cleanVariants = variants.map(normalizeVariant);
  const withPrice = cleanVariants.filter((variant) => getVariantFinalPrice(variant) > 0);
  const source = withPrice.length ? withPrice : cleanVariants;

  if (!source.length) return null;

  const inStock = source.filter((variant) => safeNumber(variant.stock, 0) > 0);
  const finalSource = inStock.length ? inStock : source;

  return finalSource.reduce((best, current) => {
    return getVariantFinalPrice(current) < getVariantFinalPrice(best) ? current : best;
  }, finalSource[0]);
}

function getProductImages(rawProduct, variants = []) {
  const images = [];

  if (safeText(rawProduct?.image)) {
    images.push(safeText(rawProduct.image));
  }

  variants.forEach((variant) => {
    if (safeText(variant.image) && !images.includes(safeText(variant.image))) {
      images.push(safeText(variant.image));
    }
  });

  if (!images.length) {
    images.push("https://via.placeholder.com/400x300?text=No+Image");
  }

  return images.slice(0, 5);
}

function normalizeProducts() {
  const rawProducts = getRawProducts();

  products = rawProducts
    .map((product, index) => {
      const variants = Array.isArray(product?.variants)
        ? product.variants.map(normalizeVariant)
        : [];

      const bestVariant = getBestVariant(variants);

      const totalStock = variants.length
        ? variants.reduce((sum, variant) => sum + safeNumber(variant.stock, 0), 0)
        : safeNumber(product?.stock, 0);

      const price = bestVariant
        ? safeNumber(bestVariant.price, 0)
        : safeNumber(product?.price, 0);

      const discountPrice = bestVariant
        ? safeNumber(bestVariant.discountPrice, 0)
        : safeNumber(product?.discountPrice, 0);

      const images = getProductImages(product, variants);

      return {
        id: safeText(product?.id, `product-${index + 1}`),
        name: safeText(product?.name, "Unnamed Product"),
        brand: safeText(product?.brand, ""),
        category: safeText(product?.category, "Uncategorized"),
        description: safeText(product?.description, ""),
        productType: safeText(product?.productType, variants.length ? "variant" : "single"),
        variantTitle: safeText(product?.variantTitle, ""),
        variants,
        images,
        image: images[0],
        price,
        discountPrice,
        stock: totalStock
      };
    })
    .reverse();
}

function renderPriceBlock(price, discountPrice) {
  const original = safeNumber(price, 0);
  const discount = safeNumber(discountPrice, 0);

  if (discount > 0 && discount < original) {
    return `
      <div class="homepage-product-pricing">
        <div class="current-price">${formatPrice(discount)}</div>
        <div class="old-price">${formatPrice(original)}</div>
      </div>
    `;
  }

  return `
    <div class="homepage-product-pricing">
      <div class="current-price">${formatPrice(original)}</div>
    </div>
  `;
}

/* UPDATED: Pagination handles stock order */

function renderHomepageProducts(productArray = products) {
  if (!homepageProductList) return;

  homepageProductList.innerHTML = "";

  if (!productArray.length) {
    homepageProductList.innerHTML = `
      <div class="empty-products">
        New arrivals coming soon! For now, you can order directly via Facebook 💬
      </div>
    `;
    return;
  }

  renderProductCards(productArray);
}


function renderProductCards(productArray) {
  productArray.forEach((product) => {
    const outOfStock = safeNumber(product.stock, 0) <= 0;
    const card = document.createElement("div");
    card.className = `homepage-product-card ${outOfStock ? "out-of-stock-card" : ""}`;

    card.onclick = () => {
      localStorage.setItem("selectedProduct", JSON.stringify(product));
      localStorage.setItem("selectedProductId", product.id);

      window.location.href =
        `./Product/index.html?id=${encodeURIComponent(product.id)}`;
    };

    const imageSlides = product.images
      .map((img) => `
    <img
      loading="lazy"
      src="${img}"
      alt="${escapeHtml(product.name)}"
      onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'"
    />
  `)
      .join("");

    card.innerHTML = `
      <div class="homepage-product-image">
        <div class="product-image-track">
          ${imageSlides}
        </div>
        ${outOfStock ? `<div class="stock-overlay">Out of Stock</div>` : ""}
      </div>

      <div class="homepage-product-info">
        <span class="homepage-product-category">${escapeHtml(product.category)}</span>
        <h3>${escapeHtml(product.name)}</h3>
        <div class="homepage-rating">
  ★★★★☆ <span>${product.average_rating || "4.8"}</span>
</div>
        ${product.brand ? `<p class="homepage-product-brand">${escapeHtml(product.brand)}</p>` : ""}
        ${renderPriceBlock(product.price, product.discountPrice)}
        <p class="homepage-product-stock ${outOfStock ? "out-stock-text" : ""}">
          ${outOfStock ? "Out of stock" : `Stock: ${product.stock}`}
        </p>
      </div>
    `;

    homepageProductList.appendChild(card);
  });
}

/* STORE SETTINGS */
function getStoreSettings() {
  const saved = JSON.parse(localStorage.getItem("drinStoreSettings")) || {};

  return {
    branding: {
      ...defaultStoreSettings.branding,
      ...(saved.branding || {})
    },
    theme: {
      ...defaultStoreSettings.theme,
      ...(saved.theme || {})
    }
  };
}

function applyTheme() {
  const settings = getStoreSettings();

  if (settings.theme?.primaryColor) {
    document.documentElement.style.setProperty("--primary", settings.theme.primaryColor);
  }

  if (settings.theme?.primaryDark) {
    document.documentElement.style.setProperty("--primary-dark", settings.theme.primaryDark);
  }
}

async function renderBranding() {

  const { data, error } =
    await supabaseClient
      .from("store_settings")
      .select("logo_url, store_name")
      .limit(1)
      .maybeSingle();

  if (error) return;

  const logo =
    data?.logo_url ||
    "https://zdinvxowzpkolbfzpcac.supabase.co/storage/v1/object/public/product-images/logo.png";

  if (storeName) {

    storeName.textContent =
      data?.store_name || "Drin Electronics";
  }

  if (storeTagline) {

    storeTagline.textContent =
      "Quality amplifier parts and electronics";
  }

  if (logo && sidebarLogo) {

    sidebarLogo.src = logo;

    sidebarLogo.classList.add("show");

    if (sidebarLogoFallback) {

      sidebarLogoFallback.style.display = "none";
    }

  } else {

    if (sidebarLogo) {

      sidebarLogo.classList.remove("show");

      sidebarLogo.removeAttribute("src");
    }

    if (sidebarLogoFallback) {

      sidebarLogoFallback.style.display = "grid";
    }

  }

}

async function renderNavbarLogo() {

  const mobileNavLogo =
    document.getElementById("mobileNavLogo");

  const { data, error } =
    await supabaseClient
      .from("store_settings")
      .select("logo_url")
      .limit(1)
      .maybeSingle();

  console.log("LOGO DATA:", data, error);

  if (error || !data?.logo_url) return;

  const logo =
    data.logo_url;

  if (logo) {

    if (navLogo) {
      navLogo.src = logo + "?v=" + Date.now();

      navLogo.onerror = () => {
        console.log("Logo failed to load");
      };

      console.log("FINAL LOGO:", navLogo.src);

      navLogo.style.display = "block";
      navLogo.style.visibility = "visible";
      navLogo.classList.add("show");
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
}

/* SIDEBAR / SEARCH */
function openSidebar() {
  if (!sidebar || !overlay) return;
  sidebar.classList.add("active");
  overlay.classList.add("active");
}

function closeSidebar() {
  if (!sidebar || !overlay) return;
  sidebar.classList.remove("active");
  overlay.classList.remove("active");
}

function toggleSidebar() {
  const isOpen = sidebar?.classList.contains("active");
  if (isOpen) closeSidebar();
  else {
    closeMobileSearch();
    openSidebar();
  }
}

function openMobileSearch() {
  if (!mobileSearchPanel) return;
  mobileSearchPanel.classList.add("active");
  closeSidebar();

  setTimeout(() => {
    if (mobileSearchInput) mobileSearchInput.focus();
  }, 80);
}

function closeMobileSearch() {
  if (!mobileSearchPanel) return;
  mobileSearchPanel.classList.remove("active");
}

function clearMobileSearch() {
  if (!mobileSearchInput) return;
  mobileSearchInput.value = "";
  mobileSearchInput.focus();
}

function updateCartCount() {

  const cartData =
    JSON.parse(localStorage.getItem("drinCart")) || [];

  const totalItems = cartData.reduce((sum, item) => {
    return sum + safeNumber(item.quantity, 0);
  }, 0);

  document
    .querySelectorAll("#cartCount, #mobileCartCount")
    .forEach((badge) => {
      badge.textContent = totalItems;
    });
}

/* BANNER */
function normalizeBannerItem(item, index) {
  return {
    id: safeText(item?.id, `banner-${index + 1}`),
    image: safeText(item?.image, ""),
    title: safeText(item?.title, "Drin Electronics"),
    description: safeText(
      item?.description,
      "Quality amplifiers, electronics parts, and reliable services"
    ),
    link: safeText(item?.link, ""),
    active: item?.active === undefined ? true : Boolean(item.active),
    order: safeNumber(item?.order, index + 1)
  };
}

function getActiveBanners() {
  const normalized = rawBanners
    .map(normalizeBannerItem)
    .filter((item) => item.active && item.image)
    .sort((a, b) => a.order - b.order)
    .slice(0, 5);

  if (normalized.length) return normalized;

  return [
    {
      id: "default-banner-1",
      image: "https://zdinvxowzpkolbfzpcac.supabase.co/storage/v1/object/public/Banner/B4.jpg",
      title: "Drin Electronics",
      description: "Quality amplifiers, electronics parts, and reliable services",
      link: "",
      active: true,
      order: 1
    },
    {
      id: "default-banner-2",
      image: "https://zdinvxowzpkolbfzpcac.supabase.co/storage/v1/object/public/Banner/B5.jpg",
      title: "Trusted Audio Components",
      description: "Speakers, MOSFET, capacitors, and more for your projects",
      link: "",
      active: true,
      order: 2
    },
    {
      id: "default-banner-3",
      image: "https://zdinvxowzpkolbfzpcac.supabase.co/storage/v1/object/public/Banner/B6.jpg",
      title: "Reliable Electronics Shop",
      description: "Built for repair, upgrade, and performance",
      link: "",
      active: true,
      order: 3
    }
  ];
}

function createBannerSlide(banner) {
  const slide = document.createElement("div");
  slide.className = "banner-slide";

  slide.style.backgroundImage = `
    linear-gradient(to right, rgba(0,0,0,0.52), rgba(0,0,0,0.12)),
    url('${banner.image}')
  `;

  slide.innerHTML = `
    <div class="banner-content">
      <h2>${escapeHtml(banner.title || "Drin Electronics")}</h2>
      <p>${escapeHtml(
    banner.description || "Quality amplifiers, electronics parts, and reliable services"
  )}</p>
    </div>
  `;

  return slide;
}

function getRealBannerIndex() {
  if (!activeBanners.length) return 0;
  return currentBannerIndex % activeBanners.length;
}

function renderBannerDots() {
  if (!bannerDots) return;

  bannerDots.innerHTML = "";

  activeBanners.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `banner-dot ${index === getRealBannerIndex() ? "active" : ""}`;
    dot.setAttribute("aria-label", `Go to banner ${index + 1}`);

    dot.addEventListener("click", (event) => {
      event.stopPropagation();
      goToBanner(index);
      restartBannerAutoplay();
    });

    bannerDots.appendChild(dot);
  });
}

function updateBannerDots() {
  if (!bannerDots) return;

  const dots = bannerDots.querySelectorAll(".banner-dot");
  const realIndex = getRealBannerIndex();

  dots.forEach((dot, index) => {
    dot.classList.toggle("active", index === realIndex);
  });
}

function updateBannerPosition(withTransition = true) {
  if (!bannerTrack) return;

  bannerTrack.style.transition = withTransition ? "transform 0.5s ease" : "none";
  bannerTrack.style.transform = `translateX(-${currentBannerIndex * 100}%)`;

  updateBannerDots();

  if (bannerShell) {
    const currentBanner = activeBanners[getRealBannerIndex()];
    bannerShell.style.cursor = currentBanner?.link ? "pointer" : "default";
  }
}

function goToBanner(index) {
  if (!activeBanners.length || isBannerResetting) return;
  currentBannerIndex = index;
  updateBannerPosition(true);
}

function nextBanner() {
  if (!activeBanners.length || isBannerResetting) return;

  currentBannerIndex++;
  updateBannerPosition(true);

  if (currentBannerIndex === activeBanners.length) {
    isBannerResetting = true;

    setTimeout(() => {
      currentBannerIndex = 0;
      updateBannerPosition(false);

      setTimeout(() => {
        isBannerResetting = false;
      }, 30);
    }, 500);
  }
}

function prevBanner() {
  if (!activeBanners.length || isBannerResetting) return;

  if (currentBannerIndex === 0) {
    isBannerResetting = true;
    currentBannerIndex = activeBanners.length;
    updateBannerPosition(false);

    setTimeout(() => {
      currentBannerIndex = activeBanners.length - 1;
      updateBannerPosition(true);

      setTimeout(() => {
        isBannerResetting = false;
      }, 500);
    }, 30);
  } else {
    currentBannerIndex--;
    updateBannerPosition(true);
  }
}

function stopBannerAutoplay() {
  if (bannerInterval) {
    clearInterval(bannerInterval);
    bannerInterval = null;
  }
}

function startBannerAutoplay() {
  stopBannerAutoplay();

  if (activeBanners.length <= 1) return;

  bannerInterval = setInterval(() => {
    nextBanner();
  }, 4000);
}

function restartBannerAutoplay() {
  startBannerAutoplay();
}

function handleBannerClick() {
  const currentBanner = activeBanners[getRealBannerIndex()];
  if (!currentBanner || !currentBanner.link) return;
  window.location.href = currentBanner.link;
}

function renderBanner() {
  if (!bannerTrack || !bannerShell || !bannerPrevBtn || !bannerNextBtn || !bannerDots) return;

  activeBanners = getActiveBanners();
  currentBannerIndex = 0;
  isBannerResetting = false;
  bannerTrack.innerHTML = "";
  bannerDots.innerHTML = "";

  activeBanners.forEach((banner) => {
    bannerTrack.appendChild(createBannerSlide(banner));
  });

  if (activeBanners.length > 1) {
    const firstClone = createBannerSlide(activeBanners[0]);
    bannerTrack.appendChild(firstClone);
  }

  const isSlider = activeBanners.length > 1;

  bannerPrevBtn.style.display = isSlider ? "inline-flex" : "none";
  bannerNextBtn.style.display = isSlider ? "inline-flex" : "none";
  bannerDots.style.display = isSlider ? "flex" : "none";

  if (isSlider) renderBannerDots();

  updateBannerPosition(false);
  startBannerAutoplay();
}

/* FILTER / SEARCH */
function filterByCategory(categoryName) {
  closeSidebar();

  const filtered = products.filter(
    (product) => safeText(product.category).toLowerCase() === categoryName.toLowerCase()
  );

  renderHomepageProducts(filtered);

  const section = document.getElementById("productsSection");
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleSearch(keyword) {
  const safeKeyword = safeText(keyword).trim().toLowerCase();

  if (!safeKeyword) {
    currentPage = 1;
    renderProducts(products);
    updateCartCount();
    return;
  }

  const filtered = products.filter((product) => {
    const name = safeText(product.name).toLowerCase();
    const brand = safeText(product.brand).toLowerCase();
    const category = safeText(product.category).toLowerCase();
    const description = safeText(product.description).toLowerCase();

    return (
      name.includes(safeKeyword) ||
      brand.includes(safeKeyword) ||
      category.includes(safeKeyword) ||
      description.includes(safeKeyword)
    );
  });

  currentPage = 1;
  renderProducts(filtered);

  const section = document.getElementById("productsSection");
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* EVENTS */
if (menuBtn) menuBtn.addEventListener("click", toggleSidebar);

if (overlay) {
  overlay.addEventListener("click", () => {
    closeSidebar();
    closeMobileSearch();
  });
}

if (mobileSearchToggleBtn) mobileSearchToggleBtn.addEventListener("click", openMobileSearch);
if (closeMobileSearchBtn) closeMobileSearchBtn.addEventListener("click", closeMobileSearch);
if (clearMobileSearchBtn) clearMobileSearchBtn.addEventListener("click", clearMobileSearch);

if (desktopSearchBtn) {
  desktopSearchBtn.addEventListener("click", () => {
    handleSearch(desktopSearchInput?.value || "");
  });
}

if (desktopSearchInput) {
  desktopSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearch(desktopSearchInput.value);
    }
  });
}

if (mobileSearchInput) {
  mobileSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearch(mobileSearchInput.value);
      closeMobileSearch();
    }
  });
}

if (bannerPrevBtn) {
  bannerPrevBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    prevBanner();
    restartBannerAutoplay();
  });
}

if (bannerNextBtn) {
  bannerNextBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    nextBanner();
    restartBannerAutoplay();
  });
}

if (bannerShell) {
  bannerShell.addEventListener("click", handleBannerClick);
  bannerShell.addEventListener("mouseenter", stopBannerAutoplay);
  bannerShell.addEventListener("mouseleave", startBannerAutoplay);
}

/* BANNER SWIPE / DRAG */
let bannerStartX = 0;
let bannerEndX = 0;
let isBannerDragging = false;

if (bannerTrack) {
  bannerTrack.addEventListener("touchstart", (event) => {
    bannerStartX = event.touches[0].clientX;
    bannerEndX = bannerStartX;
    stopBannerAutoplay();
  });

  bannerTrack.addEventListener("touchmove", (event) => {
    bannerEndX = event.touches[0].clientX;
  });

  bannerTrack.addEventListener("touchend", () => {
    const diff = bannerStartX - bannerEndX;

    if (Math.abs(diff) > 50) {
      diff > 0 ? nextBanner() : prevBanner();
    }

    startBannerAutoplay();
  });

  bannerTrack.addEventListener("mousedown", (event) => {
    isBannerDragging = true;
    bannerStartX = event.clientX;
    bannerEndX = bannerStartX;
    stopBannerAutoplay();
  });

  bannerTrack.addEventListener("mousemove", (event) => {
    if (!isBannerDragging) return;
    bannerEndX = event.clientX;
  });

  bannerTrack.addEventListener("mouseup", () => {
    if (!isBannerDragging) return;

    const diff = bannerStartX - bannerEndX;

    if (Math.abs(diff) > 50) {
      diff > 0 ? nextBanner() : prevBanner();
    }

    isBannerDragging = false;
    startBannerAutoplay();
  });

  bannerTrack.addEventListener("mouseleave", () => {
    if (!isBannerDragging) return;
    isBannerDragging = false;
    startBannerAutoplay();
  });
}

/* ACCOUNT */
if (accountBtn) {
  accountBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    accountDropdown?.classList.toggle("show");
  });
}

document.addEventListener("click", (event) => {
  if (!accountBtn?.contains(event.target) && !accountDropdown?.contains(event.target)) {
    accountDropdown?.classList.remove("show");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSidebar();
    closeMobileSearch();
    accountDropdown?.classList.remove("show");
  }
});

/* CATEGORY TOGGLE */
function toggleCategories() {
  const grid = document.querySelector(".shortcut-grid");
  const btn = document.getElementById("categoryToggleBtn");

  if (!grid || !btn) return;

  grid.classList.toggle("expanded");
  btn.textContent = grid.classList.contains("expanded") ? "View Less" : "View All";
}

function scrollToCategories() {
  const section = document.getElementById("categorySection");
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ===============================
   START DYNAMIC VOUCHERS
   purpose: load vouchers from Supabase/Admin
================================ */

async function loadVouchersFromSupabase() {
  const voucherList = document.getElementById("voucherList");
  const voucherSection = document.getElementById("voucherSection");

  if (!voucherList) return;

  const { data, error } = await supabaseClient
    .from("vouchers")
    .select("*")
    .eq("is_active", true)
    .eq("voucher_type", "regular")
    .order("created_at", { ascending: false });

  if (error) {

    console.error(error);

    return;
  }

  if (!data || data.length === 0) {
    voucherList.innerHTML = "";
    if (voucherSection) voucherSection.style.display = "none";
    return;
  }

  if (voucherSection) voucherSection.style.display = "block";

  voucherList.innerHTML = data.map((voucher) => {
    const amount = safeNumber(voucher.discount_amount, 0);
    const minSpend = safeNumber(voucher.min_spend, 0);
    const code = safeText(voucher.code, "DRIN");

    return `
      <div class="voucher-card">
        <h4>₱${amount.toLocaleString()} OFF</h4>
        <span>Min ₱${minSpend.toLocaleString()}</span>
       <button
  class="voucher-claim-btn"
  id="voucher-btn-${code}"
  onclick="claimVoucher('${code}')">

  Claim

</button>
      </div>
    `;
  }).join("");
}

async function claimVoucher(code) {

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  if (!user) {

    showPremiumLoginPopup();

    setTimeout(() => {

      window.location.href =
        "./login/";

    }, 1200);

    return;
  }

  localStorage.setItem(
    "claimedVoucherCode",
    code
  );

  const btn =
    document.getElementById(
      `voucher-btn-${code}`
    );

  if (btn) {

    btn.innerHTML =
      "✅ Claimed";

    btn.disabled = true;

    btn.classList.add(
      "voucher-claimed"
    );

    btn.style.transform =
      "scale(.96)";

    setTimeout(() => {

      btn.style.transform =
        "scale(1)";

    }, 180);

  }

  showVoucherToast(
    "✅ Voucher Claimed Successfully"
  );

}
/* END DYNAMIC VOUCHERS */

/* INIT */
async function loadProductsFromSupabase() {

  const cached =
    JSON.parse(localStorage.getItem("cachedProducts"));

  if (cached?.length) {

    products = cached;

    currentPage = 1;

    const pendingCategory = localStorage.getItem("selectedCategory");

    if (pendingCategory) {
      filterByCategory(pendingCategory);
    } else {
      renderProducts(products);
    }

    hideProductLoader();

    if (typeof window.renderTrendingProducts === "function") {
      window.renderTrendingProducts(products);
    }

    if (typeof window.renderHotDeals === "function") {
      window.renderHotDeals(products);
    }

  }

  const { data, error } = await supabaseClient
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);

    return;

  }
  products = (data || []).map((item) => {

    const firstVariation =
      Array.isArray(item.variations) && item.variations.length
        ? item.variations[0]
        : {};

    const mainPrice = safeNumber(item.price || firstVariation.price, 0);

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
            weight: item.weight,
            length: item.length,
            width: item.width,
            height: item.height,
            image: item.image
          }
        ];

    return {
      id: item.id,
      name: item.title,
      brand: item.brand || "",
      category: item.category,
      description: item.description,
      productType: variants.length > 1 ? "variant" : "single",
      variantTitle: "Options",
      variants,
      image: item.image,
      images: [item.image || "https://via.placeholder.com/400x300?text=No+Image"],
      price: mainPrice,
      discountPrice: mainDiscount,
      stock: variants.reduce((total, variant) => {
        return total + safeNumber(
          variant.stock ??
          variant.variant_stock ??
          variant.variantStock ??
          variant.qty ??
          variant.quantity ??
          0,
          0
        );
      }, 0),

      sold_count: item.sold_count || 0,
      average_rating: item.average_rating || 4.8

    };
  });

  localStorage.setItem(
    "cachedProducts",
    JSON.stringify(products)
  );

  const selectedCategory =
    localStorage.getItem("selectedCategory");

  if (selectedCategory) {

    filterByCategory(selectedCategory);

    localStorage.removeItem("selectedCategory");

  } else {

    currentPage = 1;
    renderProducts(products);

    hideProductLoader();

    if (typeof window.renderTrendingProducts === "function") {
      window.renderTrendingProducts(products);
    }

    if (typeof window.renderHotDeals === "function") {
      window.renderHotDeals(products);
    }

  }
}

(async () => {

  applyTheme();

  await renderBranding();

  await renderNavbarLogo();

  await renderFavicon();

  renderBanner();

  await loadProductsFromSupabase();

  renderCategoryShortcuts();

  // TEMP DISABLED: Homepage voucher removed for faster loading
  // Voucher still active on Product Page
  // loadVouchersFromSupabase();

  updateCartCount();

})();


// TEMP DISABLED: Homepage voucher removed for faster loading
// Voucher still active on Product Page
// loadVouchersFromSupabase();

updateCartCount();

/* GLOBAL */
window.products = products;
window.closeSidebar = closeSidebar;
window.filterByCategory = filterByCategory;
window.renderHomepageProducts = renderHomepageProducts;
window.toggleCategories = toggleCategories;
window.scrollToCategories = scrollToCategories;

// 📱 MOBILE BOTTOM NAV FUNCTIONS


// ===== DYNAMIC WELCOME POPUP =====

let activeWelcomeVoucher = null;

window.addEventListener("load", () => {
  loadWelcomeVoucherPopup();
});

async function loadWelcomeVoucherPopup() {
  const popup = document.getElementById("welcomePopup");
  const mainText = document.querySelector(".welcome-main");
  const subText = document.querySelector(".welcome-sub");

  if (!popup) return;

  const alreadyClaimed =
    localStorage.getItem(
      "welcomeVoucherClaimed"
    );

  if (alreadyClaimed) {

    popup.style.display = "none";
    return;

  }

  const { data, error } = await supabaseClient
    .from("vouchers")
    .select("*")
    .eq("is_active", true)
    .eq("voucher_type", "welcome")
    .eq("show_popup", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    popup.style.display = "none";
    return;
  }

  activeWelcomeVoucher = data;

  const amount = Number(data.discount_amount || 0).toLocaleString();
  const minSpend = Number(data.min_spend || 0).toLocaleString();

  if (mainText) {
    mainText.innerHTML = `Get <strong>₱${amount} OFF</strong>`;
  }

  if (subText) {
    subText.textContent = `Sign up to claim and use your ₱${amount} voucher • Min. ₱${minSpend} spend`;
  }

  popup.style.display = "flex";
}

function closeWelcomePopup() {
  const popup = document.getElementById("welcomePopup");
  if (popup) popup.style.display = "none";
}

function claimWelcomeVoucher() {
  const box = document.querySelector(".welcome-box");
  const badge = document.querySelector(".welcome-badge");
  const mainText = document.querySelector(".welcome-main");
  const subText = document.querySelector(".welcome-sub");

  if (!activeWelcomeVoucher) return;

  localStorage.setItem("welcomeVoucherClaimed", "true");
  localStorage.setItem("claimedVoucherCode", activeWelcomeVoucher.code);

  if (badge) badge.textContent = "VOUCHER CLAIMED";
  if (mainText) mainText.innerHTML = `✅ ${activeWelcomeVoucher.code} Claimed!`;
  if (subText) subText.textContent = "Your voucher is ready to use.";

  if (box) {
    box.style.transition = "0.3s ease";
    box.style.transform = "scale(1.04)";
  }

  setTimeout(() => {
    if (box) box.style.transform = "scale(1)";
  }, 300);

  setTimeout(() => {
    closeWelcomePopup();
  }, 1200);
}

// ===== END DYNAMIC WELCOME POPUP =====

/* ===============================
   SIDEBAR CATEGORY DROPDOWN SYNC
================================ */

(function () {
  const toggleBtn = document.getElementById("toggleCategoryMenu");
  const categoryList = document.getElementById("sidebarCategoryList");

  if (!toggleBtn || !categoryList) return;

  const defaultCategories = [
    "Power Amplifier",
    "Speaker & Tweeter",
    "Audio Processor",
    "Transistor / MOSFET",
    "Capacitor",
    "Diode",
    "Resistor",
    "Integrated Circuits (IC)",
    "PCB / Boards",
    "Connectors & Terminals",
    "Wires & Cables",
    "Relay",
    "Others"
  ];

  function clean(value) {
    return String(value || "").trim();
  }

  function getSyncedCategories() {
    const saved = JSON.parse(localStorage.getItem("drinCategories") || "[]");
    const names = [...defaultCategories];

    saved.forEach(cat => {
      const name = clean(cat.name);
      if (!name) return;
      if (cat.status && cat.status !== "active") return;

      const exists = names.some(item => item.toLowerCase() === name.toLowerCase());
      if (!exists) names.push(name);
    });

    return names;
  }

  function renderSidebarCategoryDropdown() {
    const categories = getSyncedCategories();

    categoryList.innerHTML = "";

    categories.forEach(category => {
      const li = document.createElement("li");
      li.innerHTML = `
        <a href="#" onclick="filterByCategory('${category.replaceAll("'", "\\'")}'); closeSidebar(); return false;">
          ${category}
        </a>
      `;
      categoryList.appendChild(li);
    });
  }

  toggleBtn.addEventListener("click", function (e) {
    e.preventDefault();

    const isOpen = categoryList.style.display === "block";
    categoryList.style.display = isOpen ? "none" : "block";
    toggleBtn.innerHTML = isOpen
      ? "📂 Categories ▾"
      : "📂 Categories ▴";
  });

  renderSidebarCategoryDropdown();
})();

// ===============================
// READ MORE FEATURE START
// SAFE ZONE - DELETE FROM HERE ↓↓↓
// ===============================

(function () {
  const LIMIT = 180;

  function setupReadMore() {
    const desc = document.getElementById("productDescription");
    const toggle = document.getElementById("descToggle");

    if (!desc || !toggle) return;

    const fullText = desc.textContent.trim();

    if (!fullText || fullText.length <= LIMIT) {
      toggle.style.display = "none";
      return;
    }

    let expanded = false;

    desc.textContent = fullText.slice(0, LIMIT) + "...";
    toggle.style.display = "block";
    toggle.textContent = "▼ Read more";

    toggle.onclick = function () {
      expanded = !expanded;

      desc.textContent = expanded
        ? fullText
        : fullText.slice(0, LIMIT) + "...";

      toggle.textContent = expanded
        ? "▲ Show less"
        : "▼ Read more";
    };
  }

  window.addEventListener("load", function () {
    setTimeout(setupReadMore, 300);
  });
})();

function goHome() {
  window.location.href = "./index.html";
}

function goMessage() {
  // replace with messenger link later
  alert("Messenger chat coming soon!");
}

window.goCart = function () {
  window.location.href = "./Cart/index.html";
};

const searchInput = document.getElementById("desktopSearchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");

if (searchInput && clearSearchBtn) {

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchInput.focus();
  });

}


document.addEventListener("DOMContentLoaded", () => {
  updateCartCount();
});

window.addEventListener("pageshow", () => {
  updateCartCount();
});


async function renderFavicon() {

  const favicon =
    document.getElementById("siteFavicon");

  const { data, error } =
    await supabaseClient
      .from("store_settings")
      .select("logo_url")
      .limit(1)
      .maybeSingle();

  if (error || !data?.logo_url) return;

  if (favicon) {
    favicon.href = data.logo_url;
  }

}

renderFavicon();

async function updateAuthUI() {

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  const accountDropdown =
    document.getElementById("accountDropdown");

  const sidebarAccountLinks =
    document.getElementById("sidebarAccountLinks");

  // =========================
  // NOT LOGGED IN
  // =========================

  if (!user) {

    if (accountDropdown) {

      accountDropdown.innerHTML = `
        <a href="./login/">
          Login
        </a>

        <a href="./signup/">
          Sign Up
        </a>
      `;
    }

    if (sidebarAccountLinks) {

      sidebarAccountLinks.innerHTML = `
        <li>
          <a href="./login/">
            Login
          </a>
        </li>

        <li>
          <a href="./signup/">
            Sign Up
          </a>
        </li>
      `;
    }

    return;
  }

  // =========================
  // LOGGED IN
  // =========================

  if (accountDropdown) {

    accountDropdown.innerHTML = `
      <a href="/homeprofile/">
        My Profile
      </a>

      <a href="#"
         onclick="logoutUser()">

         Logout

      </a>
    `;
  }

  if (sidebarAccountLinks) {

    sidebarAccountLinks.innerHTML = `
      <li>
        <a href="/Home-orders/">
          My Orders
        </a>
      </li>

      <li>
        <a href="/homeprofile/">
          My Profile
        </a>
      </li>

      <li>
        <a href="#"
           onclick="logoutUser()">

           Logout

        </a>
      </li>
    `;
  }

}


async function logoutUser() {

  await supabaseClient.auth.signOut();

  localStorage.removeItem("drinUser");

  window.location.reload();

}

updateAuthUI();


async function goAccount() {

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  if (user) {

    window.location.href = "/homeprofile/";

  } else {

    window.location.href = "./login/";

  }

}

function showAllProducts() {

  localStorage.removeItem("selectedCategory");

  currentPage = 1;
  renderProducts(products);
  const section =
    document.getElementById("productsSection");

  if (section) {

    section.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  }

}

window.addEventListener("load", () => {

  const shouldScroll =
    sessionStorage.getItem(
      "scrollToProducts"
    );

  if (shouldScroll) {

    sessionStorage.removeItem(
      "scrollToProducts"
    );

    const products =
      document.getElementById(
        "productsSection"
      );

    if (products) {

      setTimeout(() => {

        products.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

      }, 300);

    }

  }

});

function goHome() {
  window.location.href = "./index.html";
}

/* PREMIUM VOUCHER TOAST */

function showVoucherToast(message) {

  let toast =
    document.getElementById("voucherToast");

  if (!toast) {

    toast = document.createElement("div");
    toast.id = "voucherToast";
    toast.className = "voucher-toast";

    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}


function showPremiumLoginPopup() {

  const existing =
    document.getElementById("premiumLoginPopup");

  if (existing) existing.remove();

  const popup =
    document.createElement("div");

  popup.id = "premiumLoginPopup";

  popup.innerHTML = `

    <div class="premium-login-overlay">

      <div class="premium-login-box">

        <div class="premium-login-icon">
          🔒
        </div>

        <h3>
          Login Required
        </h3>

        <p>
          Please login first to claim vouchers and enjoy member benefits.
        </p>

        <div class="premium-login-actions">

          <button
            class="premium-login-btn"
            onclick="window.location.href='./login/'">

            Login Now

          </button>

          <button
            class="premium-cancel-btn"
            onclick="closePremiumLoginPopup()">

            Cancel

          </button>

        </div>

      </div>

    </div>
  `;

  document.body.appendChild(popup);
}

function closePremiumLoginPopup() {

  const popup =
    document.getElementById("premiumLoginPopup");

  if (popup) popup.remove();
}

let authReady = false;

supabaseClient.auth.onAuthStateChange(async (event) => {
  if (!authReady) {
    authReady = true;
    await updateAuthUI();
    return;
  }

  await updateAuthUI();

  if (event === "SIGNED_OUT") {
    window.location.href = "/";
  }
});

function hideProductLoader() {

  const loader =
    document.getElementById(
      "productLoadingModal"
    );

  if (!loader) return;

  setTimeout(() => {

    loader.classList.add("hide");

  }, 500);

}

function hasAvailableStock(product) {
  if (Array.isArray(product.variants) && product.variants.length) {
    return product.variants.some((variant) => safeNumber(variant.stock, 0) > 0);
  }

  return safeNumber(product.stock, 0) > 0;
}

function sortProductsStockLast(list = []) {
  const inStock = list.filter(hasAvailableStock);
  const outStock = list.filter((product) => !hasAvailableStock(product));

  return [...inStock, ...outStock];
}

function renderProducts(list) {
  const sortedList = sortProductsStockLast(
    [...list].sort(() => Math.random() - 0.5)
  );

  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;

  const pageItems = sortedList.slice(start, end);

  renderHomepageProducts(pageItems);

  renderPagination(sortedList);
}

function renderPagination(list) {
  const container = document.getElementById("paginationContainer");
  if (!container) return;

  const totalPages = Math.ceil(list.length / pageSize);

  let html = "";

  // Prev (dynamic safe)
  if (currentPage > 1) {
    html += `<button onclick="changePage(${currentPage - 1})">Prev</button>`;
  }

  // Pages
  for (let i = 1; i <= totalPages; i++) {
    html += `<button onclick="changePage(${i})" ${i === currentPage ? 'class="active"' : ""}>${i}</button>`;
  }

  // Next (dynamic safe)
  if (currentPage < totalPages) {
    html += `<button onclick="changePage(${currentPage + 1})">Next</button>`;
  }

  container.innerHTML = html;
}

function changePage(page) {

  const list = isSearching ? filteredProducts : products;

  const totalPages = Math.ceil(list.length / pageSize);

  if (page < 1 || page > totalPages) return;

  currentPage = page;

  renderProducts(list);
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

function renderCategoryShortcuts() {
  const shortcutGrid = document.getElementById("shortcutGrid");
  if (!shortcutGrid) return;

  // products na may stock lang
  const availableProducts = products.filter(product =>
    Number(product.stock || 0) > 0
  );

  // unique categories only
  const categories = [...new Set(
    availableProducts
      .map(product => safeText(product.category))
      .filter(Boolean)
  )];

  shortcutGrid.innerHTML = categories.map(category => `
    <a href="#"
       class="shortcut-item"
       onclick="filterByCategory('${category.replaceAll("'", "\\'")}'); return false;">

      <div class="shortcut-icon">📦</div>

      <span class="shortcut-label">${escapeHtml(category)}</span>

    </a>
  `).join("");
}

function scrollShortcutLeft() {
  document.getElementById("shortcutGrid")?.scrollBy({
    left: -400,
    behavior: "smooth"
  });
}

function scrollShortcutRight() {
  document.getElementById("shortcutGrid")?.scrollBy({
    left: 400,
    behavior: "smooth"
  });
}

window.addEventListener("pageshow", () => {
  if (sessionStorage.getItem("scrollTopOnBack") === "1") {
    sessionStorage.removeItem("scrollTopOnBack");

    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 0);
  }
});