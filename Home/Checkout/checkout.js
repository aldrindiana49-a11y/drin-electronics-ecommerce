const SUPABASE_URL = "https://zdinvxowzpkolbfzpcac.supabase.co";

const SUPABASE_ANON_KEY = "sb_publishable_yWOmkaQzsh7sInJPhDOFWw_tyjALAuP";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
const checkoutItems = document.getElementById("checkoutItems");
const checkoutSubtotal = document.getElementById("checkoutSubtotal");
const checkoutBtn = document.getElementById("checkoutBtn");
const checkoutShippingFee = document.getElementById("checkoutShippingFee");
const checkoutTotal = document.getElementById("checkoutTotal");
const shippingStatus = document.getElementById("shippingStatus");
const parcelEstimate = document.getElementById("parcelEstimate");
const shippingRow = document.querySelector(".shipping-row");
const areaGroupSelect = document.getElementById("areaGroup");
const provinceSelect = document.getElementById("province");
const citySelect = document.getElementById("city");
const barangaySelect = document.getElementById("barangay");
const fullAddressInput = document.getElementById("fullAddress");
const courierSelect = document.getElementById("courierSelect");
const courierStatus = document.getElementById("courierStatus");
const nameInput = document.getElementById("custName");
const phoneInput = document.getElementById("custPhone");
const emailInput = document.getElementById("custEmail");
let loggedInUser = null;
const deliveryLatInput = document.getElementById("deliveryLat");
const deliveryLngInput = document.getElementById("deliveryLng");
const pinStatus = document.getElementById("pinStatus");
const mapSearchInput = document.getElementById("mapSearchInput");
const mapSearchResults = document.getElementById("mapSearchResults");

let deliveryMap = null;
let deliveryMarker = null;

const PRIMARY_API_URL = "https://de-ecom-pro.onrender.com";

const BACKUP_API_URL =
  "https://drin-electronics-backup-a7u59.ondigitalocean.app";

const API_BASE_URL = PRIMARY_API_URL;

async function fetchWithFallback(path, options = {}) {
  const servers = [
    PRIMARY_API_URL,
    BACKUP_API_URL
  ];

  let lastError = null;

  for (const baseUrl of servers) {
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 3000);

    try {
      const response = await fetch(
        `${baseUrl}${path}`,
        {
          ...options,
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `Request failed: ${response.status}`
        );
      }

      return response;

    } catch (error) {
      clearTimeout(timeoutId);

      console.warn(
        "API failed:",
        baseUrl,
        error
      );

      lastError = error;
    }
  }

  throw lastError || new Error(
    "All backend servers failed"
  );
}

async function fetchSPXFast(path, options = {}) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 1500);

  try {
    const response = await fetch(
      `${PRIMARY_API_URL}${path}`,
      {
        ...options,
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (response.ok) {
      return response;
    }

    if (response.status < 500) {
      return response;
    }

  } catch (error) {
    clearTimeout(timeoutId);

    console.warn(
      "Primary SPX server slow/unavailable:",
      error
    );
  }

  return fetch(
    `${BACKUP_API_URL}${path}`,
    options
  );
}

const LALAMOVE_PICKUP = {
  lat: "14.5429244",
  lng: "121.1000368",
  address: "Villa Esguerra Half Court, Nagpayong Pinalad Rd, Brgy Pinagbuhatan, Pasig City"
};

let cartItems = JSON.parse(localStorage.getItem("drinCheckoutItems")) || [];

function getCartItemKey(item) {
  const id =
    item.productId ||
    item.id ||
    item.product_id ||
    "";

  const variant =
    item.variantLabel ||
    item.variant ||
    item.variation ||
    item.variantName ||
    item.selectedVariation ||
    item.option ||
    "";

  return `${String(id)}__${String(variant)}`;
}

function redirectIfNoCheckoutItems() {
  const checkout = JSON.parse(localStorage.getItem("drinCheckoutItems")) || [];
  const cart = JSON.parse(localStorage.getItem("drinCart")) || [];

  const cartMap = new Map(
    cart.map(item => [getCartItemKey(item), item])
  );

  const validCheckout = checkout
    .map(item => {
      const latestCartItem =
        cartMap.get(getCartItemKey(item));

      return latestCartItem || null;
    })
    .filter(Boolean);

  if (!validCheckout.length) {
    cartItems = [];
    localStorage.removeItem("drinCheckoutItems");
    window.location.href = "../Cart/index.html";
    return false;
  }

  localStorage.setItem("drinCheckoutItems", JSON.stringify(validCheckout));
  cartItems = validCheckout;

  return true;
}

redirectIfNoCheckoutItems();

window.addEventListener("pageshow", function () {
  if (redirectIfNoCheckoutItems()) {
    renderCheckout();
  }
});


let currentShippingFee = null;
const HANDLING_FEE = 25;
let currentShippingQuote = null;
let currentParcelInfo = null;
let shippingQuoteTimer = null;
let selectedCourier = "";
let claimedVoucher = null;
let voucherDiscount = 0;
let SPX_ADDRESSES = [];
let ADDRESS_DATA = {};

const AREA_GROUPS = ["Metro Manila", "North Luzon", "South Luzon", "Visayas", "Mindanao"];

async function loadSPXAddresses() {
  const res = await fetch("spx-addresses.json");

  SPX_ADDRESSES = await res.json();

  ADDRESS_DATA = {};

  SPX_ADDRESSES.forEach((row) => {

    const province = row.city;
    const city = row.district;

    const barangay = row.street;

    if (!ADDRESS_DATA[province]) {
      ADDRESS_DATA[province] = {
        areaGroup: row.state,
        cities: {}
      };
    }

    if (!ADDRESS_DATA[province].cities[city]) {
      ADDRESS_DATA[province].cities[city] = {
        zip: row.zip_code || row.zip || row.post_code || row.postcode || row.postal_code || row.postal || row.zipcode || "",
        barangays: [],
        couriers: [
          "SPX",
          "Same Day Delivery / Lalamove",
        ]
      };
    }

    ADDRESS_DATA[province].cities[city].barangays.push(barangay);

  });
}

function cleanPrice(value) {
  return Number(String(value || "0").replace(/[^\d.]/g, "")) || 0;
}

function cleanQty(value) {
  return Number(value) || 1;
}

function formatPrice(value) {
  return `₱${Number(value || 0).toLocaleString("en-PH")}`;
}

function safeText(value, fallback = "") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function resetSelect(select, label = "- choose -") {
  if (!select) return;
  select.innerHTML = `<option value="">${label}</option>`;
}

function getCheckoutTotal() {
  return cartItems.reduce((sum, item) => {
    return sum + cleanPrice(item.price) * cleanQty(item.quantity);
  }, 0);
}

function getItemWeight(item) {
  return Number(
    item.weight ??
    item.parcel_weight ??
    item.shippingWeight ??
    0.01
  );
}

function getItemLength(item) {
  return Number(
    item.length ??
    item.parcel_length ??
    item.shippingLength ??
    1
  );
}

function getItemWidth(item) {
  return Number(
    item.width ??
    item.parcel_width ??
    item.shippingWidth ??
    1
  );
}

function getItemHeight(item) {
  return Number(
    item.height ??
    item.parcel_height ??
    item.shippingHeight ??
    1
  );
}

function calculateParcelInfo(items = cartItems) {
  if (!items.length) {
    return {
      parcelWeight: 0,
      parcelLength: 0,
      parcelWidth: 0,
      parcelHeight: 0,
      itemQuantity: 0,
      itemName: "Electronics",
      itemType: "Electronics",
    };
  }

  let totalWeight = 0;
  let totalQuantity = 0;
  let maxLength = 0;
  let maxWidth = 0;
  let stackedHeight = 0;

  items.forEach((item) => {

    const quantity = cleanQty(item.quantity);

    if (quantity > 50) {
      showOrderModal(
        "Quantity Limit",
        "Maximum 50 pcs only per SKU / variation."
      );

      throw new Error("SKU quantity limit exceeded");
    }

    totalQuantity += quantity;
    const actualWeight =
      getItemWeight(item) * quantity;

    const volumetricWeight =
      (
        getItemLength(item) *
        getItemWidth(item) *
        getItemHeight(item)
      ) / 3500 * quantity;

    totalWeight += Math.max(
      actualWeight,
      volumetricWeight
    );
    maxLength = Math.max(maxLength, getItemLength(item));
    maxWidth = Math.max(maxWidth, getItemWidth(item));
    stackedHeight += getItemHeight(item) * quantity;
  });

  return {
    parcelWeight: Number(Math.max(totalWeight, 0.1).toFixed(2)),
    parcelLength: Number(Math.max(maxLength, 1).toFixed(2)),
    parcelWidth: Number(Math.max(maxWidth, 1).toFixed(2)),
    parcelHeight: Number(Math.max(Math.min(stackedHeight, 149), 1).toFixed(2)),
    itemQuantity: totalQuantity,
    itemName: items[0]?.name || "Electronics",
    itemType: "Electronics",
  };
}

function updateParcelEstimate() {
  currentParcelInfo = calculateParcelInfo();


  if (!parcelEstimate) return;

  if (!cartItems.length) {
    parcelEstimate.textContent = "No parcel data yet";
    return;
  }

  parcelEstimate.textContent = `${currentParcelInfo.parcelWeight}kg • ${currentParcelInfo.parcelLength}×${currentParcelInfo.parcelWidth}×${currentParcelInfo.parcelHeight}cm`;
}

function setShippingUI(status, message, fee = null) {
  if (shippingRow) {
    shippingRow.classList.remove("loading", "ready", "failed");
    if (status) shippingRow.classList.add(status);
  }

  if (shippingStatus) shippingStatus.innerHTML = message;
  if (checkoutShippingFee) checkoutShippingFee.textContent = fee === null ? "To be confirmed" : formatPrice(fee);

  updateTotalsDisplay();

  if (checkoutBtn) {

    checkoutBtn.disabled = false;
    checkoutBtn.style.pointerEvents = "auto";
    checkoutBtn.style.opacity = "1";

  }
}

function updateTotalsDisplay() {

  const subtotal =
    getCheckoutTotal();

  const voucherRow =
    document.getElementById(
      "voucherSummaryRow"
    );

  const voucherLabel =
    document.getElementById(
      "voucherSummaryLabel"
    );

  const voucherAmount =
    document.getElementById(
      "voucherSummaryAmount"
    );

  voucherDiscount = 0;

  if (
    claimedVoucher &&
    subtotal >= Number(claimedVoucher.min_spend || 0)
  ) {

    voucherDiscount =
      Number(
        claimedVoucher.discount_amount || 0
      );

    if (voucherRow) {
      voucherRow.style.display = "flex";
    }

    if (voucherLabel) {
      voucherLabel.textContent =
        `Voucher (${claimedVoucher.code})`;
    }

    if (voucherAmount) {
      voucherAmount.textContent =
        `-₱${voucherDiscount.toLocaleString()}`;
    }

  } else {

    if (voucherRow) {
      voucherRow.style.display = "none";
    }

  }

  const isLalamove =
    selectedCourier === "Same Day Delivery / Lalamove";

  const selectedPaymentMethod =
    document.querySelector(
      'input[name="payment"]:checked'
    )?.value?.trim()?.toUpperCase() || "";

  const isOverTheCounter =
    selectedPaymentMethod === "OVER_THE_COUNTER";

  const handlingFeeRow =
    document.getElementById("handlingFeeRow");

  const handlingFeeNote =
    document.getElementById("handlingFeeNote");

  if (handlingFeeRow) {
    handlingFeeRow.style.display =
      isOverTheCounter ? "none" : "flex";
  }

  if (handlingFeeNote) {
    handlingFeeNote.style.display =
      isOverTheCounter ? "none" : "block";
  }

  const grandTotal =
    subtotal -
    voucherDiscount +
    (isLalamove ? 0 : (Number(currentShippingFee) || 0)) +
    (isOverTheCounter ? 0 : HANDLING_FEE);

  if (checkoutSubtotal) {

    checkoutSubtotal.textContent =
      formatPrice(subtotal);
  }

  if (checkoutTotal) {

    checkoutTotal.textContent =
      formatPrice(grandTotal);
  }
}

function renderCheckout() {
  if (!checkoutItems || !checkoutTotal) return;

  if (!cartItems.length) {
    checkoutItems.innerHTML = `<p>No selected items.</p>`;
    currentShippingFee = null;
    currentShippingQuote = null;
    updateParcelEstimate();
    updateTotalsDisplay();
    setShippingUI("failed", "No items to ship", null);
    return;
  }

  checkoutItems.innerHTML = "";

  cartItems.forEach((item) => {
    const price = cleanPrice(item.price);
    const quantity = cleanQty(item.quantity);

    const itemTotal = price * quantity;

    const div = document.createElement("div");
    div.className = "checkout-item";

    div.innerHTML = `
  <div class="co-item">
    <img src="${safeText(item.image, "https://via.placeholder.com/100")}" />

    <div>
      <h4>${safeText(item.name, "Product")}</h4>

      ${item.variantLabel
        ? `<p class="checkout-variant">Variation: ${safeText(item.variantLabel)}</p>`
        : ""
      }

      <p>Qty: ${quantity}</p>
      <p>${formatPrice(itemTotal)}</p>
    </div>
  </div>
`;

    checkoutItems.appendChild(div);
  });

  updateParcelEstimate();
  updateTotalsDisplay();
}

function loadAreaGroups() {
  resetSelect(areaGroupSelect);
  AREA_GROUPS.forEach((group) => {
    const opt = document.createElement("option");
    opt.value = group;
    opt.textContent = group;
    areaGroupSelect.appendChild(opt);
  });
}

function loadProvinces() {
  resetSelect(provinceSelect);
  resetSelect(citySelect);
  resetSelect(barangaySelect);
  resetSelect(courierSelect);

  selectedCourier = "";
  currentShippingFee = null;
  currentShippingQuote = null;

  const selectedArea = areaGroupSelect.value;

  const provinces = Object.keys(ADDRESS_DATA)
    .filter((province) => ADDRESS_DATA[province].areaGroup === selectedArea)
    .sort((a, b) => a.localeCompare(b));

  provinces.forEach((province) => {
    const opt = document.createElement("option");
    opt.value = province;
    opt.textContent = province;
    provinceSelect.appendChild(opt);
  });

  updateCourierOptions();
}

function loadCities() {
  resetSelect(citySelect);
  resetSelect(barangaySelect);
  resetSelect(courierSelect);

  selectedCourier = "";
  currentShippingFee = null;
  currentShippingQuote = null;

  const province = provinceSelect.value;
  const cities = ADDRESS_DATA[province]?.cities || {};

  Object.keys(cities)
    .sort((a, b) => a.localeCompare(b))
    .forEach((city) => {
      const opt = document.createElement("option");
      opt.value = city;
      opt.textContent = city;
      citySelect.appendChild(opt);
    });

  updateCourierOptions();
}

function loadBarangays() {
  resetSelect(barangaySelect);
  resetSelect(courierSelect);

  selectedCourier = "";
  currentShippingFee = null;
  currentShippingQuote = null;

  const province = provinceSelect.value;
  const city = citySelect.value;
  const cityData = ADDRESS_DATA[province]?.cities?.[city];

  (cityData?.barangays || []).forEach((barangay) => {
    const opt = document.createElement("option");
    opt.value = barangay;
    opt.textContent = barangay;
    barangaySelect.appendChild(opt);
  });

  updateCourierOptions();
}

function updateCourierOptions() {
  const currentValue = courierSelect?.value || "";

  resetSelect(courierSelect);

  const selectedArea =
    String(areaGroupSelect?.value || "")
      .trim()
      .toLowerCase();

  const selectedProvince =
    String(provinceSelect?.value || "")
      .trim()
      .toLowerCase();

  const lalamovePickupAllowedArea =
    selectedArea === "metro manila" ||
    selectedProvince.includes("rizal") ||
    selectedProvince.includes("cavite") ||
    selectedProvince.includes("laguna") ||
    selectedProvince.includes("bulacan");

  const parcelInfo = calculateParcelInfo();
  const parcelWeight = Number(parcelInfo.parcelWeight || 0);

  const availableCouriers = [];

  if (parcelWeight <= 50) {
    availableCouriers.push("SPX");
  }

  if (parcelWeight >= 10 || parcelWeight > 50) {
    availableCouriers.push("Manual Freight Delivery");
  }

  if (lalamovePickupAllowedArea) {
    availableCouriers.push(
      "Same Day Delivery / Lalamove",
      "Store Pickup"
    );
  }

  availableCouriers.forEach((courier) => {
    const opt = document.createElement("option");

    opt.value = courier;

    opt.textContent =
      courier === "Manual Freight Delivery"
        ? "Overland Cargo"
        : courier;

    courierSelect.appendChild(opt);
  });

  courierSelect.value = "";
  selectedCourier = "";

  if (courierStatus) {
    if (parcelWeight > 50) {

      courierStatus.classList.add("courier-weight-warning");

      courierStatus.innerHTML = `
      ⚠️ <strong>Estimated chargeable weight: ${parcelWeight}kg</strong><br>
      This may be based on actual weight or parcel dimensions.<br>
      SPX supports up to 50kg only. Please select <strong>Overland Cargo</strong> or another available courier.
    `;

    } else {

      courierStatus.classList.remove("courier-weight-warning");

      courierStatus.textContent = selectedCourier
        ? `${selectedCourier === "Manual Freight Delivery"
          ? "Overland Cargo"
          : selectedCourier
        } selected`
        : "Please select courier";
    }
  }

  if (selectedCourier) {
    saveCustomerCheckoutInfo();
  }

  scheduleShippingQuote();
}

function showOrderModal(title, message, showLoader = false) {
  const modal = document.getElementById("orderModal");
  const modalTitle = document.getElementById("orderModalTitle");
  const modalMessage = document.getElementById("orderModalMessage");

  if (!modal || !modalTitle || !modalMessage) {
    alert(`${title}: ${message}`);
    return;
  }

  modalTitle.textContent = title;
  modalMessage.innerHTML = showLoader
    ? `<div class="payment-loader"></div><p>${message}</p>`
    : message;

  // DISABLE CLOSE
  modal.onclick = null;

  const okBtn = document.getElementById("orderModalOk");
  const closeBtn = document.getElementById("orderModalClose");

  if (okBtn) {
    okBtn.style.display = showLoader ? "none" : "inline-block";
    okBtn.onclick = closeOrderModal;
  }

  if (closeBtn) {
    closeBtn.style.display = showLoader ? "none" : "inline-block";
  }

  modal.classList.add("show");
}

function closeOrderModal() {
  const modal = document.getElementById("orderModal");
  if (modal) modal.classList.remove("show");
}

function togglePayment(enabled = false) {
  const paymentOptions =
    document.querySelectorAll(
      'input[name="payment"]'
    );

  paymentOptions.forEach((input) => {
    input.disabled = !enabled;

    if (!enabled) {
      input.checked = false;
    }

    const paymentBox =
      input.closest("label") ||
      input.parentElement;

    if (!paymentBox) return;

    paymentBox.style.display =
      enabled ? "" : "none";

    if (!paymentBox.dataset.courierLockAdded) {
      paymentBox.dataset.courierLockAdded = "true";

      paymentBox.addEventListener(
        "click",
        function (event) {
          if (courierSelect?.value) return;

          event.preventDefault();
          event.stopPropagation();

          showOrderModal(
            "Select Your Courier First",
            `
            <div style="
              padding:10px 4px;
              text-align:center;
            ">

              <div style="
                width:72px;
                height:72px;
                margin:0 auto 16px;
                display:flex;
                align-items:center;
                justify-content:center;
                border-radius:50%;
                background:linear-gradient(
                  135deg,
                  #fff7ed,
                  #ffedd5
                );
                font-size:36px;
                box-shadow:0 8px 24px
                  rgba(249,115,22,0.18);
              ">
                🚚
              </div>

              <h3 style="
                margin:0 0 10px;
                color:#111827;
                font-size:21px;
              ">
                Choose Delivery Courier
              </h3>

              <p style="
                margin:0;
                color:#4b5563;
                line-height:1.65;
              ">
                Please select your preferred courier
                before choosing a payment method.
              </p>

              <div style="
                margin:16px 0;
                padding:13px;
                border-radius:12px;
                background:#f8fafc;
                border:1px solid #e5e7eb;
                color:#374151;
                font-size:14px;
                line-height:1.55;
              ">
                Your courier determines which payment
                methods are available for your order.
              </div>

              <button
                type="button"
                id="selectCourierNowBtn"
                style="
                  width:100%;
                  padding:13px 16px;
                  border:none;
                  border-radius:10px;
                  background:#f97316;
                  color:#ffffff;
                  font-size:15px;
                  font-weight:700;
                  cursor:pointer;
                "
              >
                Select Courier Now
              </button>

            </div>
            `
          );

          setTimeout(() => {
            const selectCourierBtn =
              document.getElementById(
                "selectCourierNowBtn"
              );

            if (selectCourierBtn) {
              selectCourierBtn.onclick =
                function () {
                  closeOrderModal();

                  courierSelect?.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                  });

                  setTimeout(() => {
                    courierSelect?.focus();
                  }, 400);
                };
            }
          }, 50);
        },
        true
      );
    }
  });

  let paymentLockNotice =
    document.getElementById("paymentLockNotice");

  const firstPaymentInput =
    document.querySelector('input[name="payment"]');

  const paymentContainer =
    firstPaymentInput?.closest(
      ".payment-section, .payment-methods, section"
    ) || firstPaymentInput?.parentElement;

  if (!paymentLockNotice && paymentContainer) {
    paymentLockNotice =
      document.createElement("div");

    paymentLockNotice.id = "paymentLockNotice";

    paymentLockNotice.innerHTML = `
    <div style="
      padding:16px;
      border:1px solid #fed7aa;
      border-radius:12px;
      background:#fff7ed;
      color:#9a3412;
      text-align:center;
      line-height:1.6;
    ">
      <strong>🚚 Select Courier First</strong><br>
      Available payment methods will appear after
      choosing your delivery courier.
    </div>
  `;

    paymentContainer.prepend(paymentLockNotice);
  }

  if (paymentLockNotice) {
    paymentLockNotice.style.display =
      enabled ? "none" : "block";
  }

  if (checkoutBtn) {
    checkoutBtn.disabled = !enabled;
    checkoutBtn.style.pointerEvents =
      enabled ? "auto" : "none";
    checkoutBtn.style.opacity =
      enabled ? "1" : "0.6";
  }
}

if (nameInput) {
  nameInput.addEventListener("input", () => {
    nameInput.value = nameInput.value.replace(/[^a-zA-Z\s]/g, "");
  });
}

if (phoneInput) {
  phoneInput.addEventListener("input", () => {
    phoneInput.value = phoneInput.value.replace(/[^0-9]/g, "");
  });
}


if (emailInput) {
  emailInput.addEventListener("input", () => {
    let value = emailInput.value.replace(
      /[^a-zA-Z0-9._@+-]/g,
      ""
    );

    const atIndex = value.indexOf("@");

    if (atIndex !== -1) {
      value =
        value.slice(0, atIndex + 1) +
        value.slice(atIndex + 1).replace(/@/g, "");
    }

    emailInput.value = value;
  });
}


function cleanImageForOrder(image) {
  const img = String(image || "");

  if (img.startsWith("data:")) {
    return "";
  }

  return img;
}

function normalizeOrderItems(items) {
  return items.map((item) => {
    const orderImage = cleanImageForOrder(
      item.variant_image ||
      item.variantImage ||
      item.product_image ||
      item.productImage ||
      item.image ||
      item.img ||
      item.photo ||
      ""
    );

    return {

      id: item.id || item.productId,
      productId: item.productId || item.id,
      name: item.name || item.product_name || item.title || "Product",
      quantity: item.quantity || item.qty || 1,
      price: item.price || 0,

      image: orderImage,
      variant_image: orderImage,
      product_image: orderImage,

      sku: item.sku || "",
      variant:
        item.variantLabel ||
        item.variant ||
        item.variation ||
        item.variant_name ||
        item.variantName ||
        item.option ||
        item.option_name ||
        item.selected_variant ||
        item.selectedVariation ||
        item.label ||
        "",
      variantLabel:
        item.variantLabel ||
        item.variant ||
        item.variation ||
        item.variant_name ||
        item.variantName ||
        item.option ||
        item.option_name ||
        item.selected_variant ||
        item.selectedVariation ||
        item.label ||
        "",
      weight: Number(item.weight ?? item.parcel_weight ?? item.shippingWeight ?? 0.01),
      length: Number(item.length ?? item.parcel_length ?? item.shippingLength ?? 1),
      width: Number(item.width ?? item.parcel_width ?? item.shippingWidth ?? 1),
      height: Number(item.height ?? item.parcel_height ?? item.shippingHeight ?? 1),
    };
  });
}

function saveOrder(order) {
  try {
    let orders = JSON.parse(localStorage.getItem("drinOrders")) || [];
    const lightOrder = { ...order, items: normalizeOrderItems(order.items) };
    orders.push(lightOrder);
    orders = orders.slice(-10);
    localStorage.setItem("drinOrders", JSON.stringify(orders));
  } catch (error) {
    console.warn("Storage full. Resetting old orders...");
    localStorage.removeItem("drinOrders");
    localStorage.setItem("drinOrders", JSON.stringify([order]));
  }
}

async function syncOrderToSupabase(order) {

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  console.log("SAVING ORDER TO SUPABASE:", {
    user_id: user?.id || null,
    external_id: order.id,
    items: order.items,
    amount: order.total
  });

  const { error } = await supabaseClient
    .from("orders")
    .insert([
      {
        user_id: user?.id || null,
        guest_order: order.guestOrder,
        guest_tracking_code: order.guestTrackingCode,
        external_id: order.id,
        items: order.items,
        amount: order.total,
        order_status: order.status,
        payment_method: order.payment?.method || "",
        courier: order.courier,
        address: order.address,
        customer_name: order.customer.name,
        customer_phone: order.customer.phone,
        customer_email: order.customer.email,
        subtotal: order.subtotal,
        shipping_fee: order.shippingFee,

        shipping_payment_method:
          order.payment?.method === "SKYRO"
            ? "COD"
            : "",

        shipping_cod_amount:
          order.payment?.method === "SKYRO"
            ? Number(order.shippingCodAmount || 0)
            : 0,

        service_fee: Number(
          order.serviceFee ||
          order.handlingFee ||
          0
        ),

        voucher_code: order.voucherCode,
        voucher_discount: order.voucherDiscount,
      }
    ]);

  console.log("SUPABASE INSERT ERROR:", error);

  if (error) {
    console.error("SUPABASE ORDER SYNC ERROR:", error);
    throw new Error(error.message);
  }

  return true;
}

function clearCheckedCartItems() {
  const checkedOutItems =
    JSON.parse(localStorage.getItem("drinCheckoutItems")) || [];

  let cart =
    JSON.parse(localStorage.getItem("drinCart")) || [];

  const checkedKeys =
    new Set(checkedOutItems.map(getCartItemKey));

  cart = cart.filter(cartItem => {
    return !checkedKeys.has(getCartItemKey(cartItem));
  });

  localStorage.setItem("drinCart", JSON.stringify(cart));
  localStorage.removeItem("drinCheckoutItems");

  window.dispatchEvent(new Event("storage"));
}

function getSelectedAddress() {
  const cityData =
    ADDRESS_DATA[provinceSelect?.value]
      ?.cities?.[citySelect?.value];

  return {
    country: "Philippines",
    areaGroup: areaGroupSelect?.value || "",
    province: provinceSelect?.value || "",
    city: citySelect?.value || "",
    barangay: barangaySelect?.value || "",
    zip: cityData?.zip || "",
    fullAddress: fullAddressInput?.value.trim() || "",
    lat: deliveryLatInput?.value || "",
    lng: deliveryLngInput?.value || "",
    pinAddress: mapSearchInput?.value.trim() || ""
  };
}

function isAddressComplete() {
  const address = getSelectedAddress();

  const isLalamove =
    courierSelect?.value === "Same Day Delivery / Lalamove";

  if (isLalamove) {
    return Boolean(
      address.areaGroup &&
      address.province &&
      address.city &&
      address.barangay
    );
  }

  return Boolean(
    address.areaGroup &&
    address.province &&
    address.city &&
    address.barangay &&
    address.fullAddress
  );
}

function scheduleShippingQuote() {
  clearTimeout(shippingQuoteTimer);

  currentShippingFee = null;
  currentShippingQuote = null;

  updateTotalsDisplay();

  if (!cartItems.length) {
    setShippingUI("failed", "No items to ship", null);
    return;
  }

  if (!isAddressComplete()) {
    setShippingUI("", "Complete address to calculate", null);
    return;
  }

  if (!selectedCourier) {
    setShippingUI("", "Please select courier", null);
    return;
  }

  if (selectedCourier === "Manual Freight Delivery") {
    currentShippingFee = 0;

    currentShippingQuote = {
      success: true,
      manualDelivery: true,
      courier: selectedCourier
    };

    setShippingUI(
      "ready",
      `
  <div class="delivery-notice-box">
    <strong>🚚 Overland Cargo</strong><br><br>

    This delivery option may use:<br>
    • RORO<br>
    • Bus cargo<br>
    • Trucking<br>
    • Cargo forwarding<br>
    • Other manual shipping arrangements<br><br>

    Shipping fee and delivery schedule are not included
    in checkout and will be confirmed separately by our team.<br><br>

    <span class="delivery-payment-warning">
      Please wait for our confirmation before making
      any separate freight payment.
    </span>
  </div>
  `,
      0
    );

    return;
  }

  if (selectedCourier === "Store Pickup") {
    currentShippingFee = 0;

    currentShippingQuote = {
      success: true,
      storePickup: true,
      courier: selectedCourier
    };

    setShippingUI(
      "ready",
      `
    <div class="delivery-notice-box">
      <strong>🏪 Store Pickup</strong><br><br>

      No shipping fee.<br><br>

      Please wait for confirmation that your order
      is ready before visiting the store.
    </div>
    `,
      0
    );

    return;
  }

  if (selectedCourier === "Same Day Delivery / Lalamove") {

    const noPin =
      !deliveryLatInput?.value || !deliveryLngInput?.value;

    if (noPin) {

      setShippingUI(
        "ready",
        `
      <div class="delivery-notice-box">
        <strong>⚠ Same Day Delivery Notice</strong><br><br>

        Final delivery fee will be confirmed after address verification.<br><br>

        Delivery charges may vary depending on parcel size, actual weight, route distance, and courier booking conditions.<br><br>

        <span class="delivery-payment-warning">
          Shipping fee is NOT included in checkout and must be paid separately to the rider upon delivery.
        </span>
      </div>
      `,
        null
      );

      return;
    }

    shippingQuoteTimer = setTimeout(
      calculateLalamoveFee,
      200
    );

    return;
  }

  // REAL SPX API
  setShippingUI("loading", "Checking delivery availability and shipping fee...", null);

  shippingQuoteTimer = setTimeout(calculateShippingFee, 200);
}

function estimateFallbackShippingFee(courier) {
  return 0;
}

function initDeliveryMap() {
  const mapBox = document.getElementById("deliveryMap");

  if (!mapBox || typeof L === "undefined") return;

  deliveryMap = L.map("deliveryMap").setView(
    [14.5429244, 121.1000368],
    12
  );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }
  ).addTo(deliveryMap);

  deliveryMap.on("click", function (e) {
    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);

    if (deliveryMarker) {
      deliveryMarker.setLatLng(e.latlng);
    } else {
      deliveryMarker = L.marker(e.latlng).addTo(deliveryMap);
    }

    deliveryLatInput.value = lat;
    deliveryLngInput.value = lng;

    if (pinStatus) {
      pinStatus.classList.remove("pin-warning");
      pinStatus.classList.add("pin-success");

      pinStatus.textContent =
        "✅ Pinned location selected";
    }

    saveCustomerCheckoutInfo();
    scheduleShippingQuote();
  });

  setTimeout(() => {
    deliveryMap.invalidateSize();
  }, 500);
}

async function searchLocation(query) {
  console.log("Searching location:", query);

  if (!mapSearchInput || !mapSearchResults) {
    console.log("Search input/results missing");
    return;
  }

  if (!query || query.length < 4) {
    mapSearchResults.innerHTML = "";
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/location-search?q=${encodeURIComponent(query)}`
    );

    const data = await res.json();

    console.log("Map search results:", data);

    mapSearchResults.innerHTML = "";

    mapSearchResults.innerHTML = `

  <div class="map-tap-hint">
    👇 Select one address below to confirm location and estimate shipping fee
  </div>
  `;

    if (!data.length) {
      mapSearchResults.innerHTML = `
        <div class="map-result-item no-address-box">
          ⚠ Exact location not found.<br><br>

          No worries — you can still place your order.<br><br>

          Enter your complete address and nearest landmark.<br><br>

          Our team will manually verify your delivery location and confirm the final Same Day Delivery fee before booking.
        </div>
      `;
      return;
    }

    data.forEach(place => {
      const div = document.createElement("div");
      div.className = "map-result-item";
      div.textContent = place.display_name;

      div.onclick = function () {
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lon);

        deliveryMap.setView([lat, lng], 17);

        if (deliveryMarker) {
          deliveryMarker.setLatLng([lat, lng]);
        } else {
          deliveryMarker = L.marker([lat, lng]).addTo(deliveryMap);
        }

        deliveryLatInput.value = lat;
        deliveryLngInput.value = lng;

        pinStatus.classList.remove("pin-warning");
        pinStatus.classList.add("pin-success");
        pinStatus.textContent = "✅ Location selected successfully";
        mapSearchInput.value = place.display_name;
        mapSearchResults.innerHTML = "";

        saveCustomerCheckoutInfo();
        scheduleShippingQuote();
      };

      mapSearchResults.appendChild(div);
    });

  } catch (error) {
    console.error("MAP SEARCH ERROR:", error);

    mapSearchResults.innerHTML = `
      <div class="map-result-item">
        Search service unavailable. Try again.
      </div>
    `;
  }
}

async function geocodeAddress(address) {
  const fullAddress = [
    address.fullAddress,
    address.barangay,
    address.city,
    address.province,
    "Philippines"
  ].filter(Boolean).join(", ");

  const res = await fetch(
    `${API_BASE_URL}/api/location-search?q=${encodeURIComponent(fullAddress)}`
  );

  const data = await res.json();

  if (!data.length) {
    throw new Error("Address could not be located");
  }

  return {
    lat: data[0].lat,
    lng: data[0].lon,
    address: fullAddress
  };
}

async function calculateLalamoveFee() {
  showOrderModal(
    "Checking Same Day Delivery",
    "Please wait while we check Lalamove availability and shipping rate...",
    true
  );

  setShippingUI("loading", "Checking Same Day Delivery availability...", null);

  try {
    const address = getSelectedAddress();

    currentParcelInfo = calculateParcelInfo();


    const pinnedLat = deliveryLatInput?.value;
    const pinnedLng = deliveryLngInput?.value;

    if (!pinnedLat || !pinnedLng) {
      showOrderModal(
        "Location Required",
        "Please search and select your exact delivery location for Same Day Delivery."
      );

      const okBtn = document.getElementById("orderModalOk");

      if (okBtn) {
        okBtn.onclick = function () {
          closeOrderModal();
          enableCustomerEdit();

          mapSearchInput?.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });

          setTimeout(() => {
            mapSearchInput?.focus();
          }, 400);
        };
      }

      return;
    }

    const dropoff = {
      lat: pinnedLat,
      lng: pinnedLng,
      address: [
        address.fullAddress,
        address.barangay,
        address.city,
        address.province,
        "Philippines"
      ].filter(Boolean).join(", ")
    };

    const res = await fetch(`${API_BASE_URL}/api/lalamove/quotation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        data: {
          serviceType: "MOTORCYCLE",
          language: "en_PH",
          stops: [
            {
              coordinates: {
                lat: LALAMOVE_PICKUP.lat,
                lng: LALAMOVE_PICKUP.lng
              },
              address: LALAMOVE_PICKUP.address
            },
            {
              coordinates: {
                lat: dropoff.lat,
                lng: dropoff.lng
              },
              address: dropoff.address
            }
          ]
        }
      })
    });

    const data = await res.json();

    console.log("FULL LALAMOVE API RESPONSE:", data);

    if (!res.ok || !data.success) {
      currentShippingFee = null;
      currentShippingQuote = {
        success: false,
        unsupportedArea: true,
        courier: "Same Day Delivery / Lalamove",
        lalamoveError: data
      };

      setShippingUI(
        "failed",
        "Location not verified. Same Day Delivery currently covers Metro Manila and selected nearby areas. Please check your street or landmark details, or use SPX delivery.",
        null
      );
      closeOrderModal();
      return;
    }

    const quote = data.data?.data;
    const totalFee = Number(quote?.priceBreakdown?.total || 0);

    currentShippingFee = totalFee;
    currentShippingQuote = {
      success: true,
      courier: "Same Day Delivery / Lalamove",
      lalamove: quote
    };

    setShippingUI(
      "ready",
      `Estimated Shipping Fee: ${formatPrice(totalFee)}
Actual shipping fee depends on final parcel size, weight, route, waiting time, and rider adjustments.`,
      totalFee
    );

    if (shippingStatus) {
      shippingStatus.innerHTML = `
        <div class="shipping-estimate-box">
          <strong>⚠ Shipping Fee Notice</strong><br><br>

          Minimum estimated fee only.<br><br>

          Actual shipping fee may vary depending on parcel size, route distance, waiting time, and rider adjustments.<br><br>

          <span class="shipping-estimate-warning">
            This delivery fee is NOT included in checkout and will be paid directly to the Lalamove rider upon delivery.
          </span>
        </div>
      `;
    }

    document.querySelector(".checkout-summary")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    closeOrderModal();

  } catch (error) {
    console.error("LALAMOVE FEE ERROR:", error);

    currentShippingFee = null;
    currentShippingQuote = {
      success: false,
      unsupportedArea: true,
      error: error.message
    };

    setShippingUI(
      "failed",
      "Location not verified. Same Day Delivery currently covers Metro Manila and selected nearby areas. Please check your street or landmark details, or use SPX delivery.",
      null
    );
    closeOrderModal();
  }
}


async function calculateShippingFee() {
  showOrderModal(
    "Checking SPX Shipping Fee",
    "Please wait while we calculate the best shipping rate for your address...",
    true
  );

  const slowShippingTimer = setTimeout(() => {

    const modalMessage =
      document.getElementById("orderModalMessage");

    if (modalMessage) {

      modalMessage.innerHTML = `
      <div class="payment-loader"></div>
      <p>
        Shipping calculation is taking longer than usual.<br><br>
        Please wait while we check courier availability...
      </p>
    `;
    }

  }, 15000);

  try {
    currentParcelInfo = calculateParcelInfo();



    const address = getSelectedAddress();

    const selectedPaymentMethod =
      document.querySelector('input[name="payment"]:checked')?.value || "";

    const paymentMethod =
      selectedPaymentMethod === "SKYRO"
        ? "COD"
        : selectedPaymentMethod || "COD";

    const subtotal = getCheckoutTotal();

    const normalizedItems = normalizeOrderItems(cartItems);

    const orderItems = normalizedItems.map((item) => ({
      item_name: item.name,
      item_quantity: Number(item.quantity) || 1,
      item_value: Number(item.price) || 0
    }));


    const res = await fetchSPXFast(
      "/api/spx/check-shipping-fee",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: subtotal,
          paymentMethod,
          address,
          parcelInfo: currentParcelInfo,
          items: normalizedItems,

          base_info: {
            ed_item_list: orderItems
          },

          baseInfo: {
            ed_item_list: orderItems
          }
        })
      }
    );

    const data = await res.json();

    window.lastSPXResponse = data;
    // console.log("FULL SPX RESPONSE:", data);

    if (!res.ok || !data.success) {
      console.log("SPX ERROR RESPONSE:", window.lastSPXResponse = data);
      // alert(JSON.stringify(data));

      const isUnsupportedArea =
        JSON.stringify(data).includes("NotSupportDeliverAddressErrorCode");

      if (isUnsupportedArea) {

        currentShippingFee = null;

        currentShippingQuote = {
          success: false,
          unsupportedArea: true
        };

        setShippingUI(
          "failed",
          "SPX is not available in this area.",
          null
        );
        clearTimeout(slowShippingTimer);
        closeOrderModal();

        return;
      }

      currentShippingFee = null;
      currentShippingQuote = {
        success: false,
        courier: selectedCourier,
        fallback: false,
        spxError: data,
      };

      setShippingUI(
        "failed",
        "SPX error. Check console for details.",
        null
      );
      clearTimeout(slowShippingTimer);
      closeOrderModal();
      return;
    }

    currentShippingQuote = data;
    currentShippingFee = Number(data.shippingFee || 0);

    const etaText = data.edtMin !== undefined && data.edtMax !== undefined
      ? `SPX estimated delivery: ${data.edtMin}-${data.edtMax} day(s)`
      : "SPX shipping fee calculated";

    setShippingUI("ready", etaText, currentShippingFee);

    document.querySelector(".checkout-summary")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    clearTimeout(slowShippingTimer);
    closeOrderModal();

  } catch (error) {
    console.error("SHIPPING FEE ERROR:", error);

    currentShippingFee = null;
    currentShippingQuote = {
      success: false,
      courier: selectedCourier,
      fallback: false,
      error: error.message,
    };

    setShippingUI(
      "failed",
      "SPX connection error. Check console.",
      null
    );

    clearTimeout(slowShippingTimer);
    closeOrderModal();

  }
}

function getFallbackCourier() {

  return "Same Day Delivery / Lalamove";

}

async function deductOrderStock(order) {
  if (!order?.items?.length) {
    return true;
  }

  const stockRequests = order.items.map(async (item) => {
    const productId =
      item.productId ||
      item.product_id ||
      item.productID ||
      item.id;

    const variantLabel =
      item.variantLabel ||
      item.variant ||
      item.variation ||
      item.variant_name ||
      item.variantName ||
      item.option ||
      item.label ||
      "Default";

    const quantity = Number(
      item.quantity ||
      item.qty ||
      item.quantityOrdered ||
      1
    );

    const { error } = await supabaseClient.rpc(
      "deduct_stock",
      {
        p_product_id: productId,
        p_variant_label: variantLabel,
        p_quantity: quantity,
        p_order_id: String(
          order.external_id ||
          order.id
        )
      }
    );

    if (error) {
      console.error(
        "STOCK DEDUCTION ERROR:",
        {
          productId,
          variantLabel,
          quantity,
          error
        }
      );

      throw error;
    }

    return true;
  });

  await Promise.all(stockRequests);

  return true;
}

async function restoreOrderStock(order) {
  for (const item of order.items) {
    const { error } = await supabaseClient.rpc(
      "restore_stock",
      {
        p_product_id:
          Number(item.productId || item.id),

        p_variant_label:
          item.variantLabel ||
          item.variant ||
          "Default",

        p_quantity:
          Number(item.quantity) || 1,

        p_order_id:
          order.id
      }
    );

    if (error) {
      console.error(
        "CHECKOUT STOCK ROLLBACK ERROR:",
        error
      );

      throw error;
    }
  }
}

function focusCustomerEdit() {
  enableCustomerEdit();

  document.getElementById("saveCustomerBtn")?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function markRequiredFields(fields) {
  let firstEmpty = null;

  fields.forEach((field) => {
    if (!field) return;

    field.classList.remove("input-error");

    if (!field.value || !field.value.trim()) {
      field.classList.add("input-error");

      if (!firstEmpty) {
        firstEmpty = field;
      }
    }
  });

  if (firstEmpty) {
    enableCustomerEdit();

    firstEmpty.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    setTimeout(() => {
      firstEmpty.focus();
    }, 400);

    return false;
  }

  return true;
}

function handleSuccessfulOrder(order, isGuestCheckout) {
  clearCheckedCartItems();
  localStorage.removeItem("drinCheckoutItems");

  if (!isGuestCheckout) {
    window.location.href = "/home-orders";
    return;
  }

  showOrderModal(
    "Order Successfully Placed",
    `
      <div style="text-align:center;">

        <div style="
          width:70px;
          height:70px;
          margin:0 auto 14px;
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius:50%;
          background:#dcfce7;
          color:#16a34a;
          font-size:38px;
          font-weight:700;
        ">
          ✓
        </div>

        <h3 style="margin:0 0 10px;">
          Order Successfully Placed
        </h3>

        <p>Your Order Number:</p>

        <h2 style="color:#f97316;">
          ${order.id}
        </h2>

        <p>Your Tracking Code:</p>

        <h2 style="color:#2563eb;">
          ${order.guestTrackingCode}
        </h2>

        <small>
          Save or screenshot your tracking code.
        </small>

        <button
          type="button"
          onclick="window.location.href='https://drinelectronicsph.com/guest-track/?track=${order.guestTrackingCode}'"
          style="
            width:100%;
            margin-top:16px;
            padding:12px;
            border:none;
            border-radius:8px;
            background:#2563eb;
            color:#ffffff;
            font-weight:700;
            cursor:pointer;
          "
        >
          Track My Order
        </button>

        <button
          type="button"
          onclick="window.location.href='https://drinelectronicsph.com/signup/'"
          style="
            width:100%;
            margin-top:10px;
            padding:12px;
            border:none;
            border-radius:8px;
            background:#f97316;
            color:#ffffff;
            font-weight:700;
            cursor:pointer;
          "
        >
          Sign Up
        </button>

        <button
          type="button"
          onclick="window.location.href='https://drinelectronicsph.com/login/'"
          style="
            width:100%;
            margin-top:10px;
            padding:12px;
            border:1px solid #d1d5db;
            border-radius:8px;
            background:#ffffff;
            color:#374151;
            font-weight:700;
            cursor:pointer;
          "
        >
          Log In
        </button>

      </div>
    `
  );

  const okBtn =
    document.getElementById("orderModalOk");

  if (okBtn) {
    okBtn.textContent = "Track My Order";

    okBtn.onclick = function () {
      window.location.href =
        `https://drinelectronicsph.com/guest-track/?track=${order.guestTrackingCode}`;
    };
  }
}

async function placeOrder() {

  if (isPlacingOrder) return;

  isPlacingOrder = true;

  if (!redirectIfNoCheckoutItems()) {
    isPlacingOrder = false;
    return;
  }

  renderCheckout();

  cartItems =
    JSON.parse(localStorage.getItem("drinCheckoutItems")) || [];

  const resetPlaceOrder = () => {
    isPlacingOrder = false;

    if (checkoutBtn) {
      checkoutBtn.disabled = false;
      checkoutBtn.style.pointerEvents = "auto";
      checkoutBtn.style.opacity = "1";
    }

    return;
  };

  const requiredFields = [
    nameInput,
    phoneInput,
    emailInput,
    areaGroupSelect,
    provinceSelect,
    citySelect,
    barangaySelect,
    fullAddressInput
  ];

  if (!markRequiredFields(requiredFields)) {
    showOrderModal(
      "Incomplete Details",
      "Please fill up all highlighted required fields."
    );

    return resetPlaceOrder();
  }

  const name = nameInput?.value.trim() || "";
  const phone = phoneInput?.value.trim() || "";

  const email =
    String(
      loggedInUser?.email ||
      emailInput?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  const checkoutEmailPattern =
    /^[a-zA-Z0-9_+-]+(?:\.[a-zA-Z0-9_+-]+)*@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

  if (!checkoutEmailPattern.test(email)) {
    emailInput?.classList.add("input-error");

    showOrderModal(
      "Invalid Email",
      "Please enter a valid email address before placing your order."
    );

    enableCustomerEdit();
    emailInput?.focus();

    return resetPlaceOrder();
  }


  const selectedPayment =
    document.querySelector(
      'input[name="payment"]:checked'
    );

  const paymentMain =
    selectedPayment?.value
      ?.trim()
      ?.toUpperCase() || "";

  const selectedCourierNow =
    courierSelect?.value || "";

  const earlySubtotal = getCheckoutTotal();

  if (
    paymentMain === "ONLINE" &&
    selectedCourierNow === "SPX" &&
    earlySubtotal > 30000
  ) {

    showOrderModal(
      "SPX Order Value Limit",
      `
    <div class="checkout-limit-premium">

      <div class="checkout-limit-icon">
        📦
      </div>

      <h3 class="checkout-limit-title">
        SPX Order Value Limit
      </h3>

      <p class="checkout-limit-subtitle">
        SPX delivery supports orders up to
        ₱30,000 for Online Payment.
      </p>

      <div class="checkout-limit-amount">
        <span class="checkout-limit-amount-label">
          Maximum SPX Order Value
        </span>

        <div class="checkout-limit-amount-value">
          ₱30,000
        </div>
      </div>

      <div class="checkout-limit-note">
        For orders above ₱30,000, please select
        Overland Cargo or another available delivery option.
      </div>

      <button
        type="button"
        class="checkout-limit-btn"
        onclick="closeOrderModal()"
      >
        Change Delivery Option
      </button>

    </div>
  `
    );

    return resetPlaceOrder();
  }

  if (!selectedCourierNow) {

    showOrderModal(
      "Courier Required",
      `
    <div style="text-align:center;">

      <p style="
        color:#4b5563;
        line-height:1.6;
      ">
        Please select your preferred courier
        before placing your order.
      </p>

    </div>
    `
    );


    setTimeout(() => {

      const okBtn =
        document.getElementById("orderModalOk");

      function goToCourier() {

        closeOrderModal();

        setTimeout(() => {

          courierSelect?.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });

          courierSelect?.focus();

        }, 150);
      }


      if (okBtn) {
        okBtn.textContent = "Choose Courier";
        okBtn.onclick = goToCourier;
      }

    }, 50);


    return resetPlaceOrder();
  }

  if (!paymentMain) {
    showOrderModal(
      "Select Payment Method",
      `
    <div style="
      padding:10px 4px;
      text-align:center;
    ">

      <div style="
        width:72px;
        height:72px;
        margin:0 auto 16px;
        display:flex;
        align-items:center;
        justify-content:center;
        border-radius:50%;
        background:linear-gradient(
          135deg,
          #eff6ff,
          #dbeafe
        );
        font-size:36px;
        box-shadow:0 8px 24px
          rgba(37,99,235,0.18);
      ">
        💳
      </div>

      <h3 style="
        margin:0 0 10px;
        color:#111827;
        font-size:21px;
      ">
        Choose Your Payment Method
      </h3>

      <p style="
        margin:0;
        color:#4b5563;
        line-height:1.65;
      ">
        Please select how you would like to
        pay before placing your order.
      </p>

      <div style="
        margin:16px 0;
        padding:13px;
        border-radius:12px;
        background:#f8fafc;
        border:1px solid #e5e7eb;
        color:#374151;
        font-size:14px;
      ">
          Please choose an available payment method based on your selected courier.
      </div>

      <button
        type="button"
        id="selectPaymentNowBtn"
        style="
          width:100%;
          padding:13px 16px;
          border:none;
          border-radius:10px;
          background:#2563eb;
          color:#ffffff;
          font-size:15px;
          font-weight:700;
          cursor:pointer;
        "
      >
        Select Payment Method
      </button>

    </div>
    `
    );

    const okBtn =
      document.getElementById("orderModalOk");

    if (okBtn) {
      okBtn.style.display = "none";
    }

    setTimeout(() => {
      const selectPaymentBtn =
        document.getElementById(
          "selectPaymentNowBtn"
        );

      selectPaymentBtn?.addEventListener(
        "click",
        function () {
          closeOrderModal();

          const paymentSection =
            document.querySelector(
              'input[name="payment"]'
            )?.closest(
              ".payment-section, .payment-methods, section"
            ) ||
            document.querySelector(
              'input[name="payment"]'
            );

          paymentSection?.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
        }
      );
    }, 50);

    return resetPlaceOrder();
  }

  const nonCodItems =
    cartItems.filter(item =>
      item.allow_cod === false ||
      item.allowCOD === false ||
      item.codEnabled === false
    );

  if (paymentMain === "COD" && nonCodItems.length) {

    showNonCodPremiumPopup(nonCodItems);

    return resetPlaceOrder();
  }

  if (!cartItems.length) {
    showOrderModal("No Items", "Please select items first.");
    return resetPlaceOrder();
  }

  if (!name || name.length < 3) {
    focusCustomerEdit();
    showOrderModal("Invalid Name", "Name must be at least 3 characters.");
    return resetPlaceOrder();
  }

  if (!phone || phone.length !== 11 || !phone.startsWith("09")) {
    focusCustomerEdit();
    showOrderModal("Invalid Number", "Enter a valid 11-digit phone number (09XXXXXXXXX).");
    return resetPlaceOrder();
  }

  if (!email || !email.includes("@")) {
    focusCustomerEdit();
    showOrderModal(
      "Invalid Email",
      "Please enter a valid email address."
    );

    return resetPlaceOrder();
  }

  if (!isAddressComplete()) {
    focusCustomerEdit();
    showOrderModal("Incomplete Details", "Please complete all address fields.");
    return resetPlaceOrder();
  }

  const isManualLalamoveVerification =
    selectedCourierNow === "Same Day Delivery / Lalamove" &&
    (!deliveryLatInput?.value || !deliveryLngInput?.value);


  const lalamoveAllowedArea =
    areaGroupSelect?.value === "Metro Manila" ||
    provinceSelect?.value === "Rizal" ||
    provinceSelect?.value === "Cavite" ||
    provinceSelect?.value === "Laguna" ||
    provinceSelect?.value === "Bulacan";

  if (
    selectedCourierNow === "Same Day Delivery / Lalamove" &&
    !lalamoveAllowedArea
  ) {
    showOrderModal(
      "Same Day Delivery Not Available",
      "Same Day Delivery is only available in selected nearby service areas. Please choose SPX delivery."
    );

    return resetPlaceOrder();
  }

  if (currentShippingFee === null) {
    if (selectedCourierNow === "Same Day Delivery / Lalamove") {
      if (isManualLalamoveVerification) {
        currentShippingFee = 0;
        currentShippingQuote = {
          success: true,
          manualVerification: true,
          courier: "Same Day Delivery / Lalamove"
        };

        setShippingUI(
          "ready",
          `
          <div class="delivery-notice-box">
            <strong>⚠ Same Day Delivery Notice</strong><br><br>

            Final delivery fee will be confirmed after address verification.<br><br>

            Delivery charges may vary depending on parcel size, actual weight, route distance, and courier booking conditions.<br><br>

            <span class="delivery-payment-warning">
              Shipping fee is NOT included in checkout and must be paid separately to the rider upon delivery.
            </span>
          </div>
          `,
          null
        );


      } else {

        await calculateLalamoveFee();

        if (
          !currentShippingQuote ||
          currentShippingQuote.success !== true ||
          currentShippingQuote.unsupportedArea === true ||
          !currentShippingFee ||
          currentShippingFee <= 0
        ) {
          return resetPlaceOrder();
        }

      }
    } else {
      await calculateShippingFee();
    }
  }

  if (currentShippingQuote?.unsupportedArea) {
    showOrderModal(
      currentShippingQuote?.overweight
        ? "Parcel Too Heavy for Same Day Delivery"
        : "Same Day Delivery Not Available",
      currentShippingQuote?.overweight
        ? "Same Day Delivery is only available for parcels up to 20kg. Please choose SPX Standard Delivery."
        : selectedCourierNow === "Same Day Delivery / Lalamove"
          ? "Location not verified. Same Day Delivery currently covers Metro Manila and selected nearby areas. Please check your street or landmark details, or use SPX delivery."
          : "SPX delivery is currently unavailable in this area.\n\nPlease contact our support team for manual shipping assistance."
    );

    return resetPlaceOrder();
  }

  const latestCart =
    JSON.parse(localStorage.getItem("drinCart")) || [];

  const latestMap =
    new Map(latestCart.map(item => [getCartItemKey(item), item]));

  const verifiedItems =
    cartItems.map(item =>
      latestMap.get(getCartItemKey(item))
    ).filter(Boolean);

  if (verifiedItems.length !== cartItems.length) {
    showOrderModal(
      "Cart Updated",
      "Your cart changed. Please review your checkout again."
    );

    localStorage.removeItem("drinCheckoutItems");

    return resetPlaceOrder();
  }

  cartItems = verifiedItems;

  renderCheckout();
  updateTotalsDisplay();

  const subtotalNumber = getCheckoutTotal();

  const handlingFee =
    paymentMain === "OVER_THE_COUNTER"
      ? 0
      : 25;

  const isLalamoveOrder =
    selectedCourierNow === "Same Day Delivery / Lalamove";

  const shippingFeeNumber =
    isLalamoveOrder ? 0 : Number(currentShippingFee) || 0;

  const estimatedLalamoveFee =
    isLalamoveOrder ? Number(currentShippingFee) || 0 : 0;

  const totalNumber =
    subtotalNumber -
    voucherDiscount +
    shippingFeeNumber +
    handlingFee;

  const skyroFinancedAmount =
    subtotalNumber;

  const skyroShippingCodAmount =
    shippingFeeNumber +
    handlingFee;

  if (
    paymentMain === "COD" &&
    selectedCourierNow === "Same Day Delivery / Lalamove"
  ) {
    showOrderModal(
      "COD Not Available",
      "COD is not available for Same Day Delivery / Lalamove. Please select Online Payment or change courier."
    );

    return resetPlaceOrder();
  }

  if (paymentMain === "COD" && totalNumber < 300) {
    showOrderModal(
      "COD Minimum Order",
      "Need ₱300 minimum for Cash on Delivery. Add more products to unlock COD, or continue now using Online Payment."
    );

    return resetPlaceOrder();
  }

  if (paymentMain === "COD" && totalNumber > 10000) {
    showOrderModal(
      "COD Limit Reached",
      "Cash on Delivery is only available up to ₱10,000 total including shipping.\n\nPlease select Online Payment to continue."
    );

    return resetPlaceOrder();
  }

  if (
    paymentMain === "SKYRO" &&
    skyroFinancedAmount < 3000
  ) {
    const remainingAmount =
      Math.max(
        3000 - skyroFinancedAmount,
        0
      );

    showOrderModal(
      "Skyro Minimum Order",
      `
      <div style="
        padding:8px 2px;
        text-align:center;
      ">

        <div style="
          width:64px;
          height:64px;
          margin:0 auto 14px;
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius:50%;
          background:#fff7ed;
          font-size:32px;
        ">
          🛍️
        </div>

        <h3 style="
          margin:0 0 10px;
          color:#111827;
        ">
          Add More Items to Use Skyro
        </h3>

        <p style="
          margin:0 0 12px;
          line-height:1.6;
          color:#4b5563;
        ">
          Skyro Installment requires a minimum order total of
          <strong>₱3,000</strong>.
        </p>

        <div style="
          margin:14px 0;
          padding:14px;
          border-radius:12px;
          background:#f8fafc;
          border:1px solid #e5e7eb;
        ">
          <div style="
            font-size:13px;
            color:#6b7280;
          ">
            Current Order Total
          </div>

          <strong style="
            display:block;
            margin-top:4px;
            font-size:20px;
            color:#111827;
          ">
            ${formatPrice(skyroFinancedAmount)}
          </strong>
        </div>

        <p style="
          margin:0 0 16px;
          color:#374151;
        ">
          Add at least
          <strong style="color:#ea580c;">
            ${formatPrice(remainingAmount)}
          </strong>
          more to qualify.
        </p>

        <button
          type="button"
          onclick="window.location.href='https://drinelectronicsph.com/'"
          style="
            width:100%;
            padding:13px 16px;
            border:none;
            border-radius:10px;
            background:#f97316;
            color:#ffffff;
            font-size:15px;
            font-weight:700;
            cursor:pointer;
          "
        >
          Add More Items
        </button>

        <button
          type="button"
          onclick="closeOrderModal()"
          style="
            width:100%;
            margin-top:10px;
            padding:12px 16px;
            border:1px solid #d1d5db;
            border-radius:10px;
            background:#ffffff;
            color:#374151;
            font-weight:700;
            cursor:pointer;
          "
        >
          Choose Another Payment Method
        </button>

      </div>
    `
    );

    return resetPlaceOrder();
  }

  if (
    paymentMain !== "COD" &&
    paymentMain !== "OVER_THE_COUNTER" &&
    totalNumber < 100
  ) {
    showOrderModal(
      "Minimum Online Payment",
      "Your order is below the ₱100 minimum. Add more products to continue with Online Payment."
    );

    return resetPlaceOrder();
  }

  if (subtotalNumber <= 0) {
    showOrderModal("Invalid Total", "Order total must be greater than ₱0.");
    return resetPlaceOrder();
  }

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  const isGuestCheckout = !user;

  const voucherCode = localStorage.getItem("claimedVoucherCode");

  if (voucherCode && user) {
    const { data: existingUsage } =
      await supabaseClient
        .from("voucher_usage")
        .select("*")
        .eq("voucher_code", voucherCode)
        .eq("user_id", user.id)
        .maybeSingle();

    if (existingUsage) {
      showOrderModal(
        "Voucher Already Used",
        "This voucher has already been used on your account."
      );

      return resetPlaceOrder();
    }
  }

  const normalizedItems = normalizeOrderItems(cartItems);
  const address = getSelectedAddress();
  currentParcelInfo = calculateParcelInfo();

  if (currentShippingQuote?.unsupportedArea) {
    showOrderModal(
      currentShippingQuote?.overweight
        ? "Parcel Too Heavy for Same Day Delivery"
        : "Same Day Delivery Not Available",
      currentShippingQuote?.overweight
        ? "Same Day Delivery is only available for parcels up to 20kg. Please choose SPX Standard Delivery."
        : selectedCourierNow === "Same Day Delivery / Lalamove"
          ? "Same Day Delivery is not available for this address yet. Please choose SPX Standard Delivery."
          : "SPX delivery is currently unavailable in this area.\n\nPlease contact our support team for manual shipping assistance."
    );

    return resetPlaceOrder();
  }

  const order = {
    id: "ORD-" + Date.now(),
    guestOrder: isGuestCheckout,
    guestTrackingCode: isGuestCheckout ? "GUEST-" + Date.now() : "",
    userId: user?.id || null,
    customer: { name, phone, email },
    address,
    courier: selectedCourierNow,
    payment: { method: paymentMain },
    items: normalizedItems,
    subtotal: subtotalNumber,
    shippingFee: shippingFeeNumber,
    handlingFee: handlingFee,
    serviceFee: handlingFee,

    skyroFinancedAmount:
      paymentMain === "SKYRO"
        ? skyroFinancedAmount
        : 0,

    shippingCodAmount:
      paymentMain === "SKYRO"
        ? skyroShippingCodAmount
        : 0,

    estimatedLalamoveFee: estimatedLalamoveFee,

    shippingNote: isManualLalamoveVerification
      ? "Same Day Delivery fee will be confirmed after address verification."
      : isLalamoveOrder
        ? "Lalamove fee is estimated only. Customer pays rider directly."
        : "",

    voucherCode: voucherCode || "",
    voucherDiscount: voucherDiscount || 0,
    parcelInfo: currentParcelInfo,
    shippingQuote: currentShippingQuote,
    total:
      paymentMain === "SKYRO"
        ? skyroFinancedAmount
        : totalNumber,
    status:
      paymentMain === "OVER_THE_COUNTER" &&
        selectedCourierNow === "Store Pickup"
        ? "Pending Pickup Confirmation"
        : paymentMain === "SKYRO"
          ? "Pending Stock Confirmation"
          : isManualLalamoveVerification
            ? "Pending Address Verification"
            : paymentMain === "COD"
              ? "Pending COD"
              : "Pending Payment",
    date: new Date().toLocaleString(),
  };

  if (paymentMain === "SKYRO") {
    console.log("SKYRO MANUAL APPLICATION:", order.id);

    showOrderModal(
      "Submitting Skyro Order",
      "Please wait while we save and reserve your order...",
      true
    );
  }

  let stockDeducted = false;

  try {

    await deductOrderStock(order);
    stockDeducted = true;

    if (
      paymentMain === "SKYRO" ||
      paymentMain === "OVER_THE_COUNTER"
    ) {
      const syncResult =
        await syncOrderToSupabase(order);

      if (syncResult === false) {
        return resetPlaceOrder();
      }
    }

    saveOrder(order);

    if (
      voucherCode &&
      user &&
      paymentMain !== "SKYRO"
    ) {

      await supabaseClient
        .from("voucher_usage")
        .insert({

          voucher_code: voucherCode,

          user_id: user.id

        });

      localStorage.removeItem(
        "claimedVoucherCode"
      );

    }

  } catch (error) {

    console.error(
      "ORDER SYNC ERROR:",
      error
    );

    if (stockDeducted) {
      try {
        await restoreOrderStock(order);

        console.log(
          "Stock restored after checkout error:",
          order.id
        );
      } catch (restoreError) {
        console.error(
          "FAILED TO RESTORE STOCK:",
          restoreError
        );
      }
    }

    showOrderModal(
      "Order Failed",
      "The order was not completed. Reserved stock has been returned. Please try again."
    );

    return resetPlaceOrder();
  }

  if (paymentMain === "SKYRO") {

    try {

      const skyroRes = await fetchWithFallback(
        "/api/orders/skyro",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            orderId: order.id,
            amount: skyroFinancedAmount,
            subtotal: subtotalNumber,
            shippingFee: shippingFeeNumber,
            shippingPaymentMethod: "COD",
            shippingCodAmount: skyroShippingCodAmount,
            serviceFee: 0,
            handlingFee: handlingFee,
            customerName: name,
            customerPhone: phone,
            customerEmail: email,
            guestOrder: order.guestOrder === true,
            guestTrackingCode: order.guestTrackingCode,
            courier: order.courier,
            address,
            parcelInfo: currentParcelInfo,
            items: order.items
          })
        }
      );

      const skyroData = await skyroRes.json();

      if (!skyroRes.ok || !skyroData.success) {
        if (stockDeducted) {
          try {
            await restoreOrderStock(order);
            stockDeducted = false;

            console.log(
              "Stock restored after Skyro save error:",
              order.id
            );
          } catch (restoreError) {
            console.error(
              "FAILED TO RESTORE SKYRO STOCK:",
              restoreError
            );
          }
        }

        showOrderModal(
          "Skyro Order Error",
          skyroData.message ||
          "Skyro order was not completed. Please try again."
        );

        return resetPlaceOrder();
      }

      clearCheckedCartItems();

      localStorage.removeItem("drinCheckoutItems");

      showOrderModal(
        "Skyro Order Request Submitted",
        `
      <div class="skyro-application-confirmation">

        <div style="
          width:70px;
          height:70px;
          margin:0 auto 14px;
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius:50%;
          background:#dcfce7;
          color:#16a34a;
          font-size:38px;
          font-weight:700;
        ">
          ✓
        </div>

        <h3 style="margin:0 0 10px;">
          Order Submitted Successfully
        </h3>

        <p>
          Your Skyro order request has been received.
        </p>

        <p>
          Our team will first confirm item availability before allowing you to proceed with the Skyro application.
        </p>

        <p>
          Order Reference Number:
        </p>

        <h2 style="
          margin:10px 0;
          color:#f97316;
        ">
          ${order.id}
        </h2>

        ${isGuestCheckout
          ? `
      <div style="text-align:center;">

        <h3 style="margin:0 0 8px;">
          Create an Account
        </h3>

        <p style="margin:0 0 12px; line-height:1.4;">
          Sign up using the same email to manage and continue your Skyro order.
        </p>

        <button
          type="button"
          onclick="window.location.href='https://drinelectronicsph.com/signup/'"
          style="
            width:100%;
            padding:12px;
            border:none;
            border-radius:8px;
            background:#f97316;
            color:white;
            font-weight:700;
          "
        >
          Create Account
        </button>

        <p style="margin:12px 0 4px; font-size:12px;">
          Tracking Code
        </p>

        <strong style="color:#2563eb;">
          ${order.guestTrackingCode}
        </strong>

        <button
          type="button"
          onclick="window.location.href='https://drinelectronicsph.com/guest-track/?track=${order.guestTrackingCode}'"
          style="
            width:100%;
            margin-top:10px;
            padding:10px;
            border:1px solid #d1d5db;
            border-radius:8px;
            background:white;
            font-weight:700;
          "
        >
          Track as Guest
        </button>

      </div>
    `
          : `
      <p>
        You can view this order request in your My Orders page.
      </p>
    `
        }

        <p>
         Please wait for item availability confirmation. Once approved, the Complete Skyro Application button will appear in My Orders.
        </p>

        <button
          type="button"
          onclick="window.open('https://www.facebook.com/DrinElectronics', '_blank')"
          style="
            width:100%;
            margin-top:12px;
            padding:12px;
            border:none;
            border-radius:8px;
            background:#1877f2;
            color:#ffffff;
            font-weight:700;
            cursor:pointer;
          "
        >
          Message Our Skyro Agent
        </button>

      </div>
    `
      );

      if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.style.pointerEvents = "none";
        checkoutBtn.style.opacity = "0.6";
        checkoutBtn.textContent = "Skyro Order Submitted";
      }

      const okBtn =
        document.getElementById("orderModalOk");

      if (okBtn) {
        okBtn.style.display = "inline-block";
        okBtn.textContent = isGuestCheckout
          ? "Track My Order"
          : "Go to My Orders";

        okBtn.onclick = function () {
          if (isGuestCheckout) {
            window.location.href =
              `https://drinelectronicsph.com/guest-track/?track=${order.guestTrackingCode}`;
          } else {
            window.location.href = "/home-orders";
          }
        };
      }

      if (!isGuestCheckout) {
        showOrderModal(
          "Skyro Order Submitted",
          "Your order was saved successfully. Redirecting to My Orders...",
          true
        );

        setTimeout(() => {
          window.location.href = "/home-orders";
        }, 3000);
      }

      return;

    } catch (error) {
      console.error(
        "SKYRO CONNECTION ERROR:",
        error
      );

      if (stockDeducted) {
        try {
          await restoreOrderStock(order);
          stockDeducted = false;
        } catch (restoreError) {
          console.error(
            "FAILED TO RESTORE SKYRO STOCK:",
            restoreError
          );
        }
      }

      showOrderModal(
        "Skyro Connection Error",
        "The Skyro order was not completed. Please try again."
      );

      return resetPlaceOrder();
    }

  }

  if (paymentMain === "COD") {
    showOrderModal(
      "Processing COD Order...",
      "Please wait while we save your order.",
      true
    );

    try {
      const codRes = await fetchWithFallback(
        "/api/orders/cod",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            orderId: order.id,
            amount: totalNumber,
            subtotal: subtotalNumber,
            shippingFee: shippingFeeNumber,
            serviceFee: handlingFee,
            handlingFee: handlingFee,
            customerName: name,
            customerPhone: phone,
            customerEmail: email,
            guestOrder: order.guestOrder === true,
            guestTrackingCode: order.guestTrackingCode,
            paymentMethod: "COD",
            courier: order.courier,
            address,
            parcelInfo: currentParcelInfo,
            items: order.items
          })
        }
      );

      if (!codRes.ok) {
        throw new Error(
          `COD save failed with status ${codRes.status}`
        );
      }

    } catch (error) {
      console.error(
        "COD BACKEND SAVE ERROR:",
        error
      );

      if (stockDeducted) {
        try {
          await restoreOrderStock(order);
          stockDeducted = false;
        } catch (restoreError) {
          console.error(
            "FAILED TO RESTORE COD STOCK:",
            restoreError
          );
        }
      }

      showOrderModal(
        "COD Order Failed",
        "Your COD order was not completed. Please try again."
      );

      return resetPlaceOrder();
    }

    if (typeof fbq !== "undefined") {
      fbq("track", "Purchase", {
        content_ids: order.items.map(item => item.id),
        content_type: "product",
        value: totalNumber,
        currency: "PHP",
        num_items: order.items.length
      });
    }

    handleSuccessfulOrder(order, isGuestCheckout);
    return;
  }

  if (paymentMain === "OVER_THE_COUNTER") {

    if (selectedCourierNow !== "Store Pickup") {
      showOrderModal(
        "Payment Not Available",
        "Over The Counter is available for Store Pickup only."
      );

      return resetPlaceOrder();
    }

    handleSuccessfulOrder(order, isGuestCheckout);
    return;
  }

  try {
    const paymentPayload = {
      orderId: order.id,
      guestOrder: order.guestOrder === true,
      guestTrackingCode: order.guestTrackingCode,

      amount: Number(totalNumber),

      subtotal: Number(subtotalNumber),
      shippingFee: Number(shippingFeeNumber),

      serviceFee: Number(handlingFee),
      handlingFee: Number(handlingFee),

      customerName: name,
      customerPhone: phone,
      customerEmail: email,

      paymentMethod: "XENDIT",
      courier: order.courier,

      isLalamoveOrder:
        selectedCourierNow === "Same Day Delivery / Lalamove",

      lalamoveShippingPaidByCustomer: true,
      estimatedLalamoveFee:
        Number(estimatedLalamoveFee || 0),

      address,
      parcelInfo: currentParcelInfo,
      items: order.items
    };

    showOrderModal(
      "Please Wait",
      "Redirecting to secure payment gateway... Please do not close this window.",
      true
    );

    let res;

    try {
      res = await fetch(
        `${PRIMARY_API_URL}/api/create-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(paymentPayload)
        }
      );

      if (res.status >= 500) {
        throw new Error(
          `Primary Xendit server error: ${res.status}`
        );
      }

    } catch (primaryError) {

      console.warn(
        "PRIMARY XENDIT SERVER FAILED:",
        primaryError
      );

      // Check backup server first for an already-created payment
      try {
        const recoveryRes = await fetch(
          `${BACKUP_API_URL}/api/xendit/payment/${encodeURIComponent(order.id)}`
        );

        if (recoveryRes.ok) {
          const recoveryData =
            await recoveryRes.json();

          if (
            recoveryData.found &&
            recoveryData.checkoutUrl
          ) {
            clearCheckedCartItems();

            localStorage.removeItem(
              "drinCheckoutItems"
            );

            if (isGuestCheckout) {
              sessionStorage.setItem(
                "guestCheckout",
                "true"
              );

              sessionStorage.setItem(
                "guestOrderEmail",
                email
              );

              sessionStorage.setItem(
                "guestOrderId",
                order.id
              );
            }

            sessionStorage.setItem(
              "paymentStarted",
              "true"
            );

            window.location.replace(
              recoveryData.checkoutUrl
            );

            return;
          }
        }

      } catch (recoveryError) {
        console.warn(
          "XENDIT RECOVERY CHECK FAILED:",
          recoveryError
        );
      }

      // No existing checkout URL found, try backup backend
      res = await fetch(
        `${BACKUP_API_URL}/api/create-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(paymentPayload)
        }
      );
    }

    let data = {};

    try {
      data = await res.json();
    } catch (e) {
      data = {};
    }

    console.log("CREATE PAYMENT STATUS:", res.status);
    console.log("CREATE PAYMENT RESPONSE:", data);

    if (!res.ok) {
      if (stockDeducted) {
        try {
          await restoreOrderStock(order);
          stockDeducted = false;

          console.log(
            "Stock restored after payment creation error:",
            order.id
          );
        } catch (restoreError) {
          console.error(
            "FAILED TO RESTORE STOCK:",
            restoreError
          );
        }
      }

      showOrderModal(
        "Payment Server Error",
        data.message || data.error || "Create payment failed."
      );

      return resetPlaceOrder();
    }

    const redirectUrl =
      data.checkoutUrl ||
      data.checkout_url ||
      data.invoice_url ||
      data.redirectUrl;

    if (redirectUrl) {

      clearCheckedCartItems();

      localStorage.removeItem("drinCheckoutItems");

      if (isGuestCheckout) {

        sessionStorage.setItem("guestCheckout", "true");
        sessionStorage.setItem("guestOrderEmail", email);
        sessionStorage.setItem("guestOrderId", order.id);

      }

      sessionStorage.setItem("paymentStarted", "true");

      window.location.replace(redirectUrl);

    }

    else {
      if (stockDeducted) {
        try {
          await restoreOrderStock(order);
          stockDeducted = false;

          console.log(
            "Stock restored because payment URL was missing:",
            order.id
          );
        } catch (restoreError) {
          console.error(
            "FAILED TO RESTORE STOCK:",
            restoreError
          );
        }
      }

      showOrderModal(
        "Payment Error",
        data.message || "Checkout failed. Reserved stock has been returned."
      );

      return resetPlaceOrder();
    }

  } catch (error) {
    console.error("CHECKOUT ERROR:", error);

    if (stockDeducted) {
      try {
        await restoreOrderStock(order);
        stockDeducted = false;

        console.log(
          "Stock restored after payment connection error:",
          order.id
        );
      } catch (restoreError) {
        console.error(
          "FAILED TO RESTORE STOCK:",
          restoreError
        );
      }
    }

    showOrderModal(
      "Server Error",
      "Cannot connect to payment server. Reserved stock has been returned."
    );

    return resetPlaceOrder();
  }
}

function updateDeliveryAddressUI() {
  const isLalamove =
    courierSelect?.value === "Same Day Delivery / Lalamove";

  const mapSearchBox = mapSearchInput;
  const mapResultsBox = mapSearchResults;
  const mapBox = document.getElementById("deliveryMap");
  const mapSearchBtn = document.getElementById("mapSearchBtn");
  const mapSearchNote = document.querySelectorAll(".map-search-note, .lalamove-only");

  if (fullAddressInput) {
    fullAddressInput.disabled = false;
    fullAddressInput.required = true;

    if (isLalamove) {
      fullAddressInput.placeholder =
        "Enter complete address for admin booking (House No., Street, Landmark)";
    } else {
      fullAddressInput.placeholder =
        "House No., Street, Landmark";
    }
  }

  if (mapSearchBox) {
    mapSearchBox.style.display = isLalamove ? "block" : "none";
  }

  if (mapResultsBox) {
    mapResultsBox.style.display = isLalamove ? "block" : "none";
  }

  if (mapBox) {
    mapBox.style.display = isLalamove ? "block" : "none";
  }

  if (mapSearchBtn) {
    mapSearchBtn.style.display = isLalamove ? "block" : "none";
  }

  mapSearchNote.forEach(note => {
    note.style.display = isLalamove ? "block" : "none";
  });

  if (pinStatus) {
    pinStatus.classList.remove("pin-warning");
    pinStatus.classList.remove("pin-success");

    pinStatus.style.display = isLalamove ? "block" : "none";

    pinStatus.textContent = isLalamove
      ? "Search and pin your exact location to calculate your estimated Same Day Delivery fee."
      : "";
  }

  setTimeout(() => {
    if (isLalamove && deliveryMap) {
      deliveryMap.invalidateSize();
    }
  }, 300);
}


courierSelect?.addEventListener("change", function () {

  selectedCourier = this.value;

  const codOption =
    document.querySelector(
      'input[name="payment"][value="COD"]'
    );

  const overTheCounterOption =
    document.querySelector(
      'input[name="payment"][value="OVER_THE_COUNTER"]'
    );

  const isCodDisabledCourier =
    selectedCourier ===
    "Same Day Delivery / Lalamove" ||
    selectedCourier ===
    "Manual Freight Delivery" ||
    selectedCourier ===
    "Store Pickup";

  // Reset muna lahat ng payment
  togglePayment(false);

  // Enable kapag may courier na
  if (selectedCourier) {
    togglePayment(true);
  }

  // Final rule: disable COD kapag RORO
  if (codOption) {
    codOption.disabled =
      isCodDisabledCourier;

    if (
      isCodDisabledCourier &&
      codOption.checked
    ) {
      codOption.checked = false;
    }

    const codBox =
      codOption.closest("label") ||
      codOption.parentElement;

    if (codBox) {
      codBox.style.display =
        isCodDisabledCourier
          ? "none"
          : "";
    }

    if (
      codBox &&
      !codBox.dataset.roroCodPopupAdded
    ) {
      codBox.dataset.roroCodPopupAdded =
        "true";

      codBox.addEventListener(
        "click",
        function (event) {
          const isRoroSelected =
            courierSelect?.value ===
            "Manual Delivery via RORO";

          if (!isRoroSelected) return;

          event.preventDefault();
          event.stopPropagation();

          showOrderModal(
            "COD Not Available",
            `
            <div style="
              padding:10px 4px;
              text-align:center;
            ">

              <div style="
                width:72px;
                height:72px;
                margin:0 auto 16px;
                display:flex;
                align-items:center;
                justify-content:center;
                border-radius:50%;
                background:#fff7ed;
                font-size:36px;
              ">
                🚢
              </div>

              <h3 style="
                margin:0 0 10px;
                color:#111827;
              ">
                COD is Not Available for RORO
              </h3>

              <p style="
                margin:0;
                color:#4b5563;
                line-height:1.65;
              ">
                Manual Delivery via RORO requires
                Online Payment or Skyro Installment.
              </p>

              <div style="
                margin:16px 0 0;
                padding:13px;
                border-radius:12px;
                background:#f8fafc;
                border:1px solid #e5e7eb;
                color:#374151;
                line-height:1.55;
              ">
                RORO freight, port charges, and
                local delivery fees will be
                confirmed and paid separately.
              </div>

            </div>
            `
          );
        },
        true
      );
    }
  }

  if (overTheCounterOption) {
    const isStorePickup =
      selectedCourier === "Store Pickup";

    overTheCounterOption.disabled =
      !isStorePickup;

    if (
      !isStorePickup &&
      overTheCounterOption.checked
    ) {
      overTheCounterOption.checked = false;
    }

    const overTheCounterBox =
      overTheCounterOption.closest("label") ||
      overTheCounterOption.parentElement;

    if (overTheCounterBox) {
      overTheCounterBox.style.display =
        isStorePickup
          ? ""
          : "none";
    }
  }

  updateDeliveryAddressUI();

  if (courierStatus) {
    courierStatus.textContent =
      selectedCourier
        ? `${selectedCourier === "Manual Freight Delivery"
          ? "Overland Cargo"
          : selectedCourier
        } selected`
        : "Please select courier";
  }

  scheduleShippingQuote();

});

const saveCustomerBtn =
  document.getElementById("saveCustomerBtn");

let customerSaved = false;

let isPlacingOrder = false;


saveCustomerBtn?.addEventListener("click", () => {

  if (!customerSaved) {

    const requiredFields = [
      nameInput,
      phoneInput,
      emailInput,
      areaGroupSelect,
      provinceSelect,
      citySelect,
      barangaySelect,
      fullAddressInput
    ];

    // CHECK ALL REQUIRED FIELDS
    if (!markRequiredFields(requiredFields)) {

      showOrderModal(
        "Incomplete Customer Details",
        `
        <div style="text-align:center;">

          <div style="
            font-size:42px;
            margin-bottom:12px;
          ">
            ⚠️
          </div>

          <h3 style="
            margin:0 0 10px;
            color:#111827;
          ">
            Please Complete Your Details
          </h3>

          <p style="
            color:#4b5563;
            line-height:1.6;
            margin:0;
          ">
            Please complete your
            <strong>
              Name, Contact Number, Email,
              Area, Province, City, Barangay,
              and Complete Address
            </strong>
            before saving.
          </p>

        </div>
        `
      );

      customerSaved = false;
      return;
    }


    // VALIDATE NAME
    const customerName =
      nameInput?.value.trim() || "";

    if (customerName.length < 2) {

      nameInput.classList.add("input-error");

      showOrderModal(
        "Invalid Name",
        "Please enter your complete name."
      );

      nameInput.focus();
      return;
    }


    // VALIDATE CONTACT NUMBER
    const phone =
      phoneInput?.value.trim() || "";

    if (!/^09\d{9}$/.test(phone)) {

      phoneInput.classList.add("input-error");

      showOrderModal(
        "Invalid Contact Number",
        "Please enter a valid 11-digit Philippine mobile number starting with 09."
      );

      phoneInput.focus();
      return;
    }


    // VALIDATE EMAIL
    const email =
      String(
        loggedInUser?.email ||
        emailInput?.value ||
        ""
      )
        .trim()
        .toLowerCase();


    const validEmail =
      /^[a-zA-Z0-9_+-]+(?:\.[a-zA-Z0-9_+-]+)*@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;


    if (!validEmail.test(email)) {

      emailInput?.classList.add("input-error");

      showOrderModal(
        "Invalid Email",
        "Please enter a valid email address."
      );

      emailInput?.focus();
      return;
    }


    // VALIDATE COMPLETE ADDRESS
    const fullAddress =
      fullAddressInput?.value.trim() || "";

    if (fullAddress.length < 5) {

      fullAddressInput.classList.add("input-error");

      showOrderModal(
        "Complete Address Required",
        `
        Please enter your complete delivery address,
        such as house number, street, subdivision,
        building, or nearest landmark.
        `
      );

      fullAddressInput.focus();
      return;
    }


    // SAVE ONLY IF EVERYTHING IS COMPLETE
    saveCustomerCheckoutInfo();


    [
      nameInput,
      phoneInput,
      emailInput,
      fullAddressInput,
      areaGroupSelect,
      provinceSelect,
      citySelect,
      barangaySelect
    ].forEach(input => {

      if (input) {
        input.disabled = true;
        input.classList.remove("input-error");
      }

    });


    saveCustomerBtn.textContent = "Edit";


    const toggleBtn =
      document.getElementById(
        "toggleCustomerBtn"
      );

    if (toggleBtn) {
      toggleBtn.textContent = "Show More";
    }


    customerSaved = true;


    const body =
      document.getElementById(
        "customerDetailsBody"
      );

    if (body) {
      body.classList.add("collapsed");
    }


  } else {

    [
      nameInput,
      phoneInput,
      fullAddressInput,
      areaGroupSelect,
      provinceSelect,
      citySelect,
      barangaySelect
    ].forEach(input => {

      if (input) {
        input.disabled = false;
      }

    });


    if (emailInput) {

      emailInput.disabled = false;

      emailInput.readOnly =
        Boolean(loggedInUser);

    }


    saveCustomerBtn.textContent = "Save";

    customerSaved = false;

    enableCustomerEdit();

  }

});

areaGroupSelect?.addEventListener("change", loadProvinces);

provinceSelect?.addEventListener("change", loadCities);

citySelect?.addEventListener("change", loadBarangays);

barangaySelect?.addEventListener("change", () => {

  saveCustomerCheckoutInfo();

});

document.querySelectorAll('input[name="payment"]').forEach((input) => {

  input.addEventListener("change", async () => {

    // RESET PLACE ORDER STATE
    isPlacingOrder = false;

    if (checkoutBtn) {
      checkoutBtn.disabled = false;
      checkoutBtn.style.pointerEvents = "auto";
      checkoutBtn.style.opacity = "1";
    }

    // GET SELECTED PAYMENT
    const selectedPayment =
      document.querySelector(
        'input[name="payment"]:checked'
      )?.value || "";


    // =========================================
    // SKYRO ACCOUNT REQUIRED
    // =========================================
    if (selectedPayment === "SKYRO") {

      const {
        data: { user }
      } = await supabaseClient.auth.getUser();


      // GUEST CUSTOMER
      if (!user) {

        // Do not allow Skyro to remain selected
        input.checked = false;

        updateTotalsDisplay();

        showOrderModal(
          "Account Required for Skyro",
          `
          <div class="premium-login-alert">

            <div class="premium-login-icon">
              👤
            </div>

            <h4>
              Sign In Required
            </h4>

            <p>
              To apply for Skyro Installment,
              please sign in or create a
              Drin Electronics account first.
              <br><br>

              Your account allows you to track your order
              and continue your Skyro application from
              <strong>My Orders</strong>.
            </p>

            <div class="premium-login-actions">

              <button
                type="button"
                onclick="window.location.href='https://drinelectronicsph.com/login/'"
              >
                Log In
              </button>

              <button
                type="button"
                class="secondary-btn"
                onclick="window.location.href='https://drinelectronicsph.com/signup/'"
              >
                Create Account
              </button>

              <button
                type="button"
                class="secondary-btn"
                onclick="closeOrderModal()"
              >
                Choose Another Payment
              </button>

            </div>

          </div>
          `
        );

        // Hide normal modal OK button
        const okBtn =
          document.getElementById("orderModalOk");

        if (okBtn) {
          okBtn.style.display = "none";
        }

        return;
      }


      // =========================================
      // LOGGED-IN SKYRO CUSTOMER
      // Remove voucher silently
      // =========================================
      claimedVoucher = null;
      voucherDiscount = 0;

      localStorage.removeItem(
        "claimedVoucherCode"
      );

      const voucherRow =
        document.getElementById(
          "voucherSummaryRow"
        );

      if (voucherRow) {
        voucherRow.style.display = "none";
      }

      updateTotalsDisplay();
    }


    // Recalculate shipping/payment totals
    scheduleShippingQuote();

  });

});

async function loadClaimedVoucher() {

  const voucherCode =
    localStorage.getItem(
      "claimedVoucherCode"
    );

  if (!voucherCode) return;

  const { data, error } =
    await supabaseClient
      .from("vouchers")
      .select("*")
      .eq("code", voucherCode)
      .eq("is_active", true)
      .single();

  if (error || !data) {
    return;
  }

  claimedVoucher = data;

  updateTotalsDisplay();
}

(async function initCheckout() {

  if (!redirectIfNoCheckoutItems()) return;

  await loadSPXAddresses();

  await loadClaimedVoucher();

  fetch(`${API_BASE_URL}/api/spx/verify`)
    .catch(() => { });

  renderCheckout();
  loadAreaGroups();

  togglePayment(false);

  await loadCustomerCheckoutInfo();
  updateParcelEstimate();
  updateTotalsDisplay();
  initDeliveryMap();
  updateDeliveryAddressUI();

  setTimeout(() => {
    if (deliveryMap) {
      deliveryMap.invalidateSize();
    }
  }, 800);

})();

[
  nameInput,
  phoneInput,
  emailInput,
  fullAddressInput,
  areaGroupSelect,
  provinceSelect,
  citySelect,
  barangaySelect
].forEach((input) => {

  if (!input) return;

  input.addEventListener("input", () => {
    input.classList.remove("input-error");
  });

  input.addEventListener("change", () => {
    input.classList.remove("input-error");
  });

});

window.loadProvinces = loadProvinces;
window.loadCities = loadCities;
window.loadBarangays = loadBarangays;
window.placeOrder = placeOrder;
window.closeOrderModal = closeOrderModal;
window.togglePayment = togglePayment;

function smartBack(fallback = "../Cart/index.html") {

  if (
    document.referrer &&
    document.referrer !== window.location.href
  ) {
    window.history.back();
  } else {
    window.location.href = fallback;
  }

}


function saveCustomerCheckoutInfo() {

  const cityData =
    ADDRESS_DATA[provinceSelect?.value]
      ?.cities?.[citySelect?.value];

  const data = {
    name: nameInput?.value || "",
    phone: phoneInput?.value || "",

    email:
      String(
        loggedInUser?.email ||
        emailInput?.value ||
        ""
      )
        .trim()
        .toLowerCase(),

    areaGroup: areaGroupSelect?.value || "",
    province: provinceSelect?.value || "",
    city: citySelect?.value || "",
    barangay: barangaySelect?.value || "",
    zip: cityData?.zip || "",
    fullAddress: fullAddressInput?.value || "",
    courier: courierSelect?.value || ""
  };

  localStorage.setItem(
    "drinCustomerCheckoutInfo",
    JSON.stringify(data)
  );

  updateCustomerQuickView();
}


function updateCustomerQuickView() {
  const name = document.getElementById("quickCustomerName");
  const phone = document.getElementById("quickCustomerPhone");
  const address = document.getElementById("quickCustomerAddress");

  if (name) name.textContent = nameInput?.value || "Customer Name";
  if (phone) phone.textContent = phoneInput?.value || "Phone Number";

  if (address) {
    address.textContent = [
      barangaySelect?.value,
      citySelect?.value,
      provinceSelect?.value
    ].filter(Boolean).join(", ") || "Address summary";
  }
}

function toggleCustomerDetails() {
  const body = document.getElementById("customerDetailsBody");
  const btn = document.getElementById("toggleCustomerBtn");

  if (!body) return;

  body.classList.toggle("collapsed");

  if (btn) {
    btn.textContent = body.classList.contains("collapsed")
      ? "Read More"
      : "Show Less";
  }
}

function enableCustomerEdit() {
  const body = document.getElementById("customerDetailsBody");

  if (body) {
    body.classList.remove("collapsed");
  }

  const toggleBtn = document.getElementById("toggleCustomerBtn");
  if (toggleBtn) {
    toggleBtn.textContent = "Show Less";
  }

  // RE-ENABLE INPUTS
  [
    nameInput,
    phoneInput,
    fullAddressInput,
    areaGroupSelect,
    provinceSelect,
    citySelect,
    barangaySelect
  ].forEach(input => {
    if (input) input.disabled = false;
  });

  if (emailInput) {
    emailInput.disabled = false;
    emailInput.readOnly = Boolean(loggedInUser);
  }

  // SAVE BUTTON ACTIVE AGAIN
  if (saveCustomerBtn) {
    saveCustomerBtn.textContent = "Save";
  }

  customerSaved = false;
}

async function loadCustomerCheckoutInfo() {

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  loggedInUser = user || null;

  if (loggedInUser && emailInput) {
    emailInput.value =
      String(loggedInUser.email || "")
        .trim()
        .toLowerCase();

    emailInput.readOnly = true;
  }

  const saved =
    JSON.parse(
      localStorage.getItem(
        "drinCustomerCheckoutInfo"
      )
    ) || {};

  if (nameInput) {
    nameInput.value = saved.name || "";
  }

  if (phoneInput) {
    phoneInput.value = saved.phone || "";
  }

  if (emailInput && !loggedInUser) {
    emailInput.value = saved.email || "";
  }

  if (fullAddressInput) {
    fullAddressInput.value =
      saved.fullAddress || "";
  }

  if (areaGroupSelect && saved.areaGroup) {

    areaGroupSelect.value =
      saved.areaGroup;

    loadProvinces();

  }



  setTimeout(() => {

    if (provinceSelect && saved.province) {

      provinceSelect.value =
        saved.province;

      loadCities();

    }

    setTimeout(() => {

      if (citySelect && saved.city) {

        citySelect.value =
          saved.city;

        loadBarangays();

      }

      setTimeout(() => {

        if (
          barangaySelect &&
          saved.barangay
        ) {

          barangaySelect.value =
            saved.barangay;

        }

        // RESET COURIER ONLY
        if (courierSelect) {

          courierSelect.value = "";

          selectedCourier = "";

        }

        updateCustomerQuickView();

      }, 100);

    }, 100);

  }, 100);

  const body =
    document.getElementById(
      "customerDetailsBody"
    );

  if (
    saved.name &&
    saved.phone &&
    body
  ) {

    body.classList.add(
      "collapsed"
    );

  }

  if (
    saved.name &&
    saved.phone &&
    saved.fullAddress
  ) {
    const toggleBtn =
      document.getElementById(
        "toggleCustomerBtn"
      );

    if (toggleBtn) {
      toggleBtn.textContent =
        "Show More";
    }
    customerSaved = true;

    saveCustomerBtn.textContent = "Edit";

    [
      nameInput,
      phoneInput,
      emailInput,
      fullAddressInput,
      areaGroupSelect,
      provinceSelect,
      citySelect,
      barangaySelect,
    ].forEach(input => {

      if (input) {
        input.disabled = true;
      }

    });

  }

}

async function syncCheckoutProfile() {

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  if (!user) return;

  try {

    await supabaseClient
      .from("profiles")
      .upsert({

        id: user.id,

        full_name:
          nameInput?.value || "",

        contact_number:
          phoneInput?.value || "",

        province:
          provinceSelect?.value || "",

        city:
          citySelect?.value || "",

        barangay:
          barangaySelect?.value || "",

        street_address:
          fullAddressInput?.value || "",

        updated_at:
          new Date().toISOString()

      });

  } catch (error) {

    console.error(
      "PROFILE SYNC ERROR:",
      error
    );

  }
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

function showNonCodPremiumPopup(items) {

  const itemList = items.map(item => `
    <div class="noncod-item">
      <span>📦</span>
      <div>

        <strong>${item.name}</strong>

        ${item.variantLabel
      ? `<small>${item.variantLabel}</small>`
      : ""
    }

      </div>
    </div>
  `).join("");

  const popup = document.createElement("div");

  popup.className = "premium-noncod-popup";

  popup.innerHTML = `
    <div class="premium-noncod-box">

      <div class="premium-noncod-icon">🔒</div>

      <h2>Cash on Delivery Not Available</h2>

      <p>
        Cash on Delivery (COD) is not available for the following item(s).
        Please select another payment option to continue.
      </p>

      <div class="premium-noncod-list">
        ${itemList}
      </div>

      <button onclick="switchToOnlinePayment()">
         Choose Another Payment Method
      </button>

    </div>
  `;

  document.body.appendChild(popup);
}

function switchToOnlinePayment() {

  document
    .querySelector(".premium-noncod-popup")
    ?.remove();

  const paymentOption =
    document.querySelector(
      'input[name="payment"]'
    );

  paymentOption
    ?.closest(
      ".payment-section, .payment-methods, section"
    )
    ?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
}

const mapSearchBtn = document.getElementById("mapSearchBtn");

if (mapSearchBtn) {
  mapSearchBtn.addEventListener("click", function () {
    const query = mapSearchInput.value.trim();

    if (query.length < 4) {
      mapSearchResults.innerHTML = `
        <div class="map-result-item">
          Please enter a more specific location.
        </div>
      `;
      return;
    }

    searchLocation(query);
  });
}

if (mapSearchInput) {
  mapSearchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      mapSearchBtn?.click();
    }
  });
}

if (mapSearchInput) {
  mapSearchInput.addEventListener("input", function () {
    if (!mapSearchInput.value.trim()) {
      if (deliveryMarker && deliveryMap) {
        deliveryMap.removeLayer(deliveryMarker);
        deliveryMarker = null;
      }

      if (deliveryLatInput) deliveryLatInput.value = "";
      if (deliveryLngInput) deliveryLngInput.value = "";

      if (pinStatus) {
        pinStatus.classList.remove("pin-warning");
        pinStatus.classList.remove("pin-success");

        pinStatus.textContent =
          "Search and pin your exact location to calculate your estimated Same Day Delivery fee.";
      }

      currentShippingFee = null;
      currentShippingQuote = null;
      updateTotalsDisplay();
    }
  });
}

const skyroPaymentNote =
  document.getElementById("skyroPaymentNote");

document
  .querySelectorAll('input[name="payment"]')
  .forEach(paymentRadio => {

    paymentRadio.addEventListener("change", function () {

      if (!skyroPaymentNote) return;

      skyroPaymentNote.style.display =
        this.value === "SKYRO"
          ? "block"
          : "none";
    });

  });