/* ===============================
   ORDERS MODULE
================================ */

const PRIMARY_API_URL =
  "https://de-ecom-pro.onrender.com";

const BACKUP_API_URL =
  "https://drin-electronics-backup-a7u59.ondigitalocean.app";

async function adminFetchWithFallback(path, options = {}) {
  const method = String(
    options.method || "GET"
  ).toUpperCase();

  const isSafeRequest =
    method === "GET" ||
    method === "HEAD" ||
    method === "OPTIONS";

  const servers = isSafeRequest
    ? [
      PRIMARY_API_URL,
      BACKUP_API_URL
    ]
    : [
      PRIMARY_API_URL
    ];

  let lastError = null;

  for (const baseUrl of servers) {
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 8000);

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
        "Admin API failed:",
        baseUrl,
        error
      );

      lastError = error;
    }
  }

  throw lastError || new Error(
    "Admin backend request failed"
  );
}

const adminOrdersTableBody = document.getElementById("adminOrdersTableBody");
const ordersTotalCount = document.getElementById("ordersTotalCount");
const ordersPendingCount = document.getElementById("ordersPendingCount");
const ordersPaidCount = document.getElementById("ordersPaidCount");
const ordersToShipCount = document.getElementById("ordersToShipCount");
const dashboardToShip = document.getElementById("dashboardToShip");
const dashboardShipped = document.getElementById("dashboardShipped");
const dashboardDelivered = document.getElementById("dashboardDelivered");
let adminOrders = [];
let storePickupOrders = [];
let roroOrders = [];
let currentOrderFilter = "Processing";
let currentOrderPeriod = "monthly";
let expandedOrderSummary = {};
let expandedOrderItems = {};
let currentOrdersPage = 1;
const ordersPerPage = 10;
let ordersTotalPages = 1;
let ordersTotalRecords = 0;
let orderPeriodCounts = {};
const cancelledOrdersTableBody =
  document.getElementById("cancelledOrdersTableBody");
const storePickupOrdersTableBody =
  document.getElementById("storePickupOrdersTableBody");

const roroOrdersTableBody =
  document.getElementById("roroOrdersTableBody");
const returnRefundRequestsBody =
  document.getElementById("returnRefundRequestsBody");

let cancelledOrders = [];
const sellerInfo = {
  name: "Drin Electronics",
  address: "Pinalad Rd, Camachille St., Nagpayong, Brgy Pinagbuhatan Pasig City",
  phone: "09157765642",
  email: "drinelectronics@gmail.com"
};


function getCustomerFullAddress(order) {
  const address = order.address || {};

  if (typeof address === "string") {
    return address;
  }

  return [
    address.fullAddress,
    address.street,
    address.barangay,
    address.city,
    address.province,
    address.postalCode,
    address.country
  ]
    .filter(Boolean)
    .join(", ");
}

function printOrderInvoice(orderId) {
  const allActiveOrders = [
    ...adminOrders,
    ...storePickupOrders,
    ...roroOrders
  ];

  const order = allActiveOrders.find(o =>
    String(o.external_id || o.id) === String(orderId)
  );

  if (!order) {
    showToast("Order not found.", "error");
    return;
  }

  const customerAddress =
    getCustomerFullAddress(order) || "-";

  const items = Array.isArray(order.items)
    ? order.items
    : [];

  const calculatedSubtotal = items.reduce((sum, item) => {
    const price = Number(
      item.price ??
      item.unit_price ??
      item.unitPrice ??
      item.selling_price ??
      0
    );

    const quantity = Number(
      item.quantity ??
      item.qty ??
      item.quantityOrdered ??
      1
    );

    return sum + (price * quantity);
  }, 0);

  const subtotal =
    calculatedSubtotal > 0
      ? calculatedSubtotal
      : Number(order.subtotal || 0);

  const voucher = Number(
    order.voucher_discount ||
    order.voucherDiscount ||
    0
  );

  const shipping = Number(
    order.shipping_fee ||
    order.shippingFee ||
    0
  );

  const serviceFee = Number(
    order.service_fee ??
    order.serviceFee ??
    order.handling_fee ??
    order.handlingFee ??
    0
  );

  // Use original checkout total saved in database
  const calculatedTotal =
    subtotal -
    voucher +
    shipping +
    serviceFee;

  const savedAmount = Number(order.amount);

  const total =
    order.amount !== null &&
      order.amount !== undefined &&
      order.amount !== "" &&
      Number.isFinite(savedAmount) &&
      savedAmount >= 0
      ? savedAmount
      : calculatedTotal;

  const paymentStatus =
    order.payment_status ||
    order.status ||
    "-";

  const courier =
    order.courier || "-";

  const tracking =
    order.tracking_number || "-";

  const itemsHtml = items.length
    ? items.map(item => {
      const itemName =
        item.name ||
        item.product_name ||
        item.title ||
        "Product";

      const variant =
        getItemVariant(item) || "-";

      const quantity =
        Number(item.quantity || item.qty || 1);

      const unitPrice =
        Number(
          item.price ||
          item.unit_price ||
          item.unitPrice ||
          item.selling_price ||
          0
        );

      const lineTotal =
        Number(
          item.total ||
          item.line_total ||
          item.lineTotal ||
          unitPrice * quantity
        );

      return `
          <tr>
            <td>
              <strong>${escapeHtml(itemName)}</strong>

              ${variant !== "-"
          ? `<div class="variant">
                      Variation: ${escapeHtml(variant)}
                    </div>`
          : ""
        }
            </td>

            <td class="center">
              ${quantity}
            </td>

            <td class="right">
              ₱${unitPrice.toLocaleString("en-PH", {
          minimumFractionDigits: 2
        })}
            </td>

            <td class="right">
              ₱${lineTotal.toLocaleString("en-PH", {
          minimumFractionDigits: 2
        })}
            </td>
          </tr>
        `;
    }).join("")
    : `
      <tr>
        <td colspan="4" class="center">
          No item details found.
        </td>
      </tr>
    `;

  const invoiceWindow =
    window.open("", "_blank");

  if (!invoiceWindow) {
    showToast(
      "Please allow popups to open the invoice.",
      "error"
    );
    return;
  }

  invoiceWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">

      <title>
        Invoice ${escapeHtml(orderId)}
      </title>

      <style>
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          padding: 30px;
          background: #f3f4f6;
          color: #111827;
          font-family: Arial, sans-serif;
        }

        .invoice {
          width: 100%;
          max-width: 900px;
          margin: auto;
          padding: 40px;
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
        }

        .invoice-header {
          display: flex;
          justify-content: space-between;
          gap: 30px;
          padding-bottom: 24px;
          border-bottom: 2px solid #2563eb;
        }

        .brand h1 {
          margin: 0 0 8px;
          color: #2563eb;
          font-size: 28px;
        }

        .brand p,
        .invoice-meta p {
          margin: 4px 0;
          color: #4b5563;
          font-size: 14px;
          line-height: 1.5;
        }

        .invoice-meta {
          text-align: right;
        }

        .invoice-title {
          margin: 0 0 10px;
          font-size: 24px;
          letter-spacing: 1px;
        }

        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-top: 28px;
        }

        .details-box {
          padding: 18px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
        }

        .details-box h3 {
          margin: 0 0 12px;
          color: #2563eb;
          font-size: 15px;
          text-transform: uppercase;
        }

        .details-box p {
          margin: 6px 0;
          line-height: 1.5;
          font-size: 14px;
        }

        table {
          width: 100%;
          margin-top: 28px;
          border-collapse: collapse;
        }

        th {
          padding: 12px;
          background: #2563eb;
          color: #ffffff;
          font-size: 13px;
          text-align: left;
        }

        td {
          padding: 14px 12px;
          border-bottom: 1px solid #e5e7eb;
          font-size: 14px;
          vertical-align: top;
        }

        .variant {
          margin-top: 5px;
          color: #6b7280;
          font-size: 12px;
        }

        .center {
          text-align: center;
        }

        .right {
          text-align: right;
        }

        .summary-area {
          display: flex;
          justify-content: flex-end;
          margin-top: 25px;
        }

        .summary {
          width: 100%;
          max-width: 380px;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          padding: 9px 0;
          border-bottom: 1px solid #e5e7eb;
          font-size: 14px;
        }

        .summary-row.voucher {
          color: #16a34a;
        }

        .summary-row.service {
          color: #7c3aed;
        }

        .summary-row.total {
          margin-top: 8px;
          padding: 14px 0;
          border-top: 2px solid #2563eb;
          border-bottom: none;
          color: #2563eb;
          font-size: 19px;
          font-weight: 700;
        }

        .shipping-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-top: 28px;
          padding: 18px;
          background: #eff6ff;
          border-radius: 12px;
          font-size: 14px;
        }

        .shipping-info p {
          margin: 5px 0;
        }

        .invoice-footer {
          margin-top: 35px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          color: #6b7280;
          text-align: center;
          font-size: 13px;
        }

        .invoice-actions {
          display: flex;
          justify-content: center;
          gap: 12px;
          margin: 25px auto;
        }

        .invoice-actions button {
          padding: 12px 20px;
          border: none;
          border-radius: 8px;
          background: #2563eb;
          color: #ffffff;
          cursor: pointer;
          font-weight: 700;
        }

        .invoice-actions button.secondary {
          background: #111827;
        }

        @media print {
          body {
            padding: 0;
            background: #ffffff;
          }

          .invoice {
            max-width: none;
            padding: 20px;
            border-radius: 0;
            box-shadow: none;
          }

          .invoice-actions {
            display: none;
          }
        }

        @media (max-width: 650px) {
          body {
            padding: 12px;
          }

          .invoice {
            padding: 22px;
          }

          .invoice-header,
          .details-grid,
          .shipping-info {
            grid-template-columns: 1fr;
            display: grid;
          }

          .invoice-meta {
            text-align: left;
          }
        }
      </style>
    </head>

    <body>
      <div class="invoice">

        <div class="invoice-header">
          <div class="brand">
            <h1>
              ${escapeHtml(sellerInfo.name)}
            </h1>

            <p>
              ${escapeHtml(sellerInfo.address)}
            </p>

            <p>
              ${escapeHtml(sellerInfo.phone)}
            </p>

            <p>
              ${escapeHtml(sellerInfo.email)}
            </p>
          </div>

          <div class="invoice-meta">
            <h2 class="invoice-title">
              INVOICE
            </h2>

            <p>
              <strong>Invoice No.:</strong>
              ${escapeHtml(orderId)}
            </p>

            <p>
              <strong>Date:</strong>
              ${order.created_at
      ? escapeHtml(
        new Date(
          order.created_at
        ).toLocaleString("en-PH")
      )
      : "-"
    }
            </p>

            <p>
              <strong>Status:</strong>
              ${escapeHtml(order.order_status || "-")}
            </p>
          </div>
        </div>

        <div class="details-grid">
          <div class="details-box">
            <h3>Seller Details</h3>

            <p>
              <strong>
                ${escapeHtml(sellerInfo.name)}
              </strong>
            </p>

            <p>
              ${escapeHtml(sellerInfo.address)}
            </p>

            <p>
              ${escapeHtml(sellerInfo.phone)}
            </p>

            <p>
              ${escapeHtml(sellerInfo.email)}
            </p>
          </div>

          <div class="details-box">
            <h3>Bill To</h3>

            <p>
              <strong>
                ${escapeHtml(
      order.customer_name || "-"
    )}
              </strong>
            </p>

            <p>
              ${escapeHtml(
      order.customer_phone || "-"
    )}
            </p>

            <p>
              ${escapeHtml(customerAddress)}
            </p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th class="center">Qty</th>
              <th class="right">Unit Price</th>
              <th class="right">Amount</th>
            </tr>
          </thead>

          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="summary-area">
          <div class="summary">

            <div class="summary-row">
              <span>Subtotal</span>

              <strong>
                ₱${subtotal.toLocaleString("en-PH", {
      minimumFractionDigits: 2
    })}
              </strong>
            </div>

            <div class="summary-row voucher">
              <span>Voucher Discount</span>

              <strong>
                -₱${voucher.toLocaleString("en-PH", {
      minimumFractionDigits: 2
    })}
              </strong>
            </div>

            <div class="summary-row">
              <span>Shipping Fee</span>

              <strong>
                ₱${shipping.toLocaleString("en-PH", {
      minimumFractionDigits: 2
    })}
              </strong>
            </div>

            <div class="summary-row service">
              <span>Service Fee</span>

              <strong>
                ₱${serviceFee.toLocaleString("en-PH", {
      minimumFractionDigits: 2
    })}
              </strong>
            </div>

            <div class="summary-row total">
              <span>Grand Total</span>

              <span>
                ₱${total.toLocaleString("en-PH", {
      minimumFractionDigits: 2
    })}
              </span>
            </div>
          </div>
        </div>

        <div class="shipping-info">
          <div>
            <p>
              <strong>Payment:</strong>
              ${escapeHtml(paymentStatus)}
            </p>

            <p>
              <strong>Courier:</strong>
              ${escapeHtml(courier)}
            </p>
          </div>

          <div>
            <p>
              <strong>Tracking Number:</strong>
              ${escapeHtml(tracking)}
            </p>

            <p>
              <strong>Order Number:</strong>
              ${escapeHtml(orderId)}
            </p>
          </div>
        </div>

        <div class="invoice-footer">
          <strong>Temporary Document Notice:</strong><br>
          This invoice is for order reference only and is not yet a BIR-registered official invoice.
          Shipping charges shown are temporary references and remain subject to final accounting treatment.
        </div>
      </div>

      <div class="invoice-actions">
        <button onclick="window.print()">
          Print Invoice
        </button>

        <button
          class="secondary"
          onclick="window.print()"
        >
          Save as PDF
        </button>
      </div>
    </body>
    </html>
  `);

  invoiceWindow.document.close();
}

/* ===============================
   SAFE TEXT HELPERS
================================ */

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

function showSuccessModal(title, message) {
  return new Promise(resolve => {
    let modal = document.getElementById("premiumSuccessModal");

    if (!modal) {
      modal = document.createElement("div");
      modal.id = "premiumSuccessModal";

      modal.innerHTML = `
        <div class="premium-success-backdrop">
          <div class="premium-success-card">
            <div class="premium-success-icon">✓</div>

            <h2 id="premiumSuccessTitle"></h2>
            <p id="premiumSuccessMessage"></p>

            <button
              type="button"
              id="premiumSuccessOk"
              class="premium-success-btn"
            >
              Done
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const style = document.createElement("style");
      style.textContent = `
        #premiumSuccessModal {
          position: fixed;
          inset: 0;
          z-index: 99999;
        }

        .premium-success-backdrop {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(8px);
        }

        .premium-success-card {
          width: 100%;
          max-width: 420px;
          padding: 34px 28px 28px;
          border-radius: 24px;
          background: #ffffff;
          text-align: center;
          box-shadow: 0 25px 70px rgba(0,0,0,0.25);
          animation: premiumSuccessPop 0.22s ease-out;
        }

        .premium-success-icon {
          width: 76px;
          height: 76px;
          margin: 0 auto 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: #dcfce7;
          color: #16a34a;
          font-size: 40px;
          font-weight: 800;
        }

        .premium-success-card h2 {
          margin: 0 0 10px;
          color: #111827;
          font-size: 24px;
        }

        .premium-success-card p {
          margin: 0 0 24px;
          color: #6b7280;
          font-size: 15px;
          line-height: 1.6;
        }

        .premium-success-btn {
          width: 100%;
          padding: 13px 20px;
          border: none;
          border-radius: 12px;
          background: #16a34a;
          color: #ffffff;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
        }

        .premium-success-btn:hover {
          filter: brightness(0.95);
        }

        @keyframes premiumSuccessPop {
          from {
            opacity: 0;
            transform: scale(0.92) translateY(12px);
          }

          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `;

      document.head.appendChild(style);
    }

    document.getElementById("premiumSuccessTitle").textContent =
      title;

    document.getElementById("premiumSuccessMessage").textContent =
      message;

    modal.style.display = "block";

    const okButton =
      document.getElementById("premiumSuccessOk");

    okButton.onclick = () => {
      modal.style.display = "none";
      resolve(true);
    };
  });
}

function setButtonLoading(button, loadingText = "Updating...") {
  if (!button) return;

  button.dataset.originalHtml =
    button.dataset.originalHtml || button.innerHTML;

  button.disabled = true;

  button.innerHTML = `
    <span class="admin-btn-spinner"></span>
    ${escapeHtml(loadingText)}
  `;
}

function resetButtonLoading(button) {
  if (!button) return;

  button.disabled = false;
  button.innerHTML =
    button.dataset.originalHtml || "Update";

  delete button.dataset.originalHtml;
}

if (!document.getElementById("admin-button-spinner-style")) {
  const style = document.createElement("style");

  style.id = "admin-button-spinner-style";

  style.textContent = `
    .admin-btn-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      margin-right: 6px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      vertical-align: -2px;
      animation: adminButtonSpin 0.7s linear infinite;
    }

    @keyframes adminButtonSpin {
      to {
        transform: rotate(360deg);
      }
    }
  `;

  document.head.appendChild(style);
}

/* ===============================
   STATUS CLASS
================================ */

function getOrderStatusClass(status) {
  if (status === "PAID") return "status-paid";

  if (
    status === "Pending" ||
    status === "Pending Payment"
  ) {
    return "status-pending";
  }

  if (status === "Processing") return "status-processing";
  if (status === "Packed") return "status-processing";
  if (status === "To Ship") return "status-processing";
  if (status === "Shipped") return "status-shipped";
  if (status === "Failed Delivery") return "status-inactive";
  if (status === "Returned") return "status-inactive";
  if (status === "Returning") return "status-inactive";
  if (status === "In Transit") return "status-shipped";
  if (status === "Delivered") return "status-delivered";
  if (status === "Cancelled") return "status-inactive";
  if (status === "Expired") return "status-inactive";

  return "status-default";
}

/* ===============================
   SUMMARY
================================ */

function updateOrdersSummary() {
  if (ordersTotalCount) {
    ordersTotalCount.textContent =
      Number(orderPeriodCounts.all || 0);
  }

  if (ordersPendingCount) {
    ordersPendingCount.textContent =
      Number(orderPeriodCounts.pendingSummary || 0);
  }

  if (ordersPaidCount) {
    ordersPaidCount.textContent =
      Number(orderPeriodCounts.paid || 0);
  }

  if (ordersToShipCount) {
    ordersToShipCount.textContent =
      Number(orderPeriodCounts.processing || 0) +
      Number(orderPeriodCounts.packed || 0) +
      Number(orderPeriodCounts.toShip || 0);
  }
}

function updateDashboardOrders() {
  if (dashboardToShip) {
    dashboardToShip.textContent =
      adminOrders.filter(order =>
        order.order_status === "Processing" ||
        order.order_status === "Packed" ||
        order.order_status === "To Ship"
      ).length;
  }

  if (dashboardShipped) {
    dashboardShipped.textContent =
      adminOrders.filter(order =>
        order.order_status === "Shipped" ||
        order.order_status === "In Transit"
      ).length;
  }

  if (dashboardDelivered) {
    dashboardDelivered.textContent =
      adminOrders.filter(order =>
        order.order_status === "Delivered"
      ).length;
  }
}

function updateOrderFilterCounts() {
  const counts = {
    all: Number(orderPeriodCounts.all || 0),
    pendingCod: Number(orderPeriodCounts.pendingCod || 0),
    pendingSkyro: Number(orderPeriodCounts.pendingSkyro || 0),
    awaitingSkyroApplication: Number(
      orderPeriodCounts.awaitingSkyroApplication || 0
    ),
    approvedSkyro: Number(
      orderPeriodCounts.approvedSkyro || 0
    ),
    processing: Number(
      orderPeriodCounts.processing || 0
    ),
    packed: Number(
      orderPeriodCounts.packed || 0
    ),
    shipped: Number(
      orderPeriodCounts.shipped || 0
    ),
    inTransit: Number(
      orderPeriodCounts.inTransit || 0
    ),
    delivered: Number(
      orderPeriodCounts.delivered || 0
    ),
    completed: Number(
      orderPeriodCounts.completed || 0
    ),
    paid: Number(
      orderPeriodCounts.paid || 0
    ),
    pendingPayment: Number(
      orderPeriodCounts.pendingPayment || 0
    ),
    failedDelivery: Number(
      orderPeriodCounts.failedDelivery || 0
    ),
    returned: Number(
      orderPeriodCounts.returned || 0
    ),
    expired: Number(
      orderPeriodCounts.expired || 0
    )
  };


  const countMap = {
    countAll: counts.all,
    countPendingCod: counts.pendingCod,
    countPendingSkyro: counts.pendingSkyro,
    countAwaitingSkyroApplication:
      counts.awaitingSkyroApplication,
    countApprovedSkyro: counts.approvedSkyro,
    countProcessing: counts.processing,
    countPacked: counts.packed,
    countShipped: counts.shipped,
    countInTransit: counts.inTransit,
    countDelivered: counts.delivered,
    countCompleted: counts.completed,
    countPaid: counts.paid,
    countPendingPayment: counts.pendingPayment,
    countFailedDelivery: counts.failedDelivery,
    countReturned: counts.returned,
    countExpired: counts.expired
  };

  Object.entries(countMap).forEach(([id, count]) => {
    const badge = document.getElementById(id);

    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? "inline-flex" : "none";
    }
  });
}

/* ===============================
   ITEM HELPERS
================================ */

function getOrderItems(order) {
  return Array.isArray(order.items) ? order.items : [];
}

function getItemVariant(item) {
  return (
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
    ""
  );
}

/* ===============================
   RENDER ADMIN ORDERS
================================ */


function renderAdminOrders() {
  if (!adminOrdersTableBody) return;

  let filteredOrders = [...adminOrders];

  if (currentOrderFilter !== "ALL") {

    filteredOrders = filteredOrders.filter(order => {
      const selectedFilter = String(
        currentOrderFilter || ""
      ).trim().toLowerCase();

      const orderStatus = String(
        order.order_status || ""
      ).trim().toLowerCase();

      const paymentStatus = String(
        order.payment_status ||
        order.status ||
        order.xendit_status ||
        ""
      ).trim().toLowerCase();

      const paymentMethod = String(
        order.payment_provider ||
        order.payment_method ||
        order.paymentMethod ||
        order.payment_type ||
        order.payment_option ||
        order.payment_channel ||
        order.method ||
        ""
      ).trim().toLowerCase();

      const paymentText =
        `${paymentStatus} ${paymentMethod}`;

      const isCOD =
        paymentText.includes("cod") ||
        paymentText.includes("cash on delivery");

      const createdTime =
        new Date(order.created_at).getTime();

      const explicitExpiryTime =
        new Date(
          order.expires_at ||
          order.expiry_date ||
          order.invoice_expiry_date ||
          ""
        ).getTime();

      const fallbackExpiryTime =
        Number.isFinite(createdTime)
          ? createdTime + 60 * 60 * 1000
          : NaN;

      const expiryTime =
        Number.isFinite(explicitExpiryTime)
          ? explicitExpiryTime
          : fallbackExpiryTime;

      const explicitlyExpired =
        orderStatus === "expired" ||
        paymentStatus.includes("expired");

      const pendingOnlinePayment =
        !isCOD &&
        !String(order.courier || "")
          .toLowerCase()
          .includes("store pickup") &&
        (
          paymentStatus === "pending" ||
          paymentStatus === "pending payment" ||
          orderStatus === "pending payment"
        );

      const timedOut =
        pendingOnlinePayment &&
        Number.isFinite(expiryTime) &&
        Date.now() > expiryTime;

      const isExpired =
        explicitlyExpired || timedOut;

      if (selectedFilter === "pending skyro") {
        return (
          paymentText.includes("skyro") &&
          [
            "pending stock confirmation",
            "pending skyro approval",
            "pending skyro application"
          ].includes(orderStatus)
        );
      }

      if (
        selectedFilter ===
        "awaiting customer application"
      ) {
        return (
          paymentText.includes("skyro") &&
          orderStatus ===
          "skyro application allowed"
        );
      }

      if (selectedFilter === "skyro approved") {
        return (
          paymentText.includes("skyro") &&
          orderStatus === "skyro approved"
        );
      }

      if (selectedFilter === "expired") {
        return isExpired;
      }

      if (
        selectedFilter === "pending" ||
        selectedFilter === "pending cod"
      ) {
        return isCOD && orderStatus === "pending";
      }

      if (selectedFilter === "pending payment") {
        const isStorePickup =
          String(order.courier || "")
            .toLowerCase()
            .includes("store pickup");

        return (
          orderStatus !== "cancelled" &&
          (!isCOD || isStorePickup) &&
          !isExpired &&
          (
            orderStatus === "pending payment" ||
            paymentStatus === "pending" ||
            paymentStatus === "pending payment"
          )
        );
      }

      if (selectedFilter === "in transit") {
        const activeTransitStatuses = [
          "in transit",
          "parcel on hold",
          "on hold",
          "shipment on hold",
          "delivery on hold",
          "delayed",
          "delivery delayed",
          "arrived at delivery hub",
          "at delivery hub"
        ];

        return activeTransitStatuses.some(status =>
          orderStatus.includes(status)
        );
      }

      if (selectedFilter === "completed") {
        return (
          orderStatus === "completed" ||
          orderStatus === "picked up"
        );
      }

      if (selectedFilter === "returned") {
        return (
          orderStatus === "returned" ||
          orderStatus === "returning"
        );
      }

      return (
        orderStatus === selectedFilter ||
        paymentStatus === selectedFilter
      );
    });

  }

  filteredOrders.sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at)
  );

  const paginatedOrders = filteredOrders;
  const totalPages = ordersTotalPages;

  if (!filteredOrders.length) {
    adminOrdersTableBody.innerHTML = `<div class="empty-box">No orders found.</div>`;
    return;
  }

  adminOrdersTableBody.innerHTML = paginatedOrders.map(order => {


    const orderId = order.external_id || order.id || "";

    const isSummaryExpanded =
      expandedOrderSummary[orderId] === true;

    const paymentStatus =
      order.payment_status ||
      order.status ||
      "Pending Payment";

    const orderStatus =
      order.order_status ||
      "Pending";

    const items = getOrderItems(order);
    const isExpanded = expandedOrderItems[orderId];
    const visibleItems =
      isExpanded
        ? items
        : items.slice(0, 2);

    const hasOrderRequest =
      order.order_request_status &&
      String(order.order_request_status).trim() !== "";

    const calculatedSubtotal = items.reduce((sum, item) => {
      const price = Number(
        item.price ??
        item.unit_price ??
        item.unitPrice ??
        item.selling_price ??
        0
      );

      const quantity = Number(
        item.quantity ??
        item.qty ??
        item.quantityOrdered ??
        1
      );

      return sum + (price * quantity);
    }, 0);

    const subtotal =
      calculatedSubtotal > 0
        ? calculatedSubtotal
        : Number(order.subtotal || 0);

    const voucher =
      Number(order.voucher_discount || 0);

    const shipping =
      Number(order.shipping_fee || 0);

    const serviceFee =
      Number(
        order.service_fee ??
        order.serviceFee ??
        order.handling_fee ??
        order.handlingFee ??
        0
      );

    // Use the original checkout amount saved in the database.
    // Recalculate only when no valid saved amount exists.
    const calculatedTotal =
      subtotal -
      voucher +
      shipping +
      serviceFee;

    const savedAmount = Number(order.amount);

    const total =
      order.amount !== null &&
        order.amount !== undefined &&
        order.amount !== "" &&
        Number.isFinite(savedAmount) &&
        savedAmount >= 0
        ? savedAmount
        : calculatedTotal;

    return `
      <div class="warehouse-order-card">
        <div class="warehouse-order-head">
          <label class="order-select-wrap">
            <input
  type="checkbox"
  class="order-select-checkbox"
  value="${escapeAttribute(orderId)}"
>
            <span>
              <strong>${escapeHtml(orderId || "-")}</strong><br>
              ${escapeHtml(order.customer_name || "Customer")}
            </span>
          </label>

          <span class="status-badge ${getOrderStatusClass(orderStatus)}">
            ${escapeHtml(orderStatus)}
          </span>

${hasOrderRequest ? `
  <span class="status-badge" style="background:#f97316;color:#fff;">
    ${escapeHtml(order.order_request_status)}
  </span>
` : ""}

        </div>

        <div class="warehouse-order-grid">
          <div class="warehouse-items-list">

            ${visibleItems.length
        ? visibleItems.map(item => {
          const itemName =
            item.name ||
            item.product_name ||
            item.title ||
            "Product";

          const itemQty = item.quantity || item.qty || 1;

          const itemImage =
            item.variant_image ||
            item.variantImage ||
            item.product_image ||
            item.productImage ||
            item.image ||
            item.img ||
            item.photo ||
            "https://zdinvxowzpkolbfzpcac.supabase.co/storage/v1/object/public/product-images/favicon.png";

          const itemVariant = getItemVariant(item);

          return `
          <div class="warehouse-item">
            <img
              src="${escapeAttribute(itemImage)}"
              onerror="this.onerror=null; this.src='https://zdinvxowzpkolbfzpcac.supabase.co/storage/v1/object/public/product-images/favicon.png'"
            >

            <div class="warehouse-item-info">
              <div class="warehouse-item-title">
                ${escapeHtml(itemName)}
              </div>

              ${itemVariant
              ? `<div class="warehouse-item-variant">Variation: ${escapeHtml(itemVariant)}</div>`
              : ""
            }

              <div class="warehouse-item-qty">
                Qty: ${escapeHtml(itemQty)}
              </div>
            </div>
          </div>
        `;
        }).join("")


        : `<div class="empty-box">No item details found.</div>`
      }

            ${items.length > 2
        ? `
                  <button
                    class="show-more-items-btn"
                    type="button"
                    onclick="toggleShowAllOrderItems('${escapeAttribute(orderId)}')"
                  >
                    ${isExpanded ? "Show Less" : "Show All Orders"}
                  </button>
                `
        : ""
      }
          </div>


<div
  class="warehouse-order-info summary-box"
  style="
    border-top:1px solid #e5e7eb;
    padding-top:10px;
    margin-top:10px;
  "
>

  <div>
    <span style="
      font-size:12px;
      font-weight:600;
      color:#6b7280;
    ">
      Subtotal
    </span>

    <strong>
      ₱${subtotal.toLocaleString("en-PH")}
    </strong>
  </div>

  ${isSummaryExpanded ? `

  <div>
    <span style="color:#16a34a;">Voucher</span>
    <strong style="color:#16a34a;">
      -₱${voucher.toLocaleString("en-PH")}
    </strong>
  </div>

  <div>
    <span style="color:#f59e0b;">Shipping</span>
    <strong>
      ₱${shipping.toLocaleString("en-PH")}
    </strong>
  </div>

  <div>
    <span style="color:#7c3aed;">Service Fee</span>
    <strong style="color:#7c3aed;">
      ₱${serviceFee.toLocaleString("en-PH")}
    </strong>
  </div>

  <div>
    <span>Total</span>

    <strong style="
      font-size:16px;
      color:#2563eb;
    ">
      ₱${total.toLocaleString("en-PH")}
    </strong>
  </div>

  <div>
    <span>Payment</span>
    <strong>${escapeHtml(paymentStatus)}</strong>
  </div>

  <div>
    <span>Courier</span>
    <strong>${escapeHtml(order.courier || "-")}</strong>
  </div>

  <div>
    <span>Tracking</span>
    <strong>${escapeHtml(order.tracking_number || "-")}</strong>
  </div>
` : ""}

<button
  class="show-more-items-btn"
  type="button"
  onclick="toggleOrderSummary('${escapeAttribute(orderId)}')"
>
  ${isSummaryExpanded ? "Hide Summary" : "Show Summary"}
</button>

</div>

${hasOrderRequest ? `

<div class="order-request-panel">

  <div
    style="
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      margin-bottom:8px;
    "
  >

    <div class="order-request-title">
      Customer Request
    </div>

    <button
      class="mini-manage-btn"
      type="button"
      onclick="openOrderModal('${escapeAttribute(orderId)}')"
    >
      Manage Order
    </button>

  </div>

  <div class="order-request-reason">
    ${escapeHtml(order.order_request_reason || "-")}
  </div>

</div>

` : ``}

<div
  style="
    display:flex;
    gap:8px;
    justify-content:flex-end;
    margin-top:10px;
  "
>

  <button
    class="mini-manage-btn"
    type="button"
    onclick="openOrderModal('${escapeAttribute(orderId)}')"
  >
    Manage Order
  </button>

</div>

</div>
</div>
          
    `;
  }).join("");

  adminOrdersTableBody.innerHTML += `
  <div
    style="
      display:flex;
      justify-content:center;
      align-items:center;
      gap:12px;
      margin-top:18px;
      padding:12px;
    "
  >
    <button
      type="button"
      class="secondary-btn"
      onclick="changeOrdersPage(-1)"
      ${currentOrdersPage <= 1 ? "disabled" : ""}
    >
      Previous
    </button>

    <span style="font-weight:700;">
      Page ${currentOrdersPage} of ${totalPages}
    </span>

    <button
      type="button"
      class="secondary-btn"
      onclick="changeOrdersPage(1)"
      ${currentOrdersPage >= totalPages ? "disabled" : ""}
    >
      Next
    </button>
  </div>
`;

}

function renderStorePickupOrders() {
  if (!storePickupOrdersTableBody) return;

  if (!storePickupOrders.length) {
    storePickupOrdersTableBody.innerHTML = `
      <div class="empty-box">
        No store pickup orders yet.
      </div>
    `;
    return;
  }

  const sortedOrders = [...storePickupOrders].sort(
    (a, b) =>
      new Date(b.created_at) -
      new Date(a.created_at)
  );

  storePickupOrdersTableBody.innerHTML =
    sortedOrders.map(order => {
      const orderId =
        order.external_id ||
        order.id ||
        "";

      const orderStatus =
        order.order_status ||
        "Pending";

      const amount = Number(
        order.amount ||
        order.total ||
        0
      );

      const items = getOrderItems(order);

      const itemsHtml = items.length
        ? items.map(item => {
          const itemName =
            item.name ||
            item.product_name ||
            item.title ||
            "Product";

          const itemQty =
            item.quantity ||
            item.qty ||
            1;

          const itemImage =
            item.variant_image ||
            item.variantImage ||
            item.product_image ||
            item.productImage ||
            item.image ||
            item.img ||
            item.photo ||
            "https://zdinvxowzpkolbfzpcac.supabase.co/storage/v1/object/public/product-images/favicon.png";

          const itemVariant =
            getItemVariant(item);

          return `
        <div class="warehouse-item">
          <img
            src="${escapeAttribute(itemImage)}"
            onerror="this.onerror=null; this.src='https://zdinvxowzpkolbfzpcac.supabase.co/storage/v1/object/public/product-images/favicon.png'"
          >

          <div class="warehouse-item-info">
            <div class="warehouse-item-title">
              ${escapeHtml(itemName)}
            </div>

            ${itemVariant
              ? `
                <div class="warehouse-item-variant">
                  Variation: ${escapeHtml(itemVariant)}
                </div>
              `
              : ""
            }

            <div class="warehouse-item-qty">
              Qty: ${escapeHtml(itemQty)}
            </div>
          </div>
        </div>
      `;
        }).join("")
        : `
    <div class="empty-box">
      No item details found.
    </div>
  `;

      return `
        <div class="warehouse-order-card">

          <div class="warehouse-order-head">
            <span>
              <strong>
                ${escapeHtml(orderId || "-")}
              </strong>
              <br>
              ${escapeHtml(
        order.customer_name ||
        "Customer"
      )}
            </span>

            <span class="status-badge ${getOrderStatusClass(orderStatus)}">
              ${escapeHtml(orderStatus)}
            </span>
          </div>

          <div class="warehouse-items-list">
            ${itemsHtml}
          </div>

          <div class="warehouse-order-info summary-box">

            <div>
              <span>Phone</span>
              <strong>
                ${escapeHtml(
        order.customer_phone || "-"
      )}
              </strong>
            </div>

            <div>
              <span>Amount</span>
              <strong>
                ₱${amount.toLocaleString("en-PH")}
              </strong>
            </div>

            <div>
              <span>Payment</span>
              <strong>
                ${escapeHtml(
        order.payment_status ||
        order.status ||
        "-"
      )}
              </strong>
            </div>

            <div>
  <span>Courier</span>
  <strong>Store Pickup</strong>
</div>

</div>

<div
  style="
    display:flex;
    justify-content:flex-end;
    margin-top:10px;
  "
>
  <button
    class="mini-manage-btn"
    type="button"
    onclick="openOrderModal('${escapeAttribute(orderId)}')"
  >
    Manage Order
  </button>
</div>

</div>
`;

    }).join("");
}

function renderRoroOrders() {
  if (!roroOrdersTableBody) return;

  if (!roroOrders.length) {
    roroOrdersTableBody.innerHTML = `
      <div class="empty-box">
        No Manual Freight orders yet.
      </div>
    `;
    return;
  }

  const sortedOrders = [...roroOrders].sort(
    (a, b) =>
      new Date(b.created_at) -
      new Date(a.created_at)
  );

  roroOrdersTableBody.innerHTML =
    sortedOrders.map(order => {
      const orderId =
        order.external_id ||
        order.id ||
        "";

      const orderStatus =
        order.order_status ||
        "Pending";

      const amount = Number(
        order.amount ||
        order.total ||
        0
      );

      const items = getOrderItems(order);

      const itemsHtml = items.length
        ? items.map(item => {
          const itemName =
            item.name ||
            item.product_name ||
            item.title ||
            "Product";

          const itemQty =
            item.quantity ||
            item.qty ||
            1;

          const itemImage =
            item.variant_image ||
            item.variantImage ||
            item.product_image ||
            item.productImage ||
            item.image ||
            item.img ||
            item.photo ||
            "https://zdinvxowzpkolbfzpcac.supabase.co/storage/v1/object/public/product-images/favicon.png";

          const itemVariant =
            getItemVariant(item);

          return `
              <div class="warehouse-item">
                <img
                  src="${escapeAttribute(itemImage)}"
                  onerror="this.onerror=null; this.src='https://zdinvxowzpkolbfzpcac.supabase.co/storage/v1/object/public/product-images/favicon.png'"
                >

                <div class="warehouse-item-info">
                  <div class="warehouse-item-title">
                    ${escapeHtml(itemName)}
                  </div>

                  ${itemVariant
              ? `
                      <div class="warehouse-item-variant">
                        Variation: ${escapeHtml(itemVariant)}
                      </div>
                    `
              : ""
            }

                  <div class="warehouse-item-qty">
                    Qty: ${escapeHtml(itemQty)}
                  </div>
                </div>
              </div>
            `;
        }).join("")
        : `
          <div class="empty-box">
            No item details found.
          </div>
        `;

      return `
        <div class="warehouse-order-card">

          <div class="warehouse-order-head">
            <span>
              <strong>
                ${escapeHtml(orderId || "-")}
              </strong>
              <br>
              ${escapeHtml(
        order.customer_name ||
        "Customer"
      )}
            </span>

            <span class="status-badge ${getOrderStatusClass(orderStatus)}">
              ${escapeHtml(orderStatus)}
            </span>
          </div>

          <div class="warehouse-items-list">
            ${itemsHtml}
          </div>

          <div class="warehouse-order-info summary-box">

            <div>
              <span>Phone</span>
              <strong>
                ${escapeHtml(
        order.customer_phone || "-"
      )}
              </strong>
            </div>

            <div>
              <span>Amount</span>
              <strong>
                ₱${amount.toLocaleString("en-PH")}
              </strong>
            </div>

            <div>
              <span>Payment</span>
              <strong>
                ${escapeHtml(
        order.payment_status ||
        order.status ||
        "-"
      )}
              </strong>
            </div>

            <div>
              <span>Courier</span>
              <strong>
                ${escapeHtml(
        order.courier ||
        "Manual Freight Delivery"
      )}
              </strong>
            </div>

          </div>

          <div style="
            display:flex;
            justify-content:flex-end;
            margin-top:10px;
          ">
            <button
              class="mini-manage-btn"
              type="button"
              onclick="openOrderModal('${escapeAttribute(orderId)}')"
            >
              Manage Order
            </button>
          </div>

        </div>
      `;
    }).join("");
}
/* ===============================
   SHOW ALL ITEMS TOGGLE
================================ */

function toggleShowAllOrderItems(orderId) {
  expandedOrderItems[orderId] = !expandedOrderItems[orderId];
  renderAdminOrders();
}

function toggleOrderSummary(orderId) {
  expandedOrderSummary[orderId] =
    !expandedOrderSummary[orderId];

  renderAdminOrders();
}

async function changeOrdersPage(direction) {
  const nextPage = currentOrdersPage + direction;

  if (nextPage < 1 || nextPage > ordersTotalPages) {
    return;
  }

  currentOrdersPage = nextPage;

  await loadAdminOrders();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* ===============================
   LOAD ORDERS
================================ */


function applyUpdatedOrderLocal(updatedOrder) {
  if (!updatedOrder) return;

  const normalized = normalizeOrder(updatedOrder);

  const id = String(
    normalized.external_id ||
    normalized.id ||
    ""
  );

  adminOrders = adminOrders.filter(order =>
    String(order.external_id || order.id) !== id
  );

  storePickupOrders = storePickupOrders.filter(order =>
    String(order.external_id || order.id) !== id
  );

  roroOrders = roroOrders.filter(order =>
    String(order.external_id || order.id) !== id
  );

  const status = String(
    normalized.order_status || ""
  ).toLowerCase();

  const courier = String(
    normalized.courier || ""
  ).toLowerCase();

  const paymentStatus = String(
    normalized.payment_status || ""
  ).toLowerCase();

  const isCancelled =
    status === "cancelled";

  const isExpired =
    status.includes("expired") ||
    paymentStatus.includes("expired");

  const isStorePickup =
    courier.includes("store pickup");

  const isManualFreight =
    courier.includes("manual freight") ||
    courier.includes("roro");

  const isPickupFinished =
    status === "completed" ||
    status === "picked up";

  const isAlreadyProcessing =
    status === "processing" ||
    status === "packed" ||
    status === "shipped" ||
    status === "in transit" ||
    status === "delivered" ||
    status === "completed";

  if (!isCancelled) {

    if (
      isStorePickup &&
      !isExpired &&
      !isPickupFinished
    ) {
      storePickupOrders.unshift(normalized);

      if (
        status === "pending payment" ||
        paymentStatus === "pending payment"
      ) {
        adminOrders.unshift(normalized);
      }

    } else if (
      isManualFreight &&
      !isExpired &&
      !isAlreadyProcessing
    ) {
      roroOrders.unshift(normalized);

    } else {
      adminOrders.unshift(normalized);
    }
  }

  renderAdminOrders();
  renderStorePickupOrders();
  renderRoroOrders();

  const storePickupCount =
    document.getElementById("countStorePickup");

  const roroCount =
    document.getElementById("countRoroOrders");

  if (storePickupCount) {
    const storePickupTotal =
      Number(orderPeriodCounts.storePickup || 0);

    storePickupCount.textContent =
      storePickupTotal;

    storePickupCount.style.display =
      storePickupTotal > 0
        ? "inline-flex"
        : "none";
  }

  if (roroCount) {
    roroCount.textContent = roroOrders.length;
    roroCount.style.display =
      roroOrders.length > 0
        ? "inline-flex"
        : "none";
  }

  updateOrdersSummary();
  updateDashboardOrders();
  updateOrderFilterCounts();
}

function normalizeOrder(order) {
  const paymentStatus =
    order.payment_status ||
    order.status ||
    order.xendit_status ||
    "";

  const paymentMethod =
    order.payment_provider ||
    order.paymentProvider ||
    order.payment_method ||
    order.paymentMethod ||
    order.payment_type ||
    order.payment_option ||
    order.payment_channel ||
    order.method ||
    "";

  const paymentText = String(
    `${paymentStatus} ${paymentMethod} `
  )
    .trim()
    .toUpperCase();

  const isStorePickup =
    String(order.courier || "")
      .trim()
      .toLowerCase()
      .includes("store pickup");

  const isCOD =
    paymentText.includes("COD") ||
    paymentText.includes("CASH ON DELIVERY");

  const isSkyro =
    paymentText.includes("SKYRO");

  const isPaid =
    (
      paymentText === "PAID" ||
      paymentText.includes(" PAID")
    ) &&
    !paymentText.includes("UNPAID");

  const isPaymentExpired =
    paymentText.includes("EXPIRED") ||
    paymentText.includes("PAYMENT EXPIRED");

  let orderStatus = String(
    order.order_status || ""
  ).trim();


  if (
    isStorePickup &&
    (
      !orderStatus ||
      orderStatus === "Pending" ||
      orderStatus === "Pending Payment"
    )
  ) {
    orderStatus = "Pending Payment";

  } else if (isSkyro) {

    if (
      !orderStatus ||
      orderStatus === "Pending Payment" ||
      orderStatus === "Pending" ||
      orderStatus === "Pending Skyro Application"
    ) {
      orderStatus = "Pending Stock Confirmation";
    }

  } else if (isCOD) {
    if (
      !orderStatus ||
      orderStatus === "Pending Payment" ||
      orderStatus === "Pending"
    ) {
      orderStatus = "Pending";
    }

  } else if (isPaymentExpired) {
    orderStatus = "Expired";

  } else if (isPaid) {
    if (
      !orderStatus ||
      orderStatus === "Pending Payment" ||
      orderStatus === "Pending"
    ) {
      orderStatus = "Processing";
    }

  } else if (!orderStatus) {
    orderStatus = "Pending Payment";
  }

  return {
    ...order,

    order_id:
      order.external_id ||
      order.order_id ||
      order.id,

    payment_status:
      isSkyro
        ? (
          String(paymentStatus).trim() ||
          (
            String(orderStatus).toLowerCase() === "skyro approved"
              ? "Skyro Approved"
              : "Pending Skyro Approval"
          )
        )
        : paymentStatus || (isCOD ? "COD" : "Pending Payment"),

    payment_method: paymentMethod,
    order_status: orderStatus,

    subtotal: Number(order.subtotal || 0),

    shipping_fee: Number(
      order.shipping_fee ||
      order.shippingFee ||
      0
    ),

    service_fee: Number(
      order.service_fee ??
      order.serviceFee ??
      order.handling_fee ??
      order.handlingFee ??
      0
    ),

    voucher_discount: Number(
      order.voucher_discount ||
      order.voucherDiscount ||
      0
    ),

    amount: Number(
      order.amount ||
      order.total ||
      0
    ),

    items: (() => {
      if (Array.isArray(order.items)) {
        return order.items;
      }

      if (typeof order.items === "string") {
        try {
          const parsedItems = JSON.parse(order.items);

          return Array.isArray(parsedItems)
            ? parsedItems
            : [];
        } catch (error) {
          console.warn(
            "Unable to parse order items:",
            order.external_id || order.id,
            error
          );

          return [];
        }
      }

      if (
        order.items &&
        typeof order.items === "object"
      ) {
        return Object.values(order.items);
      }

      return [];
    })()
  };
}

async function loadAdminOrders() {
  try {
    if (adminOrdersTableBody) {
      adminOrdersTableBody.innerHTML = `
        <div class="empty-box">Loading orders...</div>
        `;
    }

    const response = await adminFetchWithFallback(
      `/api/orders?page=${currentOrdersPage}&limit=${ordersPerPage}&period=${currentOrderPeriod}&filter=${encodeURIComponent(currentOrderFilter)}`
    );

    const data = await response.json();

    ordersTotalPages =
      Number(data.pagination?.totalPages) || 1;

    ordersTotalRecords =
      Number(data.pagination?.total) || 0;

    orderPeriodCounts =
      data.counts || {};

    if (!data.success || !Array.isArray(data.orders)) {
      throw new Error("Invalid orders response");
    }

    /* REMOVE CANCELLED ORDERS FROM MAIN DASHBOARD */
    const activeOrders = data.orders
      .map(normalizeOrder)
      .filter(order => order.order_status !== "Cancelled");

    storePickupOrders = activeOrders.filter(order => {
      const courier = String(
        order.courier || ""
      ).toLowerCase();

      const orderStatus = String(
        order.order_status || ""
      ).toLowerCase();

      const paymentStatus = String(
        order.payment_status || ""
      ).toLowerCase();

      const isExpired =
        orderStatus.includes("expired") ||
        paymentStatus.includes("expired");

      const isPickupFinished =
        orderStatus === "completed" ||
        orderStatus === "picked up";

      return (
        courier.includes("store pickup") &&
        !isExpired &&
        !isPickupFinished
      );
    });

    roroOrders = activeOrders.filter(order => {
      const courier = String(
        order.courier || ""
      ).toLowerCase();

      const orderStatus = String(
        order.order_status || ""
      ).toLowerCase();

      const paymentStatus = String(
        order.payment_status || ""
      ).toLowerCase();

      const isExpired =
        orderStatus.includes("expired") ||
        paymentStatus.includes("expired");

      const isAlreadyProcessing =
        orderStatus === "processing" ||
        orderStatus === "packed" ||
        orderStatus === "shipped" ||
        orderStatus === "in transit" ||
        orderStatus === "delivered";

      return (
        (
          courier.includes("manual freight") ||
          courier.includes("roro")
        ) &&
        !isExpired &&
        !isAlreadyProcessing
      );
    });

    const storePickupCount =
      document.getElementById("countStorePickup");

    const roroCount =
      document.getElementById("countRoroOrders");

    if (storePickupCount) {
      storePickupCount.textContent =
        storePickupOrders.length;

      storePickupCount.style.display =
        storePickupOrders.length > 0
          ? "inline-flex"
          : "none";
    }

    if (roroCount) {
      roroCount.textContent =
        roroOrders.length;

      roroCount.style.display =
        roroOrders.length > 0
          ? "inline-flex"
          : "none";
    }

    adminOrders = activeOrders.filter(order => {
      const courier = String(
        order.courier || ""
      ).toLowerCase();

      const orderStatus = String(
        order.order_status || ""
      ).toLowerCase();

      const paymentStatus = String(
        order.payment_status || ""
      ).toLowerCase();

      const isExpired =
        orderStatus.includes("expired") ||
        paymentStatus.includes("expired");

      const isManualFreight =
        courier.includes("roro") ||
        courier.includes("manual freight");

      const isAlreadyProcessing =
        orderStatus === "processing" ||
        orderStatus === "packed" ||
        orderStatus === "shipped" ||
        orderStatus === "in transit" ||
        orderStatus === "delivered";

      const isCompletedPickup =
        courier.includes("store pickup") &&
        (
          orderStatus === "completed" ||
          orderStatus === "picked up"
        ) &&
        paymentStatus === "paid";

      const isPaidStorePickup =
        courier.includes("store pickup") &&
        paymentStatus === "paid";

      const isPendingStorePickup =
        courier.includes("store pickup") &&
        (
          orderStatus === "pending payment" ||
          paymentStatus === "pending payment"
        );

      return (
        isExpired ||
        isCompletedPickup ||
        isPaidStorePickup ||
        isPendingStorePickup ||
        (
          !courier.includes("store pickup") &&
          !isManualFreight
        ) ||
        (
          isManualFreight &&
          isAlreadyProcessing
        )
      );
    });

    renderAdminOrders();
    renderStorePickupOrders();
    renderRoroOrders();
    updateOrdersSummary();
    updateDashboardOrders();
    updateOrderFilterCounts();

  } catch (error) {
    console.error(error);

    if (adminOrdersTableBody) {
      adminOrdersTableBody.innerHTML = `
    <div class="empty-box">Cannot load orders.</div>
    `;
    }
  }
}

/* ===============================
   ORDER MODAL
================================ */

function getShipmentButton(order, orderId) {
  const orderStatus = String(
    order.order_status || ""
  ).trim().toLowerCase();

  const courier = String(
    order.courier || ""
  ).trim().toLowerCase();

  const isStorePickup =
    courier.includes("store pickup");

  const isSkyro =
    String(order.payment_method || "")
      .toLowerCase()
      .includes("skyro");

  const isSkyroApproved =
    orderStatus === "skyro approved";

  const paymentStatus = String(
    order.payment_status ||
    order.status ||
    ""
  ).trim().toUpperCase();

  const isPaid =
    paymentStatus === "PAID";

  const paymentProvider = String(
    order.payment_provider ||
    order.paymentProvider ||
    order.payment_method ||
    ""
  ).trim().toUpperCase();

  const isOnlinePayment =
    paymentProvider.includes("XENDIT") ||
    paymentProvider.includes("MAYA") ||
    paymentProvider.includes("SKYRO");

  if (isStorePickup) {

    if (
      orderStatus === "completed" ||
      orderStatus === "picked up"
    ) {
      return `
      <button
        class="primary-btn"
        type="button"
        disabled
        style="
          opacity:0.55;
          cursor:not-allowed;
        "
      >
        Pickup Completed
      </button>
    `;
    }

    if (orderStatus === "ready for pickup") {

      if (!isPaid) {
        return `
      <button
        class="primary-btn"
        type="button"
        onclick="markStorePickupPaid(
          '${escapeAttribute(orderId)}',
          this
        )"
      >
        Mark Paid
      </button>
    `;
      }

      return `
    <button
      class="primary-btn"
      type="button"
      onclick="completeStorePickup(
        '${escapeAttribute(orderId)}',
        this
      )"
    >
      Mark as Picked Up
    </button>
  `;
    }

    if (isOnlinePayment && !isPaid) {
      return `
      <button
        class="primary-btn"
        type="button"
        disabled
        style="
          opacity:0.55;
          cursor:not-allowed;
        "
      >
        Waiting for Online Payment
      </button>
    `;
    }

    if (isOnlinePayment && isPaid) {
      return `
      <button
        class="primary-btn"
        type="button"
        disabled
        style="
          opacity:0.55;
          cursor:not-allowed;
        "
      >
        Payment Received
      </button>
    `;
    }

    if (!isOnlinePayment && isPaid) {
      return `
    <button
      class="primary-btn"
      type="button"
      onclick="confirmStorePickup(
        '${escapeAttribute(orderId)}',
        this
      )"
    >
      Mark Ready for Pickup
    </button>
  `;
    }

    return `
  <button
    class="primary-btn"
    type="button"
    onclick="markStorePickupPaid(
      '${escapeAttribute(orderId)}',
      this
    )"
  >
    Confirm Payment / Mark Paid
  </button>
`;
  }

  if (isSkyro && !isSkyroApproved && !isPaid) {
    return `
      <button
        class="primary-btn"
        type="button"
        disabled
        style="
          opacity:0.55;
          cursor:not-allowed;
        "
      >
        Waiting for Skyro Approval
      </button>
    `;
  }

  const shipmentAlreadyArranged =
    Boolean(order.shipment_arranged_at) ||
    Boolean(order.awb_link) ||
    Boolean(order.tracking_number) ||
    [
      "packed",
      "shipped",
      "in transit",
      "delivered"
    ].includes(orderStatus);

  if (shipmentAlreadyArranged) {
    return `
      <button
        class="primary-btn"
        type="button"
        disabled
        style="
          opacity:0.55;
          cursor:not-allowed;
        "
      >
        Shipment Arranged
      </button>
    `;
  }

  return `
    <button
      class="primary-btn"
      type="button"
      onclick="arrangeShipment(
        '${escapeAttribute(orderId)}',
        this
      )"
    >
      Arrange Shipment
    </button>
  `;
}

async function confirmStorePickup(orderId, btn) {
  try {

    const allActiveOrders = [
      ...adminOrders,
      ...storePickupOrders,
      ...roroOrders
    ];

    const order = allActiveOrders.find(o =>
      String(o.external_id || o.id) === String(orderId)
    );

    if (!order) {
      showToast("Order not found.", "error");
      return;
    }

    const paymentProvider = String(
      order.payment_provider ||
      order.paymentProvider ||
      order.payment_method ||
      ""
    ).trim().toUpperCase();

    const isOnlinePayment =
      paymentProvider.includes("XENDIT") ||
      paymentProvider.includes("MAYA") ||
      paymentProvider.includes("SKYRO");

    if (isOnlinePayment) {
      showToast(
        "Online payment orders must wait for payment confirmation.",
        "error"
      );
      return;
    }

    setButtonLoading(btn, "Confirming Pickup...");

    const response = await adminFetchWithFallback(
      "/api/orders/update",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          orderId,
          order_status: "Ready for Pickup"
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message ||
        "Failed to confirm pickup order."
      );
    }

    await showSuccessModal(
      "Ready for Pickup",
      "The order is now ready for customer pickup."
    );

    closeOrderModal();
    applyUpdatedOrderLocal(result.order);

  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Pickup confirmation failed.",
      "error"
    );

  } finally {
    resetButtonLoading(btn);
  }
}

async function markStorePickupPaid(orderId, btn) {

  const confirmed = await showConfirmModal(
    "Confirm OTC Payment",
    "Confirm that payment has already been received from the customer?"
  );

  if (!confirmed) return;

  try {
    setButtonLoading(btn, "Marking Paid...");

    const response = await adminFetchWithFallback(
      "/api/orders/update",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          orderId,
          payment_status: "PAID"
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message ||
        "Failed to mark order as paid."
      );
    }

    closeOrderModal();
    applyUpdatedOrderLocal(result.order);

    await showSuccessModal(
      "Payment Received",
      "Store pickup payment has been marked as PAID."
    );

  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Unable to mark payment as paid.",
      "error"
    );

  } finally {
    resetButtonLoading(btn);
  }
}

async function completeStorePickup(orderId, btn) {

  const confirmed = await showConfirmModal(
    "Complete Store Pickup",
    "Confirm that the customer has fully paid and already picked up the order?"
  );

  if (!confirmed) return;

  try {
    setButtonLoading(btn, "Completing Order...");

    // 1) completeStorePickup()

    const response = await adminFetchWithFallback(
      "/api/orders/update",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          orderId,
          order_status: "Completed"
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message ||
        "Failed to complete pickup order."
      );
    }

    closeOrderModal();
    applyUpdatedOrderLocal(result.order);

    await showSuccessModal(
      "Pickup Completed",
      "The order was successfully paid and picked up by the customer."
    );

  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Pickup completion failed.",
      "error"
    );

  } finally {
    resetButtonLoading(btn);
  }
}

function openOrderModal(orderId) {
  const allActiveOrders = [
    ...adminOrders,
    ...storePickupOrders,
    ...roroOrders
  ];

  const order = allActiveOrders.find(o =>
    String(o.external_id || o.id) === String(orderId)
  );

  if (!order) return;

  const modal = document.getElementById("orderModal");
  const content = document.getElementById("orderModalContent");

  if (!modal || !content) return;

  const address = order.address || {};

  const pinnedLat =
    order.delivery_lat ||
    address.deliveryLat ||
    address.lat ||
    "-";

  const pinnedLng =
    order.delivery_lng ||
    address.deliveryLng ||
    address.lng ||
    "-";

  const fullAddress =
    typeof address === "string"
      ? address
      : [
        address.fullAddress,
        address.barangay,
        address.city,
        address.province,
        address.country
      ].filter(Boolean).join(", ");

  const modalItems = Array.isArray(order.items)
    ? order.items
    : [];

  const modalCalculatedSubtotal = modalItems.reduce((sum, item) => {
    const price = Number(
      item.price ??
      item.unit_price ??
      item.unitPrice ??
      item.selling_price ??
      0
    );

    const quantity = Number(
      item.quantity ??
      item.qty ??
      item.quantityOrdered ??
      1
    );

    return sum + (price * quantity);
  }, 0);

  const modalSubtotal =
    modalCalculatedSubtotal > 0
      ? modalCalculatedSubtotal
      : Number(order.subtotal || 0);

  const modalVoucher = Number(
    order.voucher_discount ??
    order.voucherDiscount ??
    0
  );

  const modalShipping = Number(
    order.shipping_fee ??
    order.shippingFee ??
    0
  );

  const modalServiceFee = Number(
    order.service_fee ??
    order.serviceFee ??
    order.handling_fee ??
    order.handlingFee ??
    0
  );

  const modalTotal =
    modalSubtotal -
    modalVoucher +
    modalShipping +
    modalServiceFee;

  const isStorePickup =
    String(order.courier || "")
      .toLowerCase()
      .includes("store pickup");

  const paymentProvider = String(
    order.payment_provider ||
    order.paymentProvider ||
    order.payment_method ||
    ""
  ).trim().toUpperCase();

  const isOnlinePayment =
    paymentProvider.includes("XENDIT") ||
    paymentProvider.includes("MAYA") ||
    paymentProvider.includes("SKYRO");

  const isStorePickupOTC =
    isStorePickup && !isOnlinePayment;

  content.innerHTML = `

    <h3>Order: ${escapeHtml(order.external_id || order.id || "-")}</h3>

    <p><strong>Customer:</strong> ${escapeHtml(order.customer_name || "-")}</p>
    <p><strong>Phone:</strong> ${escapeHtml(order.customer_phone || "-")}</p>
    <p><strong>Address:</strong> ${escapeHtml(fullAddress || "-")}</p>

    ${String(order.courier || "").toLowerCase().includes("lalamove") ||
      String(order.courier || "").toLowerCase().includes("same day")
      ? `
        <div style="
          margin-top:10px;
          padding:10px;
          background:#fff7ed;
          border-radius:8px;
        ">
          <strong>Pinned Delivery Address</strong><br>
          ${escapeHtml(address.pinAddress || "-")}

          <br><br>
          <small>
            Coordinates: ${escapeHtml(pinnedLat)}, ${escapeHtml(pinnedLng)}
          </small>
        </div>
        `
      : ""
    }

    <p><strong>Amount:</strong> ₱${modalTotal.toLocaleString("en-PH")}</p>
    <p><strong>Status:</strong> ${escapeHtml(order.order_status || "Pending")}</p>
    <p>
  
<p>
  <strong>Courier:</strong>

  ${String(order.courier || "")
      .toLowerCase()
      .includes("store pickup")
      ? `
      <span style="
        background:#16a34a;
        color:#fff;
        padding:4px 8px;
        border-radius:8px;
        font-weight:700;
      ">
        STORE PICKUP
      </span>
    `
      : String(order.courier || "")
        .toLowerCase()
        .includes("lalamove") ||
        String(order.courier || "")
          .toLowerCase()
          .includes("same day")
        ? `
        <span style="
          background:#f97316;
          color:#fff;
          padding:4px 8px;
          border-radius:8px;
          font-weight:700;
        ">
          LALAMOVE / SAME DAY - MANUAL BOOKING
        </span>
      `
        : `
        <span style="
          background:#2563eb;
          color:#fff;
          padding:4px 8px;
          border-radius:8px;
          font-weight:700;
        ">
          ${escapeHtml(order.courier || "SPX")}
        </span>
      `
    }
</p>

    <p><strong>Tracking:</strong> ${escapeHtml(order.tracking_number || "-")}</p>

    ${String(
      order.payment_method ||
      order.payment_provider ||
      order.paymentProvider ||
      order.payment_status ||
      ""
    )
      .toUpperCase()
      .includes("SKYRO")
      ? `
    <div style="
      margin-top:14px;
      padding:14px;
      background:#f5f3ff;
      border:1px solid #ddd6fe;
      border-radius:12px;
    ">
      <div style="
        margin-bottom:10px;
        font-weight:700;
        color:#4c1d95;
      ">
        Skyro Application
      </div>

      <p style="
        margin:0 0 12px;
        color:#6b21a8;
      ">
        Status:
        <strong>
          ${escapeHtml(
        order.skyro_status ||
        order.order_status ||
        "Pending Stock Confirmation"
      )}
        </strong>
      </p>

      ${String(order.order_status || "")
        .trim()
        .toLowerCase() === "skyro application rejected"
        ? `
      <button
        type="button"
        class="danger-btn"
        disabled
        style="
          opacity:1;
          cursor:not-allowed;
        "
      >
        Skyro Application Rejected
      </button>
    `

        : String(order.order_status || "")
          .trim()
          .toLowerCase() === "skyro approved"
          ? `
      <button
        type="button"
        class="primary-btn"
        disabled
        style="
          opacity:1;
          cursor:not-allowed;
          background:#16a34a;
          color:#ffffff;
        "
      >
        Skyro Approved ✓
      </button>
    `

          : order.skyro_application_link
            ? `

    <div style="display:flex; gap:8px; flex-wrap:wrap;">

      <button
        type="button"
        class="primary-btn"
        disabled
        style="
          opacity:0.55;
          cursor:not-allowed;
        "
      >
        Application Link Created
      </button>

      <button
          type="button"
          class="secondary-btn"
          onclick="window.open(
            '${escapeAttribute(order.skyro_application_link)}',
            '_blank'
          )"
        >
          View Skyro Link
     </button>

     <button
          type="button"
          class="secondary-btn"
          onclick="refreshSkyroStatus(
            '${escapeAttribute(orderId)}',
            this
          )"
        >
          Refresh Skyro Status
     </button>

      ${[
              "skyro application allowed",
              "pending skyro approval"
            ].includes(
              String(order.order_status || "")
                .trim()
                .toLowerCase()
            )
              ? `
    <button
      type="button"
      class="danger-btn"
      onclick="rejectSkyroApplication(
        '${escapeAttribute(orderId)}',
        this
      )"
    >
      Reject Skyro Application
    </button>
  `
              : ""
            }

    </div>
  `

            : String(order.order_status || "") ===
              "Pending Stock Confirmation"
              ? `
            <button
              type="button"
              class="primary-btn"
              onclick="confirmSkyroStock(
                '${escapeAttribute(orderId)}',
                this
              )"
            >
              Confirm Stock & Create Skyro Link
            </button>
          `
              : `
            <button
              type="button"
              class="primary-btn"
              disabled
              style="
                opacity:0.55;
                cursor:not-allowed;
              "
            >
              Waiting for Skyro Application
            </button>
          `
      }
    </div>
  `
      : ""
    }

    <div class="order-modal-actions">

      ${getShipmentButton(order, orderId)}


${!isStorePickup ? `
  <button
    class="small-btn"
    type="button"
    onclick="markOrderPacked(
      '${escapeAttribute(orderId)}',
      this
    )"
  >
    Mark Packed
  </button>
` : ""}

${!isStorePickup ? `
  <button
    class="small-btn"
    type="button"
    onclick="markOrderShipped(
      '${escapeAttribute(orderId)}',
      this
    )"
  >
    Mark Shipped
  </button>

  <button
    class="small-btn"
    type="button"
    onclick="markOrderInTransit(
      '${escapeAttribute(orderId)}',
      this
    )"
  >
    In Transit
  </button>

  <button
    class="danger-btn"
    type="button"
    onclick="markOrderFailed(
      '${escapeAttribute(orderId)}',
      this
    )"
  >
    Failed Delivery
  </button>

  <button
    class="small-btn"
    type="button"
    onclick="markOrderDelivered(
      '${escapeAttribute(orderId)}',
      this
    )"
  >
    Mark Delivered
  </button>

  <button
    class="secondary-btn"
    type="button"
    onclick="openAWB(
      '${escapeAttribute(orderId)}'
    )"
  >
    Print AWB
  </button>
` : ""}

<button
  class="secondary-btn"
  type="button"
  onclick="printOrderInvoice('${escapeAttribute(orderId)}')"
>
  Print Invoice
</button>

      ${!isStorePickup ? `
  <button
    class="secondary-btn"
    type="button"
    onclick="openTracking(
      '${escapeAttribute(orderId)}'
    )"
  >
    Track Order
  </button>
` : ""}

      ${order.order_request_status ? `
        <button class="small-btn" type="button" onclick="handleOrderRequestAction('${escapeAttribute(orderId)}')">
          Customer Request
        </button>
      ` : ""}
    </div>

${(
      (
        [
          "pending",
          "pending payment",
          "processing",
          "pending stock confirmation",
          "pending skyro approval",
          "pending skyro application",
          "skyro application allowed"
        ].includes(
          String(order.order_status || "")
            .trim()
            .toLowerCase()
        ) ||
        isStorePickupOTC
      ) &&
      String(order.payment_status || "")
        .trim()
        .toUpperCase() !== "PAID"
    ) ? `

    <div class="order-cancel-actions">
      <select id="cancelReason-${escapeAttribute(orderId)}" class="cancel-reason-dropdown">
        <option value="">Select reason</option>
        <option>Out of stock</option>
        <option>Price error</option>
        <option>Wrong item listing</option>
        <option>Cannot fulfill order</option>
        <option>Customer unreachable</option>
        <option>Other reason</option>
      </select>

      <button
        class="danger-btn"
        type="button"
        onclick="cancelOrder('${escapeAttribute(orderId)}', this)"
      >
        Cancel Order
      </button>
    </div>
    ` : ""}
  `;

  modal.style.display = "flex";
}

function closeOrderModal() {
  const modal = document.getElementById("orderModal");

  if (modal) {
    modal.style.display = "none";
  }
}

async function confirmSkyroStock(orderId, btn) {

  const ok = await showConfirmModal(
    "Confirm Skyro Stock",
    "Confirm that the stock is available and create the Skyro application link?"
  );

  if (!ok) return;

  try {
    setButtonLoading(btn, "Creating Skyro Link...");

    const response = await fetch(
      `${BACKUP_API_URL}/api/orders/${orderId}/skyro-create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message ||
        "Failed to create Skyro application."
      );
    }

    closeOrderModal();

    if (result.order) {
      applyUpdatedOrderLocal(result.order);
    } else {
      await loadAdminOrders();
    }

    await showSuccessModal(
      result.alreadyCreated
        ? "Skyro Link Ready"
        : "Skyro Stock Confirmed",
      result.alreadyCreated
        ? "The Skyro application link already exists and is ready for the customer."
        : "Stock was confirmed and the Skyro application link was created successfully."
    );

  } catch (error) {
    console.error(
      "Skyro create application error:",
      error
    );

    showToast(
      error.message ||
      "Skyro application server error.",
      "error"
    );

  } finally {
    resetButtonLoading(btn);
  }
}

async function refreshSkyroStatus(orderId, btn) {
  try {
    setButtonLoading(btn, "Checking Skyro...");

    const response = await adminFetchWithFallback(
      `/api/orders/${orderId}/skyro-status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message ||
        "Unable to check Skyro status."
      );
    }

    closeOrderModal();
    applyUpdatedOrderLocal(result.order);

    await showSuccessModal(
      "Skyro Status Updated",
      `Skyro status is now: ${result.skyroStatus}`
    );

  } catch (error) {
    console.error(
      "Refresh Skyro status error:",
      error
    );

    showToast(
      error.message ||
      "Unable to check Skyro status.",
      "error"
    );

  } finally {
    resetButtonLoading(btn);
  }
}

async function rejectSkyroApplication(orderId, btn) {

  const ok = await showConfirmModal(
    "Reject Skyro Application",
    "Are you sure you want to reject this Skyro application? The customer will no longer be able to open the application link."
  );

  if (!ok) return;

  try {

    setButtonLoading(btn, "Rejecting...");

    const response = await adminFetchWithFallback(
      "/api/orders/update",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          orderId,
          order_status: "Skyro Application Rejected",
          payment_status: "Skyro Application Rejected"
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message ||
        "Failed to reject Skyro application."
      );
    }

    closeOrderModal();
    applyUpdatedOrderLocal(result.order);

    await showSuccessModal(
      "Skyro Application Rejected",
      "The Skyro application was successfully rejected."
    );

  } catch (error) {

    console.error(
      "Reject Skyro application error:",
      error
    );

    showToast(
      error.message ||
      "Unable to reject Skyro application.",
      "error"
    );

  } finally {

    resetButtonLoading(btn);

  }
}

/* ===============================
   CANCEL ORDER
   NOTE: Backend route must exist: /api/orders/:orderId/cancel
================================ */

async function cancelOrder(orderId, btn) {

  const reasonSelect =
    document.getElementById(`cancelReason-${orderId}`);

  const cancelReason =
    reasonSelect?.value || "";

  if (!cancelReason) {

    await showSuccessModal(
      "Cancellation Reason Required",
      "Please select a cancellation reason before cancelling the order."
    );

    return;
  }

  const confirmCancel = await showConfirmModal(
    "Cancel Order",
    `Are you sure you want to cancel this order?

Reason: ${cancelReason}

This action will move the order to Cancelled.`
  );

  if (!confirmCancel) return;

  try {
    setButtonLoading(btn, "Cancelling...");

    const res = await fetch(
      `${BACKUP_API_URL}/api/orders/${orderId}/cancel`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          orderId,
          order_status: "Cancelled",
          cancel_type: "Seller Forced Cancel",
          cancel_reason: cancelReason,
          cancelled_by: "seller",
          cancelled_at: new Date().toISOString(),

          order_request_status: null,
          order_request_reason: null
        })

      }

    );

    const result = await res.json();

    if (!result.success) {
      showToast(result.message || "Failed to cancel order", "error");
      return;
    }

    closeOrderModal();

    applyUpdatedOrderLocal(result.order);
    await loadCancelledOrders();

    await showSuccessModal(
      "Order Cancelled",
      "The order was successfully cancelled."
    );

  } catch (error) {
    console.error(error);
    showToast("Cancel order server error", "error");

  } finally {
    resetButtonLoading(btn);
  }
}

async function createSPXShipment(orderId, btn) {
  try {
    const order = adminOrders.find(o =>
      String(o.external_id || o.id) === String(orderId)
    );

    if (!order) {
      showToast("Order not found", "error");
      return;
    }

    const paymentStatus = String(
      order.payment_status ||
      order.status ||
      ""
    ).toUpperCase();

    const isCOD =
      paymentStatus.includes("COD");

    const isPaid =
      paymentStatus === "PAID";

    const isSkyroApproved =
      String(order.payment_method || "")
        .toUpperCase()
        .includes("SKYRO") &&
      String(order.order_status || "")
        .toUpperCase() === "SKYRO APPROVED";

    if (
      !isCOD &&
      !isPaid &&
      !isSkyroApproved
    ) {
      showToast(
        String(order.payment_method || "")
          .toUpperCase()
          .includes("SKYRO")
          ? "Skyro application must be approved before arranging shipment."
          : "Only COD, PAID, or Skyro Approved orders can arrange shipment.",
        "error"
      );

      return;
    }

    setButtonLoading(btn, "Arranging Shipment...");

    /*
      STEP 1:
      Gumawa ng SPX shipment / waybill.
    */
    const shipmentResponse = await fetch(
      `${BACKUP_API_URL}/api/orders/${orderId}/spx-create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const shipmentResult =
      await shipmentResponse.json();

    if (!shipmentResponse.ok || !shipmentResult.success) {
      throw new Error(
        shipmentResult.message ||
        "SPX shipment failed"
      );
    }

    resetButtonLoading(btn);

    closeOrderModal();
    applyUpdatedOrderLocal(shipmentResult.order);

    await showSuccessModal(
      "SPX Shipment Arranged",
      "The shipment was successfully arranged and the order moved to Processing."
    );


  } catch (error) {
    console.error(
      "SPX shipment error:",
      error
    );

    showToast(
      error.message || "SPX server error",
      "error"
    );

  } finally {
    resetButtonLoading(btn);
  }
}

async function bookLalamoveShipment(orderId, btn) {
  try {
    const order = adminOrders.find(o =>
      String(o.external_id || o.id) === String(orderId)
    );

    if (!order) {
      showToast("Order not found", "error");
      return;
    }

    const paymentStatus = String(
      order.payment_status ||
      order.status ||
      ""
    ).toUpperCase();

    const isCOD = paymentStatus.includes("COD");
    const isPaid = paymentStatus === "PAID";

    const isSkyroApproved =
      String(order.payment_method || "")
        .toUpperCase()
        .includes("SKYRO") &&
      String(order.order_status || "")
        .toUpperCase() === "SKYRO APPROVED";

    if (!isCOD && !isPaid && !isSkyroApproved) {
      showToast(
        "Only COD or PAID orders can arrange shipment.",
        "error"
      );
      return;
    }

    setButtonLoading(btn, "Booking Rider...");

    /*
      STEP 1:
      Book Lalamove rider.
    */
    const bookingResponse = await fetch(
      `https://de-ecom-pro.onrender.com/api/orders/${orderId}/lalamove-create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const bookingResult =
      await bookingResponse.json();

    if (!bookingResponse.ok || !bookingResult.success) {
      throw new Error(
        bookingResult.message ||
        "Lalamove booking failed"
      );
    }

    /*
      STEP 2:
      Pag successful ang booking,
      Processing muna.
    */
    const res = await adminFetchWithFallback(
      "/api/orders/update",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          orderId,
          order_status: "Processing"
        })
      }
    );

    const updateResult =
      await res.json();

    if (!res.ok || !updateResult.success) {

      throw new Error(
        updateResult.message ||
        "Booking successful but status update failed"
      );
    }

    closeOrderModal();
    applyUpdatedOrderLocal(updateResult.order);

    await showSuccessModal(
      "Lalamove Rider Booked",
      "The rider was successfully booked and the order moved to Processing."
    );

  } catch (error) {
    console.error(
      "Lalamove booking error:",
      error
    );

    showToast(
      error.message || "Lalamove server error",
      "error"
    );

  } finally {
    resetButtonLoading(btn);
  }
}


async function arrangeManualFreight(orderId, btn) {
  try {
    setButtonLoading(
      btn,
      "Arranging Manual Freight..."
    );

    // 2) arrangeManualFreight()

    const response = await adminFetchWithFallback(
      "/api/orders/update",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          orderId,
          order_status: "Processing",
          shipment_arranged_at:
            new Date().toISOString()
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message ||
        "Failed to arrange Manual Freight."
      );
    }

    closeOrderModal();
    applyUpdatedOrderLocal(result.order);

    await showSuccessModal(
      "Manual Freight Arranged",
      "Manual Freight was successfully arranged and the order moved to Processing."
    );

  } catch (error) {
    console.error(
      "Manual Freight error:",
      error
    );

    showToast(
      error.message ||
      "Manual Freight arrangement failed.",
      "error"
    );

  } finally {
    resetButtonLoading(btn);
  }
}

async function arrangeShipment(orderId, btn) {
  const allOrders = [
    ...adminOrders,
    ...storePickupOrders,
    ...roroOrders
  ];

  const order = allOrders.find(o =>
    String(o.external_id || o.id) === String(orderId)
  );

  if (!order) {
    showToast("Order not found.", "error");
    return;
  }

  const courier = String(
    order.courier || ""
  ).toLowerCase();

  if (
    courier.includes("lalamove") ||
    courier.includes("same day")
  ) {
    return bookLalamoveShipment(orderId, btn);
  }

  if (
    courier.includes("manual freight") ||
    courier.includes("roro")
  ) {
    return arrangeManualFreight(orderId, btn);
  }

  return createSPXShipment(orderId, btn);
}

function openAWB(orderId) {
  const order = adminOrders.find(o =>
    String(o.external_id || o.id) === String(orderId)
  );

  if (!order || !order.awb_link) {
    showToast("No AWB link available.", "error");
    return;
  }

  window.open(order.awb_link, "_blank");
}

async function approveOrderRequest(orderId) {

  const ok = await showConfirmModal(
    "Approve Cancellation Request",
    "Approve the customer's cancellation request and cancel this order?"
  );

  if (!ok) return;

  const order = adminOrders.find(o =>
    String(o.external_id || o.id) === String(orderId)
  );

  const reason =
    order?.order_request_reason ||
    "Customer cancellation request approved";

  try {
    const res = await fetch(
      `${BACKUP_API_URL}/api/orders/${orderId}/cancel`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          orderId,
          order_status: "Cancelled",
          cancel_type: "Customer Requested Cancel",
          cancel_reason: reason,
          cancelled_by: "customer_request",
          cancelled_at: new Date().toISOString(),

          order_request_status: "Approved",
          order_request_reason: reason
        })
      }
    );

    const result = await res.json();

    if (!result.success) {
      showToast(result.message || "Failed to approve cancellation.", "error");
      return;
    }

    closeOrderModal();

    applyUpdatedOrderLocal(result.order);
    await loadCancelledOrders();

    await showSuccessModal(
      "Cancellation Approved",
      "The customer's cancellation request was approved and the order was cancelled."
    );

  } catch (error) {
    console.error(error);
    showToast("Approve request server error.", "error");
  }
}

async function rejectOrderRequest(orderId) {
  const ok = await showConfirmModal(
    "Reject Request",
    "Are you sure you want to reject this customer request?"
  );

  if (!ok) return;

  const updated = await updateOrderRequestStatus(
    orderId,
    "Rejected"
  );

  if (!updated) return;

  await showSuccessModal(
    "Request Rejected",
    "The customer request was successfully rejected."
  );
}


async function updateOrderRequestStatus(orderId, status) {
  const { data, error } = await supabaseClient
    .from("orders")
    .update({
      order_request_status: status
    })
    .or(`external_id.eq.${orderId},id.eq.${orderId}`)
    .select()
    .single();

  if (error) {
    console.error(error);
    showToast("Failed to update request status.", "error");
    return false;
  }

  applyUpdatedOrderLocal(data);

  return true;
}

async function handleOrderRequestAction(orderId) {

  const action = prompt(
    `Customer Request Action

Type:
1 = Approve
2 = Reject`
  );

  if (!action) return;

  if (action === "1") {

    await approveOrderRequest(orderId);

  } else if (action === "2") {

    await rejectOrderRequest(orderId);

  } else {

    showToast("Invalid action selected.", "error");

  }
}

function openTracking(orderId) {
  const order = adminOrders.find(o =>
    String(o.external_id || o.id) === String(orderId)
  );

  if (!order || !order.tracking_link) {
    showToast("No tracking link available.", "error");
    return;
  }

  window.open(order.tracking_link, "_blank");
}

/* ===============================
   CANCELLED ORDERS
================================ */

async function loadCancelledOrders() {
  if (!cancelledOrdersTableBody) return;

  try {

    cancelledOrdersTableBody.innerHTML = `
      <div class="empty-box">
        Loading cancelled orders...
      </div>
    `;

    const res = await adminFetchWithFallback(
      "/api/orders/cancelled"
    );

    const data = await res.json();

    cancelledOrders = Array.isArray(data.orders)
      ? data.orders
      : [];

    renderCancelledOrders();

  } catch (error) {

    console.error(error);

    cancelledOrdersTableBody.innerHTML = `
      <div class="empty-box">
        Cannot load cancelled orders.
      </div>
    `;
  }
}

function renderCancelledOrders() {

  if (!cancelledOrdersTableBody) return;

  if (!cancelledOrders.length) {

    cancelledOrdersTableBody.innerHTML = `
      <div class="empty-box">
        No cancelled orders yet.
      </div>
    `;

    return;
  }

  cancelledOrdersTableBody.innerHTML =
    cancelledOrders.map(order => {

      const orderId =
        order.external_id ||
        order.id ||
        "";

      return `
        <div class="warehouse-order-card">

          <div class="warehouse-order-head">

            <span>
              <strong>${escapeHtml(orderId)}</strong>
              <br>
              ${escapeHtml(order.customer_name || "Customer")}
            </span>

            <span class="status-badge status-inactive">
  Cancelled
  ${order.cancel_type
          ? `• ${escapeHtml(order.cancel_type)}`
          : ""}
</span>

          </div>

<div
  class="warehouse-order-info summary-box"
  style="
    border-top:1px solid #e5e7eb;
    padding-top:10px;
    margin-top:10px;
  "
>
            <div>
              <span>Amount</span>

              <strong>
                ₱${Number(order.amount || 0)
          .toLocaleString("en-PH")}
              </strong>
            </div>

            <div>
              <span>Payment</span>

              <strong>
                ${escapeHtml(order.status || "-")}
              </strong>
            </div>

          </div>
      `;

    }).join("");
}

async function undoCancelledOrder(orderId) {

  const ok = await showConfirmModal(
    "Undo Cancelled Order",
    "Restore this order back to Processing?"
  );

  if (!ok) return;

  try {

    const res = await adminFetchWithFallback(
      "/api/orders/update",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          orderId,
          order_status: "Processing"
        })
      }
    );

    const result = await res.json();

    if (!result.success) {
      showToast(
        result.message || "Failed to restore order",
        "error"
      );
      return;
    }

    await loadCancelledOrders();
    applyUpdatedOrderLocal(result.order);

    await showSuccessModal(
      "Order Restored",
      "The order was successfully restored to Processing."
    );

  } catch (error) {

    console.error(error);

    showToast(
      "Restore order server error",
      "error"
    );
  }
}

async function permanentDeleteOrder(orderId) {

  const ok = await showConfirmModal(
    "Permanent Delete",
    "This action cannot be undone."
  );

  if (!ok) return;

  try {

    const res = await fetch(
      `https://de-ecom-pro.onrender.com/api/orders/${orderId}/delete`,
      {
        method: "DELETE"
      }
    );

    const result = await res.json();

    if (!result.success) {

      showToast(
        result.message || "Failed to delete order",
        "error"
      );

      return;
    }

    await loadCancelledOrders();

    await showSuccessModal(
      "Order Deleted",
      "The order was permanently deleted successfully."
    );

  } catch (error) {

    console.error(error);

    showToast(
      "Delete order server error",
      "error"
    );
  }
}

function getSelectedOrderIds() {

  return Array
    .from(document.querySelectorAll(".order-select-checkbox:checked"))

    .map(checkbox => checkbox.value)

    .filter(Boolean);

}

async function bulkMarkPacked(btn) {
  const selectedOrders = getSelectedOrderIds();

  if (!selectedOrders.length) {
    showToast(
      "Select orders first.",
      "error"
    );

    return;
  }

  try {
    setButtonLoading(
      btn,
      `Packing ${selectedOrders.length} order(s)...`
    );

    let successCount = 0;
    let failedCount = 0;

    const results = await Promise.allSettled(
      selectedOrders.map(async orderId => {

        const response = await adminFetchWithFallback(
          "/api/orders/update",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              orderId,
              order_status: "Packed",
              packed_at: new Date().toISOString()
            })
          }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.message || `Failed to pack ${orderId}`
          );
        }

        return result.order;
      })
    );

    results.forEach(result => {
      if (result.status === "fulfilled") {
        successCount++;

        applyUpdatedOrderLocal(
          result.value
        );

      } else {
        failedCount++;

        console.error(
          "Bulk pack failed:",
          result.reason
        );
      }
    });

    if (successCount > 0) {
      await showSuccessModal(
        "Bulk Pack Complete",
        `${successCount} order(s) were successfully marked as Packed.`
      );
    }

    if (failedCount > 0) {
      showToast(
        `${failedCount} order(s) failed to update.`,
        "error"
      );
    }


  } finally {
    resetButtonLoading(btn);
  }
}

async function markOrderPacked(orderId, btn) {
  try {
    const order = adminOrders.find(o =>
      String(o.external_id || o.id) === String(orderId)
    );

    if (!order) {
      showToast("Order not found", "error");
      return;
    }

    const currentStatus =
      String(order.order_status || "");

    if (currentStatus !== "Processing") {
      showToast(
        "Processing orders only can be marked as Packed.",
        "error"
      );
      return;
    }

    setButtonLoading(btn, "Packing...");

    const response = await adminFetchWithFallback(
      "/api/orders/update",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          orderId,
          order_status: "Completed",
          picked_up_at: new Date().toISOString()
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message ||
        "Failed to mark order as Packed"
      );
    }

    await showSuccessModal(
      "Order Packed",
      "The order was successfully marked as Packed."
    );

    closeOrderModal();
    applyUpdatedOrderLocal(result.order);

  } catch (error) {
    console.error(
      "Mark packed error:",
      error
    );

    showToast(
      error.message ||
      "Mark packed server error",
      "error"
    );

  } finally {
    resetButtonLoading(btn);
  }
}

async function markOrderShipped(orderId, btn) {
  try {

    const order = adminOrders.find(o =>
      String(o.external_id || o.id) === String(orderId)
    );

    if (!order) {
      showToast("Order not found", "error");
      return;
    }

    const paymentStatus = String(
      order.payment_status ||
      order.status ||
      ""
    ).toUpperCase();

    const isCOD =
      paymentStatus.includes("COD");

    const isPaid =
      paymentStatus === "PAID";

    const isSkyroApproved =
      String(order.payment_method || "")
        .toUpperCase()
        .includes("SKYRO") &&
      String(order.order_status || "")
        .toUpperCase() === "SKYRO APPROVED";

    if (!isCOD && !isPaid && !isSkyroApproved) {
      showToast(
        "Only COD or PAID orders can be marked shipped.",
        "error"
      );
      return;
    }

    setButtonLoading(btn, "Updating...");

    const res = await adminFetchWithFallback(
      "/api/orders/update",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          order_status: "Shipped"
        })
      }
    );

    const result = await res.json();

    if (!result.success) {
      showToast(result.message || "Failed to mark shipped", "error");
      return;
    }

    await showSuccessModal(
      "Order Shipped",
      "The order was successfully marked as Shipped."
    );

    closeOrderModal();
    applyUpdatedOrderLocal(result.order);

  } catch (err) {
    console.error(err);
    showToast("Mark shipped server error", "error");

  } finally {
    resetButtonLoading(btn);
  }
}

async function markOrderInTransit(orderId, btn) {
  await forceUpdateOrderStatus(orderId, "In Transit", btn);
}

async function markOrderFailed(orderId, btn) {
  await forceUpdateOrderStatus(orderId, "Failed Delivery", btn);
}

async function markOrderDelivered(orderId, btn) {
  try {

    setButtonLoading(btn, "Updating...");

    const res = await adminFetchWithFallback(
      "/api/orders/update",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          order_status: "Delivered",
          delivered_at: new Date().toISOString()
        })
      }
    );

    const result = await res.json();

    if (!result.success) {
      showToast(result.message || "Failed to mark delivered", "error");
      return;
    }

    closeOrderModal();
    applyUpdatedOrderLocal(result.order);

    await showSuccessModal(
      "Order Delivered",
      "The order was successfully marked as Delivered."
    );

  } catch (err) {
    console.error(err);
    showToast("Mark delivered server error", "error");
  } finally {
    resetButtonLoading(btn);
  }
}

async function forceUpdateOrderStatus(orderId, status, btn) {
  try {

    const allOrders = [
      ...adminOrders,
      ...storePickupOrders,
      ...roroOrders
    ];

    const order = allOrders.find(o =>
      String(o.external_id || o.id) === String(orderId)
    );

    if (!order) {
      showToast("Order not found", "error");
      return;
    }

    const paymentStatus = String(
      order.payment_status ||
      order.status ||
      ""
    ).toUpperCase();

    const isCOD =
      paymentStatus.includes("COD");

    const isPaid =
      paymentStatus === "PAID";

    const isSkyroApproved =
      String(order.payment_method || "")
        .toUpperCase()
        .includes("SKYRO") &&
      String(order.order_status || "")
        .toUpperCase() === "SKYRO APPROVED";

    if (!isCOD && !isPaid && !isSkyroApproved) {

      showToast(
        "Only COD or PAID orders can update status.",
        "error"
      );

      return;
    }

    setButtonLoading(btn, "Updating...");

    const res = await adminFetchWithFallback(
      "/api/orders/update",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          order_status: status
        })
      }
    );

    const result = await res.json();

    if (!result.success) {
      showToast(result.message || "Failed to update order", "error");
      return;
    }

    closeOrderModal();
    applyUpdatedOrderLocal(result.order);

    await showSuccessModal(
      "Order Status Updated",
      `The order was successfully marked as ${status}.`
    );

  } catch (err) {
    console.error(err);
    showToast("Order update server error", "error");

  } finally {
    resetButtonLoading(btn);
  }
}

async function bulkArrangeShipment() {

  const selectedOrders =
    getSelectedOrderIds();

  if (!selectedOrders.length) {

    showToast(
      "Select orders first.",
      "error"
    );

    return;
  }

  for (const orderId of selectedOrders) {

    await arrangeShipment(orderId);
  }

  await showSuccessModal(
    "Bulk Shipment Complete",
    "The selected orders were successfully processed for shipment."
  );

}

/* ===============================
   GLOBALS
================================ */
window.confirmSkyroStock = confirmSkyroStock;
window.markOrderPacked = markOrderPacked;
window.handleOrderRequestAction = handleOrderRequestAction;
window.approveOrderRequest = approveOrderRequest;
window.rejectOrderRequest = rejectOrderRequest;
window.updateOrderRequestStatus = updateOrderRequestStatus;
window.bulkMarkPacked = bulkMarkPacked;
window.markOrderShipped = markOrderShipped;
window.bulkArrangeShipment = bulkArrangeShipment;
window.loadAdminOrders = loadAdminOrders;
window.loadCancelledOrders = loadCancelledOrders;
window.undoCancelledOrder = undoCancelledOrder;
window.permanentDeleteOrder = permanentDeleteOrder;
window.openOrderModal = openOrderModal;
window.closeOrderModal = closeOrderModal;
window.cancelOrder = cancelOrder;
window.createSPXShipment = createSPXShipment;
window.bookLalamoveShipment = bookLalamoveShipment;
window.arrangeShipment = arrangeShipment;
window.refreshSkyroStatus = refreshSkyroStatus;
window.openAWB = openAWB;
window.printOrderInvoice = printOrderInvoice;
window.openTracking = openTracking;
window.toggleShowAllOrderItems = toggleShowAllOrderItems;
window.toggleOrderSummary = toggleOrderSummary;
window.changeOrdersPage = changeOrdersPage;
window.markOrderInTransit = markOrderInTransit;
window.markOrderFailed = markOrderFailed;
window.markOrderDelivered = markOrderDelivered;

/* ===============================
   INIT
================================ */

document
  .querySelectorAll(".order-period-btn")
  .forEach(button => {

    button.addEventListener("click", () => {

      document
        .querySelectorAll(".order-period-btn")
        .forEach(btn =>
          btn.classList.remove("active")
        );

      button.classList.add("active");

      currentOrderPeriod =
        button.dataset.period || "daily";

      currentOrdersPage = 1;

      loadAdminOrders();

    });

  });

document
  .querySelectorAll(".order-filter-btn")

  .forEach(button => {

    button.addEventListener("click", () => {

      document
        .querySelectorAll(".order-filter-btn")

        .forEach(btn =>
          btn.classList.remove("active")
        );

      button.classList.add("active");

      currentOrderFilter =
        button.dataset.filter;
      currentOrdersPage = 1;
      loadAdminOrders();

    });

  });

let ordersRealtimeChannel = null;

function subscribeToOrderUpdates() {
  if (
    typeof supabaseClient === "undefined" ||
    !supabaseClient
  ) {
    console.error(
      "Supabase client not available for realtime orders."
    );
    return;
  }

  if (ordersRealtimeChannel) {
    supabaseClient.removeChannel(
      ordersRealtimeChannel
    );
  }

  ordersRealtimeChannel =
    supabaseClient
      .channel("admin-orders-realtime")

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders"
        },
        async payload => {
          console.log(
            "ORDER REALTIME UPDATE:",
            payload
          );

          if (
            payload.eventType === "INSERT" ||
            payload.eventType === "UPDATE"
          ) {
            await loadAdminOrders();
          }

          const newStatus =
            String(
              payload.new?.order_status || ""
            )
              .trim()
              .toLowerCase();

          if (
            payload.eventType === "DELETE" ||
            newStatus === "cancelled"
          ) {
            await loadCancelledOrders();
          }
        }
      )

      .subscribe(status => {
        console.log(
          "ORDERS REALTIME STATUS:",
          status
        );
      });
}

loadAdminOrders();
subscribeToOrderUpdates();

setTimeout(() => {
  loadCancelledOrders();
}, 1000);

