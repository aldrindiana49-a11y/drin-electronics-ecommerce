require("dotenv").config(); // ✅ DAPAT NASA UNANG LINE

const {
  spxPost,
  verifyAccount,
  checkShippingFee,
  createOrder,
  getCreateResult,
  getAWB,
  verifyWebhookSignature
} = require("./services/spxService");

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const CryptoJS = require("crypto-js");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const app = express();

app.use(cors());

app.use(express.json({
  verify: (req, res, buffer) => {
    req.rawBody = buffer.toString("utf8");
  }
}));

const PORT = process.env.PORT || 3000;

const SKYRO_API_BASE_URL = "https://online-api.skyro.ph";

let cachedSkyroAccessToken = "";
let cachedSkyroTokenExpiresAt = 0;

async function getSkyroAccessToken() {
  const now = Date.now();

  // Reuse token habang valid pa, with 60-second safety allowance.
  if (
    cachedSkyroAccessToken &&
    now < cachedSkyroTokenExpiresAt - 60000
  ) {
    return cachedSkyroAccessToken;
  }

  const clientId = process.env.SKYRO_CLIENT_ID;
  const clientSecret = process.env.SKYRO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing SKYRO_CLIENT_ID or SKYRO_CLIENT_SECRET environment variable."
    );
  }

  const formData = new URLSearchParams();

  formData.append("client_id", clientId);
  formData.append("client_secret", clientSecret);
  formData.append("grant_type", "client_credentials");

  const response = await axios.post(
    `${SKYRO_API_BASE_URL}/realms/merchants/protocol/openid-connect/token`,
    formData.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeout: 15000
    }
  );

  const accessToken = response.data?.access_token;
  const expiresIn = Number(response.data?.expires_in || 3600);

  if (!accessToken) {
    throw new Error("Skyro did not return an access token.");
  }

  cachedSkyroAccessToken = accessToken;
  cachedSkyroTokenExpiresAt =
    Date.now() + expiresIn * 1000;

  return cachedSkyroAccessToken;
}

function generateLalamoveSignature(method, path, body = "") {
  const time = new Date().getTime().toString();

  const rawSignature =
    `${time}\r\n${method}\r\n${path}\r\n\r\n${body}`;

  const signature = CryptoJS
    .HmacSHA256(
      rawSignature,
      process.env.LALAMOVE_SECRET
    )
    .toString();

  return {
    time,
    signature
  };
}

const ORDERS_FILE = path.join(__dirname, "data", "orders.json");

function ensureOrdersFile() {
  const dir = path.dirname(ORDERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");
}

async function readOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("SUPABASE READ ORDERS ERROR:", error);
    return [];
  }

  return data || [];
}

async function saveOrders(orders) {
  for (const order of orders) {
    const { error } = await supabase
      .from("orders")
      .upsert(order, {
        onConflict: "external_id"
      });

    if (error) {
      console.error("SUPABASE SAVE ORDER ERROR:", error);
      throw error;
    }
  }
}

async function savePendingOrder({
  orderId,
  amount,
  subtotal,
  shippingFee,
  serviceFee,
  handlingFee,
  customerName,
  customerPhone,
  customerEmail,
  guestOrder,
  guestTrackingCode,
  items,
  paymentProvider,
  checkoutUrl,
  address,
  parcelInfo,
  courier,
  shippingPaymentMethod,
  shippingCodAmount
}) {
  const now = new Date().toISOString();

  let normalizedItems = [];

  if (Array.isArray(items)) {
    normalizedItems = items;
  } else if (typeof items === "string") {
    try {
      const parsedItems = JSON.parse(items);
      normalizedItems = Array.isArray(parsedItems)
        ? parsedItems
        : [];
    } catch (error) {
      console.error(
        "INVALID ORDER ITEMS JSON:",
        error
      );
    }
  }

  const isStorePickup =
    String(courier || "")
      .trim()
      .toLowerCase()
      .includes("store pickup");

  const orderData = {
    external_id: orderId,

    amount: Number(amount),

    subtotal: Number(
      subtotal || amount || 0
    ),

    shipping_fee: Number(
      shippingFee || 0
    ),

    shipping_payment_method:
      shippingPaymentMethod || "",

    shipping_cod_amount: Number(
      shippingCodAmount || 0
    ),

    service_fee: Number(
      serviceFee ??
      handlingFee ??
      0
    ),

    customer_name:
      customerName || "Customer",

    customer_phone:
      customerPhone || "",

    customer_email:
      customerEmail || "",

    guest_order:
      guestOrder === true,

    guest_tracking_code:
      guestTrackingCode || "",

    address:
      address || {},

    parcel_info:
      parcelInfo || {},

    items:
      normalizedItems,

    payment_provider:
      paymentProvider,

    courier:
      courier || "",

    checkout_url:
      checkoutUrl || "",

    status:
      paymentProvider === "COD"
        ? "COD"
        : paymentProvider === "SKYRO"
          ? "Pending Skyro Approval"
          : "Pending Payment",

    payment_status:
      isStorePickup
        ? "Pending Payment"
        : paymentProvider === "COD"
          ? "COD"
          : paymentProvider === "SKYRO"
            ? "Pending Skyro Approval"
            : "Pending Payment",

    order_status:
      isStorePickup
        ? "Pending Payment"
        : paymentProvider === "COD"
          ? "Pending"
          : paymentProvider === "SKYRO"
            ? "Pending Stock Confirmation"
            : "Pending Payment",

    updated_at: now
  };

  const {
    data: savedOrder,
    error
  } = await supabase
    .from("orders")
    .upsert(
      orderData,
      {
        onConflict: "external_id"
      }
    )
    .select()
    .single();

  if (error) {
    console.error(
      "SAVE PENDING ORDER ERROR:",
      error
    );

    throw error;
  }

  return savedOrder;
}

async function reserveXenditStock(order) {

  if (!order || order.stock_reserved) return order;

  for (const item of order.items || []) {

    const finalProductId =
      item.productId ||
      item.product_id ||
      item.productID ||
      item.id;

    const finalVariantLabel =
      item.variantLabel ||
      item.variant ||
      item.variation ||
      item.variant_name ||
      item.variantName ||
      item.option ||
      item.label ||
      "Default";

    const finalQuantity = Number(
      item.quantity ||
      item.qty ||
      item.quantityOrdered ||
      1
    );

    console.log("STOCK DEBUG RESERVE:", {
      orderId: order.external_id || order.id,
      finalProductId,
      finalVariantLabel,
      finalQuantity,
      item
    });

    const { error } = await supabase.rpc("deduct_stock", {
      p_product_id: finalProductId,
      p_variant_label: finalVariantLabel,
      p_quantity: finalQuantity,
      p_order_id: String(order.external_id || order.id)
    });

    if (error) throw error;
  }

  order.stock_reserved = true;
  order.stock_restored = false;
  order.stock_reserved_at = new Date().toISOString();
  order.updated_at = new Date().toISOString();

  return order;
}

async function restoreXenditStock(order) {
  if (!order || order.stock_restored) return order;

  for (const item of order.items || []) {

    const finalProductId =
      item.productId ||
      item.product_id ||
      item.productID ||
      item.id;

    const finalVariantLabel =
      item.variantLabel ||
      item.variant ||
      item.variation ||
      item.variant_name ||
      item.variantName ||
      item.option ||
      item.label ||
      "Default";

    const finalQuantity = Number(
      item.quantity ||
      item.qty ||
      item.quantityOrdered ||
      1
    );

    console.log("STOCK DEBUG RESTORE:", {
      orderId: order.external_id || order.id,
      finalProductId,
      finalVariantLabel,
      finalQuantity,
      item
    });

    const { error } = await supabase.rpc("restore_stock", {
      p_product_id: finalProductId,
      p_variant_label: finalVariantLabel,
      p_quantity: finalQuantity,
      p_order_id: String(order.external_id || order.id)
    });

    if (error) throw error;
  }

  order.stock_reserved = false;
  order.stock_restored = true;
  order.stock_restored_at = new Date().toISOString();
  order.updated_at = new Date().toISOString();

  return order;
}


// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🔥 Server Running");
});

// ================= SPX WEBHOOK HELPERS =================

function mapSpxStatus(statusCode, statusText = "") {
  const code = String(statusCode || "").trim();

  const text = String(statusText || "")
    .trim()
    .toLowerCase();

  if (code === "1001") {
    return {
      shipping_status: "PENDING_PICKUP",
      order_status: "Processing"
    };
  }

  if (code === "2001") {
    return {
      shipping_status: "IN_TRANSIT",
      order_status: "In Transit"
    };
  }

  if (code === "5001") {
    return {
      shipping_status: "PICKUP_FAILED",
      order_status: "Processing"
    };
  }

  if (
    text === "delivered" ||
    text.includes("successfully delivered") ||
    text.includes("parcel delivered")
  ) {
    return {
      shipping_status: "DELIVERED",
      order_status: "Delivered"
    };
  }

  if (
    text.includes("delivery failed") ||
    text.includes("failed delivery") ||
    text.includes("unsuccessful delivery")
  ) {
    return {
      shipping_status: "DELIVERY_FAILED",
      order_status: "Failed Delivery"
    };
  }

  if (
    text.includes("in transit") ||
    text.includes("delivering") ||
    text.includes("out for delivery") ||
    text.includes("on hold") ||
    text.includes("delayed") ||
    text.includes("delivery hub") ||
    text.includes("sorting hub")
  ) {
    return {
      shipping_status: "IN_TRANSIT",
      order_status: "In Transit"
    };
  }

  if (text.includes("cancel")) {
    return {
      shipping_status: "CANCELLED",
      order_status: "Cancelled"
    };
  }

  if (
    text.includes("return") ||
    text.includes("rts")
  ) {
    return {
      shipping_status: "RETURNING",
      order_status: "Returning"
    };
  }

  return {
    shipping_status:
      String(statusText || statusCode || "UNKNOWN")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_"),

    order_status: "In Transit"
  };
}


async function processSpxTrackingWebhook(data) {
  try {
    console.log(
      "SPX TRACKING WEBHOOK PROCESSING:",
      data
    );

    const orderId =
      data.order_id ||
      data.customer_order_id;

    const trackingNo =
      data.tracking_no || "";

    let orders = await readOrders();

    let index = -1;

    if (orderId) {
      index = orders.findIndex(order =>
        String(order.spx_order_id || "") === String(orderId) ||
        String(order.external_id || order.id) === String(orderId)
      );
    }

    if (
      index === -1 &&
      trackingNo
    ) {
      index = orders.findIndex(order =>
        String(order.tracking_number || "") ===
        String(trackingNo)
      );
    }

    if (index === -1) {
      console.error(
        "SPX WEBHOOK ORDER NOT FOUND:",
        {
          orderId,
          trackingNo
        }
      );

      return;
    }

    const mapped = mapSpxStatus(
      data.status_code,
      data.status
    );

    const now =
      new Date().toISOString();

    orders[index].courier = "SPX";

    if (trackingNo) {
      orders[index].tracking_number =
        trackingNo;
    }

    if (data.tracking_link) {
      orders[index].tracking_link =
        data.tracking_link;
    }

    const currentOrderStatus =
      String(orders[index].order_status || "")
        .trim()
        .toLowerCase();

    const alreadyDelivered =
      currentOrderStatus === "delivered";

    if (!alreadyDelivered || mapped.order_status === "Delivered") {
      orders[index].shipping_status =
        mapped.shipping_status;

      orders[index].order_status =
        mapped.order_status;
    }

    if (
      data.actual_shipping_fee !== undefined &&
      data.actual_shipping_fee !== null
    ) {
      orders[index].shipping_fee =
        Number(data.actual_shipping_fee);
    }

    if (
      mapped.order_status === "Delivered"
    ) {
      orders[index].delivered_at =
        orders[index].delivered_at || now;
    }

    orders[index].updated_at = now;

    await saveOrders(orders);

    console.log(
      "SPX ORDER UPDATED:",
      {
        orderId:
          orders[index].external_id ||
          orders[index].id,

        shippingStatus:
          orders[index].shipping_status,

        orderStatus:
          orders[index].order_status
      }
    );

  } catch (error) {
    console.error(
      "SPX TRACKING WEBHOOK PROCESS ERROR:",
      error
    );
  }
}


// ================= SPX TRACKING WEBHOOK =================

app.post(
  "/api/spx/webhook",
  (req, res) => {

    try {
      const checkSign =
        req.headers["check-sign"];

      const timestamp =
        req.headers["timestamp"];

      const randomNum =
        req.headers["random-num"];

      const payloadString =
        req.rawBody ||
        JSON.stringify(req.body || {});

      const validSignature =
        verifyWebhookSignature({
          timestamp,
          randomNum,
          payloadString,
          checkSign
        });

      if (!validSignature) {
        console.error(
          "SPX WEBHOOK INVALID SIGNATURE",
          {
            timestamp,
            randomNum
          }
        );

        return res
          .status(401)
          .json({
            success: false,
            message:
              "Invalid SPX webhook signature"
          });
      }

      const data = req.body || {};

      console.log(
        "SPX WEBHOOK RECEIVED:",
        data
      );

      /*
        Important:
        SPX requires HTTP 200 quickly.
        Respond first, process after.
      */
      res.status(200).json({
        success: true,
        message: "SPX webhook received"
      });

      setImmediate(() => {
        processSpxTrackingWebhook(data);
      });

    } catch (error) {
      console.error(
        "SPX WEBHOOK ERROR:",
        error
      );

      if (!res.headersSent) {
        return res
          .status(500)
          .json({
            success: false,
            message:
              "SPX webhook error"
          });
      }
    }
  }
);

// ================= SPX EP WEBHOOK PROCESSOR =================

async function processSpxEPWebhook(data) {
  try {
    console.log(
      "SPX EP WEBHOOK PROCESSING:",
      data
    );

    const orderId =
      data.customer_order_id ||
      data.order_id;

    const trackingNo =
      data.tracking_no || "";

    let orders = await readOrders();

    let index = -1;

    if (orderId) {
      index = orders.findIndex(order =>
        String(order.spx_order_id || "") === String(orderId) ||
        String(order.external_id || order.id) === String(orderId)
      );
    }

    if (
      index === -1 &&
      trackingNo
    ) {
      index = orders.findIndex(order =>
        String(order.tracking_number || "") ===
        String(trackingNo)
      );
    }

    if (index === -1) {
      console.error(
        "SPX EP ORDER NOT FOUND:",
        {
          orderId,
          trackingNo
        }
      );

      return;
    }

    const now =
      new Date().toISOString();

    orders[index].courier = "SPX";

    if (trackingNo) {
      orders[index].tracking_number =
        trackingNo;
    }

    orders[index].spx_epod_list =
      Array.isArray(data.epod_list)
        ? data.epod_list
        : [];

    orders[index].spx_epop_list =
      Array.isArray(data.epop_list)
        ? data.epop_list
        : [];

    orders[index].spx_epor_list =
      Array.isArray(data.epor_list)
        ? data.epor_list
        : [];

    orders[index].spx_epooh_list =
      Array.isArray(data.epooh_list)
        ? data.epooh_list
        : [];

    orders[index].spx_ep_last_id =
      data.id || "";

    orders[index].spx_ep_tracking_code_name =
      data.tracking_code_name || "";

    const epStatus = String(
      data.status ||
      data.tracking_code_name ||
      ""
    ).trim().toLowerCase();

    const epStatusCode = String(
      data.status_code_name ||
      ""
    ).trim();

    if (
      epStatus === "delivered" ||
      epStatus.includes("delivered") ||
      epStatusCode === "4001"
    ) {
      orders[index].shipping_status = "DELIVERED";
      orders[index].order_status = "Delivered";

      orders[index].delivered_at =
        orders[index].delivered_at || now;
    }

    orders[index].spx_ep_status_code_name =
      data.status_code_name || "";

    orders[index].spx_ep_updated_at =
      now;

    orders[index].updated_at =
      now;

    await saveOrders(orders);

    console.log(
      "SPX EP UPDATED:",
      {
        orderId:
          orders[index].external_id ||
          orders[index].id,

        epodCount:
          orders[index].spx_epod_list.length,

        epopCount:
          orders[index].spx_epop_list.length,

        eporCount:
          orders[index].spx_epor_list.length,

        epoohCount:
          orders[index].spx_epooh_list.length
      }
    );

  } catch (error) {
    console.error(
      "SPX EP WEBHOOK PROCESS ERROR:",
      error
    );
  }
}


// ================= SPX EP WEBHOOK =================

app.post(
  "/api/spx/ep-webhook",
  (req, res) => {

    try {
      const checkSign =
        req.headers["check-sign"];

      const timestamp =
        req.headers["timestamp"];

      const randomNum =
        req.headers["random-num"];

      const payloadString =
        req.rawBody ||
        JSON.stringify(req.body || {});

      const validSignature =
        verifyWebhookSignature({
          timestamp,
          randomNum,
          payloadString,
          checkSign
        });

      if (!validSignature) {
        console.error(
          "SPX EP WEBHOOK INVALID SIGNATURE"
        );

        return res
          .status(401)
          .json({
            success: false,
            message:
              "Invalid SPX EP webhook signature"
          });
      }

      const data =
        req.body || {};

      console.log(
        "SPX EP WEBHOOK RECEIVED:",
        data
      );

      /*
        SPX requires fast HTTP 200.
      */
      res.status(200).json({
        success: true,
        message:
          "SPX EP webhook received"
      });

      setImmediate(() => {
        processSpxEPWebhook(data);
      });

    } catch (error) {
      console.error(
        "SPX EP WEBHOOK ERROR:",
        error
      );

      if (!res.headersSent) {
        return res
          .status(500)
          .json({
            success: false,
            message:
              "SPX EP webhook error"
          });
      }
    }
  }
);

// ================= SPX CREATE ACCOUNT =================
app.post("/api/spx/create-account", async (req, res) => {
  try {
    const { phone, email } = req.body;

    const result = await spxPost("/open/api/v1/account/create", {
      phone,
      email
    });

    res.json(result);

  } catch (err) {
    console.error("SPX CREATE ACCOUNT ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      message: "SPX create account failed",
      error: err.response?.data || err.message
    });
  }
});

// ================= SPX VERIFY =================
app.get("/api/spx/verify", async (req, res) => {
  try {
    const result = await verifyAccount();
    res.json(result);
  } catch (err) {
    console.error("SPX VERIFY ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      message: "SPX verify failed",
      error: err.response?.data || err.message
    });
  }
});

// ================= SPX ADDRESS DOWNLOAD URL =================
app.post("/api/spx/address-download-url", async (req, res) => {
  try {
    const result = await spxPost("/open/api/address/get_address_download_url", {});
    res.json(result);
  } catch (err) {
    console.error("SPX ADDRESS URL ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      message: "SPX address download URL failed",
      error: err.response?.data || err.message
    });
  }
});


// ================= SPX CHECK SHIPPING FEE =================

app.post("/api/spx/check-shipping-fee", async (req, res) => {
  try {
    const { amount, paymentMethod, address, parcelInfo, voucherCode, baseInfo, base_info } = req.body;

    const result = await checkShippingFee({
      amount,
      paymentMethod,
      address,
      parcelInfo,
      voucherCode,
      baseInfo: baseInfo || base_info
    });

    if (result.ret_code !== 0) {
      return res.status(400).json({
        success: false,
        message: result.message || "SPX shipping fee check failed",
        spx: result
      });
    }

    const orderFee = result?.data?.orders?.[0];
    const fail = result?.data?.fail_list?.[0];

    if (!orderFee) {
      return res.status(400).json({
        success: false,
        message: fail?.debug_msg || fail?.message || "SPX could not calculate shipping fee",
        spx: result
      });
    }

    res.json({
      success: true,
      shippingFee: Number(orderFee.estimated_shipping_fee || 0),
      basicShippingFee: Number(orderFee.basic_shipping_fee || 0),
      codServiceFee: Number(orderFee.cod_service_fee || 0),
      insuranceServiceFee: Number(orderFee.insurance_service_fee || 0),
      voucherShippingFee: Number(orderFee.voucher_shipping_fee || 0),
      edtMin: orderFee.edt_min,
      edtMax: orderFee.edt_max,
      spx: result
    });
  } catch (err) {
    console.error("SPX CHECK SHIPPING FEE ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      message: "SPX shipping fee check failed",
      error: err.response?.data || err.message
    });
  }
});


// ================= SPX CREATE ORDER =================
app.post("/api/spx/create", async (req, res) => {
  try {
    const order = req.body;

    const result = await createOrder(order);

    res.json(result);
  } catch (err) {
    console.error("SPX CREATE ORDER ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      message: "SPX create order failed",
      error: err.response?.data || err.message
    });
  }
});

// ================= SPX GET CREATE RESULT =================
app.post("/api/spx/result", async (req, res) => {
  try {
    const { batchNo } = req.body;

    const result = await getCreateResult(batchNo);

    res.json(result);
  } catch (err) {
    console.error("SPX GET RESULT ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      message: "SPX get result failed",
      error: err.response?.data || err.message
    });
  }
});

// ================= SPX GET AWB =================
app.post("/api/spx/awb", async (req, res) => {
  try {
    const { batchNo } = req.body;

    const result = await getAWB(batchNo);

    res.json(result);
  } catch (err) {
    console.error("SPX AWB ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      message: "SPX get AWB failed",
      error: err.response?.data || err.message
    });
  }
});

// ================= SPX CREATE + SAVE TRACKING + AWB =================
app.post("/api/orders/:orderId/spx-create", async (req, res) => {
  try {
    const { orderId } = req.params;

    let orders = await readOrders();
    const index = orders.findIndex(
      order => String(order.external_id) === String(orderId)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const order = orders[index];

    // Prevent duplicate SPX shipment kapag may tracking na.
    if (order.tracking_number) {
      return res.json({
        success: true,
        alreadyCreated: true,
        message: "SPX shipment already exists",
        order
      });
    }

    // Gumawa ng hiwalay at unique na ID para sa SPX.
    const spxOrderId =
      `SPX-${String(order.external_id).replace(/^ORD-/, "")}`;

    const savedAddress = order.address || {};

    const savedParcel = order.parcel_info || {};

    const isSkyroShippingCod =
      String(order.payment_provider || "")
        .trim()
        .toUpperCase() === "SKYRO" &&
      String(order.shipping_payment_method || "")
        .trim()
        .toUpperCase() === "COD";

    const spxPaymentMethod =
      order.payment_provider === "COD" ||
        isSkyroShippingCod
        ? "COD"
        : "PAID";

    const spxTotalAmount =
      isSkyroShippingCod
        ? Number(
          order.shipping_cod_amount ||
          order.shipping_fee ||
          0
        )
        : Number(order.amount || 0);

    const spxPayload = {

      _id: spxOrderId,

      paymentMethod: spxPaymentMethod,

      totalAmount: spxTotalAmount,

      declaredValue: Number(
        order.subtotal ||
        order.amount ||
        0
      ),

      customerName: order.customer_name,

      phone: order.customer_phone || "639123456789",
      address: savedAddress,

      deliverState: savedAddress.province || "Metro Manila",
      deliverCity: savedAddress.city || "Metro Manila",
      deliverDistrict: savedAddress.barangay || "Intramuros",
      deliverStreet: savedAddress.barangay || "Barangay 654",
      deliverPostCode: savedAddress.postCode || savedAddress.zipCode || "1002",

      parcelWeight: savedParcel.parcelWeight || 1,
      parcelLength: savedParcel.parcelLength || 10,
      parcelWidth: savedParcel.parcelWidth || 10,
      parcelHeight: savedParcel.parcelHeight || 10,
      parcelItemName: savedParcel.itemName || "Electronics",
      parcelItemQuantity: savedParcel.itemQuantity || (order.items?.length || 1),
      parcelItemType: savedParcel.itemType || "Electronics",

      items: order.items || [{ name: "Electronics" }]
    };

    const createResult = await createOrder(spxPayload);

    if (createResult.ret_code !== 0) {
      return res.status(400).json({
        success: false,
        message: "SPX create order failed",
        spx: createResult
      });
    }

    const batchNo = createResult.data.batch_no;

    // Wait a little before getting result
    await new Promise(resolve => setTimeout(resolve, 3000));

    const result = await getCreateResult(batchNo);

    console.log(
      "SPX CREATE RESULT FULL:",
      JSON.stringify(result, null, 2)
    );

    if (result.data?.success_count < 1) {
      orders[index].spx_batch_no = batchNo;
      orders[index].shipping_status = "SPX_FAILED";
      orders[index].spx_error = result.data?.fail_list?.[0]?.message || "SPX failed";
      orders[index].updated_at = new Date().toISOString();

      await saveOrders([orders[index]]);

      return res.status(400).json({
        success: false,
        message: "SPX order failed",
        batchNo,
        spx: result
      });
    }

    const spxOrder = result.data.orders[0];

    const awb = await getAWB(batchNo);

    orders[index].courier = "SPX";
    orders[index].spx_order_id = spxOrderId;
    orders[index].spx_batch_no = batchNo;
    orders[index].tracking_number = spxOrder.tracking_no;
    orders[index].tracking_link = spxOrder.tracking_link || spxOrder.tracking_no_link;
    orders[index].awb_link = awb.data?.awb_link || "";
    orders[index].shipping_fee = spxOrder.estimated_shipping_fee || 0;
    orders[index].shipping_status = "PENDING_PICKUP";
    orders[index].order_status = "Processing";
    orders[index].updated_at = new Date().toISOString();

    await saveOrders([orders[index]]);

    res.json({
      success: true,
      message: "SPX shipment created",
      order: orders[index]
    });

  } catch (err) {
    console.error("SPX SAVE ORDER ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      message: "SPX shipment failed",
      error: err.response?.data || err.message
    });
  }
});

// ================= SKYRO ORDER SAVE =================
app.post("/api/orders/skyro", async (req, res) => {
  try {
    const {
      orderId,
      amount,
      subtotal,
      shippingFee,
      serviceFee,
      handlingFee,
      customerName,
      customerPhone,
      customerEmail,
      guestOrder,
      guestTrackingCode,
      items,
      address,
      parcelInfo,
      courier,
      shippingPaymentMethod,
      shippingCodAmount
    } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Missing order ID."
      });
    }

    let order = await savePendingOrder({
      orderId,
      amount,
      subtotal,
      shippingFee,
      serviceFee,
      handlingFee,
      customerName,
      customerPhone,
      customerEmail,
      guestOrder,
      guestTrackingCode,
      items,
      paymentProvider: "SKYRO",
      checkoutUrl: "",
      address,
      parcelInfo,
      courier,
      shippingPaymentMethod,
      shippingCodAmount
    });

    await saveOrders([order]);

    return res.json({
      success: true,
      message: "Skyro order saved successfully.",
      order
    });

  } catch (error) {
    console.error(
      "SKYRO ORDER SAVE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Skyro order save failed.",
      error: error.message
    });
  }
});

// ================= COD ORDER SAVE =================
app.post("/api/orders/cod", async (req, res) => {
  try {
    const {
      orderId,
      amount,
      subtotal,
      shippingFee,
      serviceFee,
      handlingFee,
      customerName,
      customerPhone,
      customerEmail,
      guestOrder,
      guestTrackingCode,
      items,
      address,
      parcelInfo,
      courier
    } = req.body;

    const order = await savePendingOrder({
      orderId,
      amount,
      subtotal,
      shippingFee,
      serviceFee,
      handlingFee,
      customerName,
      customerPhone,
      customerEmail,
      guestOrder,
      guestTrackingCode,
      items,
      paymentProvider: "COD",
      checkoutUrl: "",
      address,
      parcelInfo,
      courier
    });

    return res.json({
      success: true,
      order
    });

  } catch (err) {
    console.error(
      "COD ORDER SAVE ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "COD order save failed"
    });
  }
});

// ================= SKYRO CREATE APPLICATION =================
app.post("/api/orders/:orderId/skyro-create", async (req, res) => {
  try {
    const { orderId } = req.params;

    const orders = await readOrders();

    const orderIndex = orders.findIndex(order =>
      String(order.external_id || order.id) === String(orderId)
    );

    if (orderIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Order not found."
      });
    }

    const order = orders[orderIndex];

    const paymentMethod = String(
      order.payment_method ||
      order.payment_provider ||
      order.paymentMethod ||
      ""
    )
      .trim()
      .toUpperCase();

    if (!paymentMethod.includes("SKYRO")) {
      return res.status(400).json({
        success: false,
        message: "This is not a Skyro order."
      });
    }

    const currentStatus = String(
      order.order_status || ""
    ).trim();

    const allowedStockConfirmationStatuses = [
      "Pending Stock Confirmation",
      "Pending",
      "Pending Skyro Application"
    ];

    if (!allowedStockConfirmationStatuses.includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        message:
          `Skyro application cannot be created from status: ${currentStatus || "empty"}.`
      });
    }

    // Prevent duplicate Skyro applications.
    if (
      order.skyro_order_id &&
      order.skyro_application_link
    ) {
      return res.json({
        success: true,
        alreadyCreated: true,
        message: "Skyro application already exists.",
        skyroOrderId: order.skyro_order_id,
        applicationUrl: order.skyro_application_link
      });
    }

    const orderItems = Array.isArray(order.items)
      ? order.items
      : [];

    if (!orderItems.length) {
      return res.status(400).json({
        success: false,
        message: "No order items found."
      });
    }

    const paymentAmount = Number(
      order.amount ||
      order.total ||
      0
    );

    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid Skyro payment amount."
      });
    }

    const shopId = process.env.SKYRO_SHOP_ID;

    if (!shopId) {
      return res.status(500).json({
        success: false,
        message: "SKYRO_SHOP_ID is missing."
      });
    }

    const accessToken = await getSkyroAccessToken();

    const fullName = String(
      order.customer_name || "Customer"
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const firstName =
      fullName[0] || "Customer";

    const surname =
      fullName.length > 1
        ? fullName[fullName.length - 1]
        : "";

    const middleName =
      fullName.length > 2
        ? fullName.slice(1, -1).join(" ")
        : "";

    const skyroItems = orderItems.map(item => ({
      name:
        item.name ||
        item.product_name ||
        item.title ||
        "Electronics Product",

      quantity: Number(
        item.quantity ||
        item.qty ||
        1
      ),

      price: Number(
        item.price ||
        item.unit_price ||
        item.unitPrice ||
        item.selling_price ||
        0
      ),

      category: "Electronics",

      imageUrl:
        item.variant_image ||
        item.product_image ||
        item.image ||
        ""
    }));

    const skyroPayload = {
      shopId,

      paymentAmount,

      items: skyroItems,

      shopOrderId: String(
        order.external_id || order.id
      ),

      webhookUrl:
        process.env.SKYRO_WEBHOOK_URL,

      successUrl:
        "https://drinelectronicsph.com/home-orders/?skyro=success",

      failUrl:
        "https://drinelectronicsph.com/home-orders/?skyro=failed",

      cancelUrl:
        "https://drinelectronicsph.com/home-orders/?skyro=cancelled",

      customer: {
        phone: String(order.customer_phone || ""),
        email: String(order.customer_email || ""),
        name: firstName,
        surname,
        middleName
      }
    };

    const skyroResponse = await axios.post(
      `${SKYRO_API_BASE_URL}/partners/api/v1/orders`,
      skyroPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    const skyroOrderId =
      skyroResponse.data?.orderId;

    const applicationUrl =
      skyroResponse.data?.orderFormUrl;

    if (!skyroOrderId || !applicationUrl) {
      console.error(
        "Invalid Skyro response:",
        skyroResponse.data
      );

      return res.status(502).json({
        success: false,
        message:
          "Skyro did not return an order ID or application URL."
      });
    }

    orders[orderIndex] = {
      ...order,

      skyro_order_id: skyroOrderId,
      skyro_application_link: applicationUrl,
      skyro_status: "NEW",

      status: "Pending Skyro Approval",
      payment_status: "Pending Skyro Approval",
      order_status: "Skyro Application Allowed",

      skyro_created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await saveOrders(orders);

    return res.json({
      success: true,
      message: "Skyro application created successfully.",
      skyroOrderId,
      applicationUrl,
      order: orders[orderIndex]
    });

  } catch (error) {
    console.error(
      "SKYRO CREATE APPLICATION ERROR:",
      error.response?.data || error.message
    );

    return res
      .status(error.response?.status || 500)
      .json({
        success: false,
        message:
          error.response?.data?.message ||
          "Failed to create Skyro application.",
        error:
          error.response?.data ||
          error.message
      });
  }
});

// ================= SKYRO STATUS HELPER =================
async function getVerifiedSkyroStatus(skyroOrderId) {
  const accessToken = await getSkyroAccessToken();

  const response = await axios.post(
    `${SKYRO_API_BASE_URL}/partners/api/v1/order/status`,
    null,
    {
      params: {
        orderId: skyroOrderId
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      },
      timeout: 15000
    }
  );

  const verifiedOrderId =
    response.data?.orderId;

  const verifiedStatus = String(
    response.data?.status || ""
  )
    .trim()
    .toUpperCase();

  if (!verifiedOrderId || !verifiedStatus) {
    throw new Error(
      "Skyro status verification returned an invalid response."
    );
  }

  return {
    orderId: verifiedOrderId,
    status: verifiedStatus,
    raw: response.data
  };
}

// ================= MANUAL SKYRO STATUS CHECK =================
app.post("/api/orders/:orderId/skyro-status", async (req, res) => {
  try {
    const { orderId } = req.params;

    const orders = await readOrders();

    const orderIndex = orders.findIndex(order =>
      String(order.external_id || order.id) === String(orderId)
    );

    if (orderIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Order not found."
      });
    }

    const order = orders[orderIndex];

    const skyroOrderId = String(
      order.skyro_order_id || ""
    ).trim();

    if (!skyroOrderId) {
      return res.status(400).json({
        success: false,
        message: "Skyro order ID not found."
      });
    }

    const verified =
      await getVerifiedSkyroStatus(skyroOrderId);

    const verifiedStatus =
      String(verified.status || "")
        .trim()
        .toUpperCase();

    const now = new Date().toISOString();

    order.skyro_status = verifiedStatus;
    order.skyro_updated_at = now;
    order.updated_at = now;

    if (verifiedStatus === "NEW") {
      order.status = "Pending Skyro Approval";
      order.payment_status = "Pending Skyro Approval";
      order.order_status = "Skyro Application Allowed";
    }

    if (verifiedStatus === "IN_PROGRESS") {
      order.status = "Pending Skyro Approval";
      order.payment_status = "Pending Skyro Approval";
      order.order_status = "Pending Skyro Approval";
    }

    if (verifiedStatus === "APPROVED") {
      order.status = "Skyro Approved";
      order.payment_status = "Skyro Approved";
      order.order_status = "Skyro Approved";
    }

    if (verifiedStatus === "REJECTED") {
      order.status = "Skyro Application Rejected";
      order.payment_status = "Skyro Application Rejected";
      order.order_status = "Skyro Application Rejected";

      if (order.stock_restored !== true) {
        await restoreXenditStock({
          ...order,
          stock_reserved: true
        });

        order.stock_reserved = false;
        order.stock_restored = true;
        order.stock_restored_at = now;
      }
    }

    if (verifiedStatus === "CANCELLED") {
      order.status = "Skyro Cancelled";
      order.payment_status = "Skyro Cancelled";
      order.order_status = "Cancelled";

      if (order.stock_restored !== true) {
        await restoreXenditStock({
          ...order,
          stock_reserved: true
        });

        order.stock_reserved = false;
        order.stock_restored = true;
        order.stock_restored_at = now;
      }
    }

    if (verifiedStatus === "FINISHED") {
      order.status = "Skyro Finished";
      order.payment_status = "Skyro Finished";
    }

    orders[orderIndex] = order;

    await saveOrders(orders);

    return res.json({
      success: true,
      skyroStatus: verifiedStatus,
      order
    });

  } catch (error) {
    console.error(
      "MANUAL SKYRO STATUS CHECK ERROR:",
      error.response?.data || error.message
    );

    return res.status(
      error.response?.status || 500
    ).json({
      success: false,
      message:
        error.response?.data?.message ||
        "Unable to check Skyro status.",
      error:
        error.response?.data ||
        error.message
    });
  }
});

// ================= SKYRO WEBHOOK =================
app.post("/api/skyro/webhook", async (req, res) => {
  try {
    const webhookData = req.body || {};

    const skyroOrderId = String(
      webhookData.orderId || ""
    ).trim();

    if (!skyroOrderId) {
      return res.status(400).json({
        success: false,
        message: "Missing Skyro orderId."
      });
    }

    const verified =
      await getVerifiedSkyroStatus(skyroOrderId);

    const verifiedStatus =
      verified.status;

    const allowedStatuses = [
      "NEW",
      "IN_PROGRESS",
      "APPROVED",
      "REJECTED",
      "CANCELLED",
      "FINISHED"
    ];

    if (!allowedStatuses.includes(verifiedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Unknown Skyro status.",
        status: verifiedStatus
      });
    }

    const orders = await readOrders();

    const orderIndex = orders.findIndex(order =>
      String(order.skyro_order_id || "") ===
      String(skyroOrderId)
    );

    if (orderIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Local Skyro order not found."
      });
    }

    const order = orders[orderIndex];
    const now = new Date().toISOString();

    order.skyro_status = verifiedStatus;
    order.skyro_updated_at = now;
    order.skyro_raw_webhook = webhookData;
    order.updated_at = now;

    if (verifiedStatus === "NEW") {
      order.status = "Pending Skyro Approval";
      order.payment_status = "Pending Skyro Approval";
      order.order_status = "Skyro Application Allowed";
    }

    if (verifiedStatus === "IN_PROGRESS") {
      order.status = "Pending Skyro Approval";
      order.payment_status = "Pending Skyro Approval";
      order.order_status = "Pending Skyro Approval";
    }

    if (verifiedStatus === "APPROVED") {
      order.status = "Skyro Approved";
      order.payment_status = "Skyro Approved";
      order.order_status = "Skyro Approved";

    }

    if (verifiedStatus === "REJECTED") {
      order.status = "Skyro Application Rejected";
      order.payment_status = "Skyro Application Rejected";
      order.order_status = "Skyro Application Rejected";

      if (order.stock_restored !== true) {
        await restoreXenditStock({
          ...order,
          stock_reserved: true
        });

        order.stock_reserved = false;
        order.stock_restored = true;
        order.stock_restored_at = now;
      }
    }

    if (verifiedStatus === "CANCELLED") {
      order.status = "Skyro Cancelled";
      order.payment_status = "Skyro Cancelled";
      order.order_status = "Cancelled";
      order.skyro_cancelled_at = now;

      if (order.stock_restored !== true) {
        await restoreXenditStock({
          ...order,
          stock_reserved: true
        });

        order.stock_reserved = false;
        order.stock_restored = true;
        order.stock_restored_at = now;
      }
    }

    if (verifiedStatus === "FINISHED") {
      order.status = "Skyro Finished";
      order.payment_status = "Skyro Finished";

    }

    orders[orderIndex] = order;

    await saveOrders(orders);

    return res.status(200).json({
      success: true,
      message: "Skyro webhook verified and processed.",
      skyroOrderId,
      skyroStatus: verifiedStatus,
      localOrderId:
        order.external_id || order.id,
      orderStatus: order.order_status
    });

  } catch (error) {
    console.error(
      "SKYRO WEBHOOK ERROR:",
      error.response?.data || error.message
    );

    return res.status(
      error.response?.status || 500
    ).json({
      success: false,
      message:
        error.response?.data?.message ||
        "Skyro webhook processing failed.",
      error:
        error.response?.data ||
        error.message
    });
  }
});

// ================= XENDIT =================
app.post("/api/create-payment", async (req, res) => {
  try {
    const {
      orderId,
      guestOrder,
      guestTrackingCode,
      amount,
      subtotal,
      shippingFee,
      serviceFee,
      handlingFee,
      customerName,
      customerPhone,
      customerEmail,
      items,
      address,
      parcelInfo,
      courier
    } = req.body;

    const successRedirectUrl =
      guestOrder === true
        ? "https://drinelectronicsph.com/guest-track/?payment=success"
        : "https://drinelectronicsph.com/home-orders/";

    const { data: existingOrder, error: existingOrderError } =
      await supabase
        .from("orders")
        .select("*")
        .eq("external_id", orderId)
        .maybeSingle();

    if (existingOrderError) {
      console.error(
        "XENDIT EXISTING ORDER CHECK ERROR:",
        existingOrderError
      );
    }

    if (
      existingOrder &&
      existingOrder.checkout_url &&
      String(existingOrder.payment_provider || "")
        .toUpperCase() === "XENDIT"
    ) {
      return res.json({
        success: true,
        alreadyCreated: true,
        checkoutUrl: existingOrder.checkout_url,
        order: existingOrder
      });
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 15000);

    let response;

    try {
      response = await fetch(
        "https://api.xendit.co/v2/invoices",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",

            Authorization:
              "Basic " +
              Buffer.from(
                `${process.env.XENDIT_SECRET_KEY}:`
              ).toString("base64")
          },

          body: JSON.stringify({
            external_id: orderId,
            amount: Number(amount),
            currency: "PHP",

            description:
              `Order ${orderId}`,

            customer: {
              given_names:
                customerName || "Customer",

              mobile_number:
                customerPhone || ""
            },

            success_redirect_url:
              successRedirectUrl,

            failure_redirect_url:
              "https://drinelectronicsph.com/Checkout/checkout.html"
          }),

          signal: controller.signal
        }
      );

    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json();

    if (!response.ok || !data.invoice_url) {
      return res.status(400).json({
        success: false,
        message: "Xendit checkout failed.",
        data
      });
    }

    const order = await savePendingOrder({
      orderId,
      amount,
      subtotal,
      shippingFee,
      serviceFee,
      handlingFee,
      customerName,
      customerPhone,
      customerEmail,
      guestOrder,
      guestTrackingCode,
      items,

      paymentProvider: "XENDIT",

      checkoutUrl: data.invoice_url,

      address,
      parcelInfo,
      courier
    });

    return res.json({
      success: true,
      checkoutUrl: data.invoice_url,
      order
    });

  } catch (err) {
    console.error(
      "XENDIT FULL ERROR:",
      {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        stack: err.stack
      }
    );

    if (err.name === "AbortError") {
      return res.status(504).json({
        success: false,
        message:
          "Xendit request timed out. Please try again."
      });
    }

    return res.status(500).json({
      success: false,
      message: "Xendit failed",
      error:
        err.response?.data ||
        err.message
    });
  }
});

// ================= XENDIT PAYMENT RECOVERY =================
app.get("/api/xendit/payment/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("external_id", orderId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (
      order &&
      order.checkout_url &&
      String(order.payment_provider || "")
        .toUpperCase() === "XENDIT"
    ) {
      return res.json({
        success: true,
        found: true,
        checkoutUrl: order.checkout_url,
        order
      });
    }

    return res.json({
      success: true,
      found: false
    });

  } catch (error) {
    console.error(
      "XENDIT PAYMENT RECOVERY ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to recover Xendit payment."
    });
  }
});

// ================= MAYA =================
app.post("/api/create-maya-payment", async (req, res) => {
  try {
    const {
      orderId,
      amount,
      subtotal,
      shippingFee,
      customerName,
      customerPhone,
      items,
      address,
      parcelInfo
    } = req.body;

    const payload = {
      totalAmount: {
        value: Number(amount),
        currency: "PHP"
      },
      buyer: {
        firstName: customerName || "Customer",
        contact: {
          phone: customerPhone || "09000000000"
        }
      },
      redirectUrl: {
        success: "https://drinelectronicsph.com/Home/index.html",
        failure: "https://drinelectronicsph.com/Checkout/checkout.html",
        cancel: "https://drinelectronicsph.com/Checkout/checkout.html"
      },
      requestReferenceNumber: orderId
    };

    const auth = Buffer.from(
      `${process.env.MAYA_PUBLIC_KEY}:${process.env.MAYA_SECRET_KEY}`
    ).toString("base64");

    const response = await fetch("https://pg.maya.ph/checkout/v1/checkouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + auth
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || !data.redirectUrl) {
      return res.status(400).json({
        success: false,
        message: "Maya checkout failed.",
        data
      });
    }

    const order = await savePendingOrder({
      orderId,
      amount,
      customerName,
      customerPhone,
      items,
      paymentProvider: "MAYA",
      address,
      parcelInfo,
      subtotal,
      shippingFee,
      checkoutUrl: data.redirectUrl
    });

    res.json({
      success: true,
      checkoutUrl: data.redirectUrl,
      order
    });
  } catch (err) {
    console.error("MAYA ERROR:", err);
    res.status(500).json({ success: false, message: "Maya failed" });
  }
});

async function autoCompleteDeliveredOrders() {
  try {
    const sevenDaysAgo =
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString();

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("order_status", "Delivered")
      .lte("delivered_at", sevenDaysAgo);

    if (error) {
      console.error(
        "AUTO COMPLETE READ ERROR:",
        error
      );
      return;
    }

    if (!orders?.length) return;

    for (const order of orders) {

      const shippingStatus = String(
        order.shipping_status || ""
      ).toLowerCase();

      const orderStatus = String(
        order.order_status || ""
      ).toLowerCase();

      const hasReturn =
        shippingStatus.includes("return") ||
        shippingStatus.includes("rts") ||
        orderStatus.includes("return") ||
        orderStatus.includes("rts");

      if (hasReturn) {
        continue;
      }

      const { error: updateError } =
        await supabase
          .from("orders")
          .update({
            order_status: "Completed",
            completed_at:
              new Date().toISOString(),
            updated_at:
              new Date().toISOString()
          })
          .eq(
            "external_id",
            order.external_id
          );

      if (updateError) {
        console.error(
          "AUTO COMPLETE UPDATE ERROR:",
          order.external_id,
          updateError
        );
      }
    }

  } catch (error) {
    console.error(
      "AUTO COMPLETE ERROR:",
      error
    );
  }
}

// ================= VIEW ACTIVE ORDERS =================

app.get("/api/orders", async (req, res) => {
  try {
    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(Number(req.query.limit) || 10, 1),
      100
    );

    const period = String(
      req.query.period || ""
    )
      .trim()
      .toLowerCase();

    const filter = String(
      req.query.filter || "all"
    )
      .trim()
      .toLowerCase();

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    /*
      Philippines timezone = UTC+8
      Gumagawa tayo ng PH date boundaries,
      tapos kino-convert sa UTC para sa Supabase.
    */
    const PH_OFFSET_MS =
      8 * 60 * 60 * 1000;

    const now = new Date();

    const oneHourAgoIso =
      new Date(
        Date.now() - 60 * 60 * 1000
      ).toISOString();

    const phNow = new Date(
      now.getTime() + PH_OFFSET_MS
    );

    const year =
      phNow.getUTCFullYear();

    const month =
      phNow.getUTCMonth();

    const day =
      phNow.getUTCDate();

    let startDate = null;
    let endDate = null;

    function phDateToUtc(
      y,
      m,
      d
    ) {
      return new Date(
        Date.UTC(y, m, d, 0, 0, 0) -
        PH_OFFSET_MS
      );
    }

    if (period === "daily") {

      startDate =
        phDateToUtc(
          year,
          month,
          day
        );

      endDate =
        phDateToUtc(
          year,
          month,
          day + 1
        );

    } else if (period === "weekly") {

      endDate = new Date();

      startDate = new Date(
        endDate.getTime() -
        7 * 24 * 60 * 60 * 1000
      );

    } else if (period === "monthly") {

      endDate = new Date();

      startDate = new Date(
        endDate.getTime() -
        30 * 24 * 60 * 60 * 1000
      );

    } else if (period === "yearly") {

      endDate = new Date();

      startDate = new Date(
        endDate.getTime() -
        365 * 24 * 60 * 60 * 1000
      );
    }

    let query = supabase
      .from("orders")
      .select("*", {
        count: "exact"
      })
      .order(
        "created_at",
        { ascending: false }
      );

    if (startDate && endDate) {
      query = query
        .gte(
          "created_at",
          startDate.toISOString()
        )
        .lt(
          "created_at",
          endDate.toISOString()
        );
    }

    if (
      [
        "processing",
        "packed",
        "to ship",
        "shipped",
        "delivered",
        "failed delivery"
      ].includes(filter)
    ) {
      query = query.ilike(
        "order_status",
        filter
      );
    }

    if (filter === "returned") {
      query = query.or(
        [
          "order_status.ilike.returned",
          "order_status.ilike.returning"
        ].join(",")
      );
    }

    if (filter === "completed") {
      query = query.or(
        "order_status.ilike.completed,order_status.ilike.picked up"
      );
    }

    if (filter === "paid") {
      query = query.ilike(
        "payment_status",
        "paid"
      );
    }

    if (filter === "in transit") {
      query = query.or(
        [
          "order_status.ilike.%in transit%",
          "order_status.ilike.%parcel on hold%",
          "order_status.ilike.%on hold%",
          "order_status.ilike.%shipment on hold%",
          "order_status.ilike.%delivery on hold%",
          "order_status.ilike.%delayed%",
          "order_status.ilike.%arrived at delivery hub%",
          "order_status.ilike.%at delivery hub%"
        ].join(",")
      );
    }

    if (
      filter === "pending" ||
      filter === "pending cod"
    ) {
      query = query
        .ilike("order_status", "pending")
        .or(
          "payment_method.ilike.%cod%,payment_provider.ilike.%cod%"
        );
    }

    if (filter === "pending payment") {
      query = query
        .neq("order_status", "Cancelled")
        .or(
          [
            "order_status.ilike.pending payment",
            "payment_status.ilike.pending",
            "payment_status.ilike.pending payment"
          ].join(",")
        )

        .or(
          [
            "payment_provider.not.ilike.%cod%",
            "courier.ilike.%store pickup%"
          ].join(",")
        )

        .gte(
          "created_at",
          oneHourAgoIso
        );
    }

    if (filter === "pending skyro") {
      query = query
        .or(
          [
            "order_status.ilike.pending stock confirmation",
            "order_status.ilike.pending skyro approval",
            "order_status.ilike.pending skyro application"
          ].join(",")
        )
        .or(
          "payment_method.ilike.%skyro%,payment_provider.ilike.%skyro%"
        );
    }

    if (filter === "awaiting customer application") {
      query = query
        .ilike(
          "order_status",
          "skyro application allowed"
        )
        .or(
          "payment_method.ilike.%skyro%,payment_provider.ilike.%skyro%"
        );
    }

    if (filter === "skyro approved") {
      query = query
        .ilike(
          "order_status",
          "skyro approved"
        )
        .or(
          "payment_method.ilike.%skyro%,payment_provider.ilike.%skyro%"
        );
    }


    if (filter === "expired") {
      query = query.or(
        [
          "order_status.ilike.expired",
          "order_status.ilike.payment expired",
          "payment_status.ilike.%expired%",
          `and(order_status.ilike.pending payment,created_at.lt.${oneHourAgoIso},payment_provider.not.ilike.%cod%,courier.not.ilike.%store pickup%)`
        ].join(",")
      );
    }

    let countQuery = supabase
      .from("orders")
      .select("*", {
        count: "exact"
      });

    if (startDate && endDate) {
      countQuery = countQuery
        .gte(
          "created_at",
          startDate.toISOString()
        )
        .lt(
          "created_at",
          endDate.toISOString()
        );
    }

    const {
      data: periodOrders,
      error: periodOrdersError,
      count: periodTotalCount
    } = await countQuery;

    if (periodOrdersError) {
      throw periodOrdersError;
    }

    const periodCounts = {
      all: Number(periodTotalCount || 0),
      pendingSummary: 0,
      pendingCod: 0,
      pendingSkyro: 0,
      awaitingSkyroApplication: 0,
      approvedSkyro: 0,
      processing: 0,
      packed: 0,
      toShip: 0,
      shipped: 0,
      inTransit: 0,
      delivered: 0,
      completed: 0,
      paid: 0,
      pendingPayment: 0,
      storePickup: 0,
      failedDelivery: 0,
      returned: 0,
      expired: 0
    };

    periodOrders.forEach(order => {
      const orderStatus = String(
        order.order_status || ""
      )
        .trim()
        .toLowerCase();

      const paymentStatus = String(
        order.payment_status ||
        order.status ||
        order.xendit_status ||
        ""
      )
        .trim()
        .toLowerCase();

      const paymentMethod = String(
        order.payment_provider ||
        order.payment_method ||
        ""
      )
        .trim()
        .toLowerCase();

      const paymentText =
        `${paymentStatus} ${paymentMethod}`;

      const isCOD =
        paymentText.includes("cod") ||
        paymentText.includes("cash on delivery");

      const isSkyro =
        paymentText.includes("skyro");

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

      const isPendingOnlinePayment =
        !isCOD &&
        !String(order.courier || "")
          .toLowerCase()
          .includes("store pickup") &&
        (
          orderStatus === "pending payment" ||
          paymentStatus === "pending" ||
          paymentStatus === "pending payment"
        );

      const isTimedOut =
        isPendingOnlinePayment &&
        Number.isFinite(expiryTime) &&
        Date.now() > expiryTime;

      const isExpired =
        orderStatus === "expired" ||
        orderStatus === "payment expired" ||
        paymentStatus.includes("expired") ||
        isTimedOut;

      if (
        (
          orderStatus === "pending" ||
          orderStatus === "pending payment"
        ) &&
        !isExpired
      ) {
        periodCounts.pendingSummary++;
      }

      if (
        isCOD &&
        orderStatus === "pending"
      ) {
        periodCounts.pendingCod++;
      }

      if (
        isSkyro &&
        [
          "pending stock confirmation",
          "pending skyro approval",
          "pending skyro application"
        ].includes(orderStatus)
      ) {
        periodCounts.pendingSkyro++;
      }

      if (
        isSkyro &&
        orderStatus === "skyro application allowed"
      ) {
        periodCounts.awaitingSkyroApplication++;
      }

      if (
        isSkyro &&
        orderStatus === "skyro approved"
      ) {
        periodCounts.approvedSkyro++;
      }

      if (orderStatus === "processing") {
        periodCounts.processing++;
      }

      if (orderStatus === "packed") {
        periodCounts.packed++;
      }

      if (orderStatus === "to ship") {
        periodCounts.toShip++;
      }

      if (orderStatus === "shipped") {
        periodCounts.shipped++;
      }

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

      if (
        activeTransitStatuses.some(status =>
          orderStatus.includes(status)
        )
      ) {
        periodCounts.inTransit++;
      }

      if (orderStatus === "delivered") {
        periodCounts.delivered++;
      }

      if (
        orderStatus === "completed" ||
        orderStatus === "picked up"
      ) {
        periodCounts.completed++;
      }

      if (paymentStatus === "paid") {
        periodCounts.paid++;
      }

      const isStorePickup =
        String(order.courier || "")
          .toLowerCase()
          .includes("store pickup");

      if (
        isStorePickup &&
        !isExpired &&
        orderStatus !== "completed" &&
        orderStatus !== "picked up" &&
        orderStatus !== "cancelled"
      ) {
        periodCounts.storePickup++;
      }

      if (
        orderStatus !== "cancelled" &&
        (!isCOD || isStorePickup) &&
        !isExpired &&
        (
          orderStatus === "pending payment" ||
          paymentStatus === "pending" ||
          paymentStatus === "pending payment"
        )
      ) {
        periodCounts.pendingPayment++;
      }

      if (orderStatus === "failed delivery") {
        periodCounts.failedDelivery++;
      }

      if (
        orderStatus === "returned" ||
        orderStatus === "returning"
      ) {
        periodCounts.returned++;
      }

      if (isExpired) {
        periodCounts.expired++;
      }
    });

    const {
      data,
      error,
      count
    } = await query.range(
      from,
      to
    );

    if (error) {
      throw error;
    }

    return res.json({
      success: true,

      orders: data || [],

      period:
        period || "all",

      filter:
        filter || "all",

      counts: periodCounts,

      pagination: {

        page,
        limit,
        total: count || 0,

        totalPages: Math.max(
          1,
          Math.ceil(
            (count || 0) / limit
          )
        )
      }
    });

  } catch (error) {

    console.error(
      "GET ORDERS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load orders",
      error: error.message
    });
  }
});

// ================= UPDATE ORDER =================
app.post("/api/orders/update", async (req, res) => {
  try {
    const {
      orderId,
      order_status,
      payment_status,
      tracking_number,
      courier,
      skyro_application_link,
      delivered_at,
      picked_up_at,
      packed_at,
      shipment_arranged_at
    } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Missing order ID"
      });
    }

    const { data: existingOrder, error: findError } =
      await supabase
        .from("orders")
        .select("*")
        .eq("external_id", orderId)
        .single();

    if (findError || !existingOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const updates = {
      updated_at: new Date().toISOString()
    };

    const existingPaymentProvider = String(
      existingOrder.payment_provider ||
      existingOrder.paymentProvider ||
      existingOrder.payment_method ||
      ""
    ).trim().toUpperCase();

    const isStorePickup =
      String(existingOrder.courier || "")
        .trim()
        .toLowerCase()
        .includes("store pickup");

    const isOnlinePayment =
      existingPaymentProvider.includes("XENDIT") ||
      existingPaymentProvider.includes("MAYA") ||
      existingPaymentProvider.includes("SKYRO");

    const isTryingToForceReady =
      String(order_status || "")
        .trim()
        .toLowerCase() === "ready for pickup";

    const isTryingToForcePaid =
      String(payment_status || "")
        .trim()
        .toUpperCase() === "PAID";

    const isAlreadyPaid =
      String(existingOrder.payment_status || "")
        .trim()
        .toUpperCase() === "PAID";

    const isTryingToCompletePickup =
      ["completed", "picked up"].includes(
        String(order_status || "")
          .trim()
          .toLowerCase()
      );

    if (
      isStorePickup &&
      isTryingToCompletePickup &&
      !isAlreadyPaid
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Store Pickup must be marked PAID before it can be completed."
      });
    }

    if (
      isStorePickup &&
      isOnlinePayment &&
      !isAlreadyPaid &&
      (isTryingToForceReady || isTryingToForcePaid)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Online payment Store Pickup must be confirmed by the payment webhook before it can be marked PAID or Ready for Pickup."
      });
    }

    if (order_status !== undefined) {
      updates.order_status = String(order_status).trim();

      if (
        String(order_status).toLowerCase() === "cancelled" &&
        existingOrder.stock_restored !== true
      ) {
        try {
          await restoreXenditStock({
            ...existingOrder,
            stock_reserved: true
          });

          updates.stock_reserved = false;
          updates.stock_restored = true;
          updates.stock_restored_at =
            new Date().toISOString();

        } catch (stockErr) {
          console.error(
            "UPDATE CANCEL RESTORE STOCK ERROR:",
            stockErr
          );
        }
      }
    }

    if (payment_status !== undefined) {
      updates.payment_status =
        String(payment_status).trim();
    }

    if (tracking_number !== undefined) {
      updates.tracking_number = tracking_number;
    }

    if (courier !== undefined) {
      updates.courier = courier;
    }

    if (skyro_application_link !== undefined) {
      updates.skyro_application_link =
        String(skyro_application_link).trim();
    }

    if (delivered_at !== undefined) {
      updates.delivered_at = delivered_at;
    }

    if (picked_up_at !== undefined) {
      updates.picked_up_at = picked_up_at;
    }

    if (packed_at !== undefined) {
      updates.packed_at = packed_at;
    }

    if (shipment_arranged_at !== undefined) {
      updates.shipment_arranged_at =
        shipment_arranged_at;
    }

    const { data: updatedOrder, error: updateError } =
      await supabase
        .from("orders")
        .update(updates)
        .eq("external_id", orderId)
        .select()
        .single();

    if (updateError) {
      throw updateError;
    }

    return res.json({
      success: true,
      order: updatedOrder
    });

  } catch (err) {
    console.error("UPDATE ORDER ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Update failed"
    });
  }
});


// ================= CANCEL ORDER =================
app.post("/api/orders/:orderId/cancel", async (req, res) => {
  try {
    const { orderId } = req.params;

    const {
      cancel_reason,
      cancel_type,
      cancelled_by
    } = req.body;

    let orders = await readOrders();

    const index = orders.findIndex(
      order => String(order.external_id) === String(orderId)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const currentOrderStatus =
      String(orders[index].order_status || "")
        .trim()
        .toLowerCase();

    const currentPaymentStatus =
      String(orders[index].payment_status || "")
        .trim()
        .toUpperCase();

    const canCancel =
      [
        "pending",
        "pending payment",
        "processing",
        "pending stock confirmation",
        "pending skyro approval",
        "pending skyro application",
        "skyro application allowed"
      ].includes(currentOrderStatus);

    if (!canCancel) {
      return res.status(403).json({
        success: false,
        message:
          "Only pending unpaid orders can be cancelled."
      });
    }

    orders[index].order_status = "Cancelled";

    orders[index].cancel_type =
      cancel_type || "Seller Forced Cancel";

    orders[index].cancel_reason =
      cancel_reason || "No reason provided";

    orders[index].cancelled_by =
      cancelled_by || "seller";

    orders[index].cancelled_at =
      new Date().toISOString();

    orders[index].updated_at =
      new Date().toISOString();

    if (orders[index].stock_restored !== true) {
      try {

        await restoreXenditStock({
          ...orders[index],
          stock_reserved: true
        });

        orders[index].stock_reserved = false;
        orders[index].stock_restored = true;
        orders[index].stock_restored_at = new Date().toISOString();
        orders[index].updated_at = new Date().toISOString();

      } catch (stockErr) {
        console.error("RESTORE STOCK ERROR:", stockErr);
      }
    }

    await saveOrders([orders[index]]);

    res.json({
      success: true,
      message: "Order cancelled successfully",
      order: orders[index]
    });

  } catch (err) {
    console.error("CANCEL ORDER ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Cancel order failed"
    });
  }
});

// ================= EXPIRE PAYMENT =================
app.post("/api/orders/:orderId/expire-payment", async (req, res) => {
  try {
    const { orderId } = req.params;

    const {
      data: order,
      error: orderError
    } = await supabase
      .from("orders")
      .select("*")
      .eq("external_id", orderId)
      .maybeSingle();

    if (orderError) {
      throw orderError;
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    let orders = [order];
    const index = 0;

    if (orders[index].stock_restored !== true) {
      try {
        await restoreXenditStock({
          ...orders[index],
          stock_reserved: true
        });

        orders[index].stock_reserved = false;
        orders[index].stock_restored = true;
        orders[index].stock_restored_at = new Date().toISOString();

      } catch (stockErr) {
        console.error("EXPIRE PAYMENT RESTORE STOCK ERROR:", stockErr);
      }
    }

    orders[index].status = "PAYMENT_EXPIRED";
    orders[index].payment_status = "PAYMENT_EXPIRED";
    orders[index].order_status = "Payment Expired";
    orders[index].expired_at = new Date().toISOString();
    orders[index].updated_at = new Date().toISOString();

    await saveOrders(orders);

    res.json({
      success: true,
      message: "Payment expired and stock restored",
      order: orders[index]
    });

  } catch (err) {
    console.error("EXPIRE PAYMENT ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Expire payment failed"
    });
  }
});

// ================= GET CANCELLED ORDERS =================
app.get("/api/orders/cancelled", async (req, res) => {
  try {
    const orders = await readOrders();

    const cancelledOrders = orders.filter(order =>
      order.order_status === "Cancelled"
    );

    res.json({
      success: true,
      orders: cancelledOrders
    });

  } catch (err) {
    console.error("GET CANCELLED ORDERS ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Failed to get cancelled orders"
    });
  }
});

// ================= DELETE ORDER PERMANENT =================
app.delete("/api/orders/:orderId/delete", async (req, res) => {
  try {
    const { orderId } = req.params;

    let orders = await readOrders();

    const index = orders.findIndex(
      order => String(order.external_id) === String(orderId)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const deletedOrder = orders[index];

    orders.splice(index, 1);

    await saveOrders(orders);

    res.json({
      success: true,
      message: "Order permanently deleted",
      order: deletedOrder
    });

  } catch (err) {
    console.error("DELETE ORDER ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Delete order failed"
    });
  }
});

// ================= PAYMENT WEBHOOK HELPERS =================
function findOrderIndex(orders, orderId) {
  return orders.findIndex(order => String(order.external_id) === String(orderId));
}

function markOrderPaid(order, provider, meta = {}) {

  const isStorePickup =
    String(order.courier || "")
      .trim()
      .toLowerCase()
      .includes("store pickup");

  order.status = "PAID";
  order.payment_status = "PAID";
  order.payment_provider = order.payment_provider || provider;

  order.order_status =
    isStorePickup
      ? "Ready for Pickup"
      : "Processing";

  order.paid_at =
    order.paid_at ||
    new Date().toISOString();

  order.updated_at =
    new Date().toISOString();

  Object.assign(order, meta);
}

function markOrderPaymentFailed(order, provider, status, meta = {}) {
  order.status = status || "PAYMENT_FAILED";
  order.payment_status = status || "PAYMENT_FAILED";
  order.payment_provider = order.payment_provider || provider;

  if (["PAYMENT_FAILED", "PAYMENT_EXPIRED", "PAYMENT_CANCELLED", "EXPIRED", "FAILED"].includes(status)) {
    order.order_status = status === "PAYMENT_EXPIRED" || status === "EXPIRED"
      ? "Payment Expired"
      : "Payment Failed";
  }

  order.updated_at = new Date().toISOString();
  Object.assign(order, meta);
}

function respondWebhookOk(res, extra = {}) {
  return res.status(200).json({
    success: true,
    message: "Webhook processed",
    ...extra
  });
}

// ================= MAYA WEBHOOK =================
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body || {};
    console.log("MAYA WEBHOOK RECEIVED:", data);

    const orderId = data.requestReferenceNumber;
    const mayaStatus = data.status || data.paymentStatus || "UNKNOWN";
    const isPaid =
      data.isPaid === true ||
      mayaStatus === "PAYMENT_SUCCESS" ||
      mayaStatus === "CHECKOUT_SUCCESS";

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Missing requestReferenceNumber"
      });
    }

    let orders = await readOrders();
    const index = findOrderIndex(orders, orderId);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const meta = {
      maya_status: mayaStatus,
      maya_webhook_id: data.id || data.webhookId || "",
      maya_transaction_id: data.receipt?.transactionId || data.paymentId || data.transactionId || "",
      maya_receipt_number: data.receiptNumber || data.receipt?.receiptNo || "",
      maya_raw_webhook: data
    };

    if (isPaid) {
      markOrderPaid(orders[index], "MAYA", meta);
    } else {
      markOrderPaymentFailed(orders[index], "MAYA", mayaStatus, meta);
    }

    await saveOrders(orders);

    return respondWebhookOk(res, {
      provider: "MAYA",
      orderId,
      status: orders[index].status,
      order_status: orders[index].order_status
    });

  } catch (err) {
    console.error("MAYA WEBHOOK ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Maya webhook failed"
    });
  }
});

// ================= XENDIT WEBHOOK =================
app.post("/api/xendit/webhook", async (req, res) => {
  try {
    const data = req.body || {};
    console.log("XENDIT WEBHOOK RECEIVED:", data);

    const payload = data.data || data;
    const orderId =
      payload.external_id ||
      payload.reference_id ||
      payload.payment_request_id ||
      payload.id;

    const xenditStatus = String(payload.status || data.event || "UNKNOWN").toUpperCase();

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Missing Xendit order reference"
      });
    }

    let orders = await readOrders();
    const index = findOrderIndex(orders, orderId);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const meta = {
      xendit_status: xenditStatus,
      xendit_invoice_id: payload.id || data.id || "",
      xendit_payment_id:
        payload.payment_id ||
        payload.payment_method_id ||
        payload.payment_request_id ||
        "",
      xendit_raw_webhook: data
    };

    const paidStatuses = [
      "PAID",
      "SETTLED",
      "SUCCEEDED",
      "SUCCESS",
      "COMPLETED",
      "PAYMENT.SUCCEEDED",
      "INVOICE.PAID"
    ];

    if (paidStatuses.includes(xenditStatus)) {
      markOrderPaid(orders[index], "XENDIT", meta);

    } else if (["EXPIRED", "FAILED", "VOIDED", "CANCELLED", "CANCELED"].includes(xenditStatus)) {

      markOrderPaymentFailed(orders[index], "XENDIT", xenditStatus, meta);

      try {
        await restoreXenditStock(orders[index]);
      } catch (stockErr) {
        console.error("XENDIT RESTORE STOCK ERROR:", stockErr);
      }

    } else {
      orders[index].xendit_status = xenditStatus;
      orders[index].xendit_raw_webhook = data;
      orders[index].updated_at = new Date().toISOString();
    }

    await saveOrders(orders);

    return respondWebhookOk(res, {
      provider: "XENDIT",
      orderId,
      status: orders[index].status,
      order_status: orders[index].order_status
    });

  } catch (err) {
    console.error("XENDIT WEBHOOK ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Xendit webhook failed"
    });
  }
});

// Optional alias para Maya dashboard
app.post("/api/maya/webhook", (req, res) => {
  req.url = "/webhook";
  return app.handle(req, res);
});

// ================= SPX ADDRESS FILE DOWNLOAD =================

app.get("/api/spx/address-file", async (req, res) => {
  try {

    const result = await spxPost(
      "/open/api/address/get_address_download_url",
      {}
    );

    const fileUrl =
      result?.data?.address_download_url ||
      result?.data?.download_url ||
      result?.data?.url;

    if (!fileUrl) {
      return res.status(400).json({
        success: false,
        message: "No address file URL returned",
        fullSpxResponse: result
      });
    }

    return res.redirect(fileUrl);

  } catch (err) {

    console.error(
      "SPX ADDRESS FILE ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({
      success: false,
      message: "SPX address file download failed",
      error: err.response?.data || err.message
    });

  }
});

// ===== TEST WEBHOOK =====
app.post("/test-webhook", (req, res) => {
  console.log("TEST WEBHOOK RECEIVED:", req.body);
  res.status(200).json({
    success: true,
    message: "Test webhook working",
    body: req.body
  });
});

// ================= LOCATION SEARCH PROXY =================
app.get("/api/location-search", async (req, res) => {
  try {
    const q = req.query.q;

    if (!q || q.length < 4) {
      return res.json([]);
    }

    const url =
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ", Philippines")}&limit=3`;

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 DrinElectronics contact@drinelectronicsph.com"
      },
      timeout: 5000
    });

    res.json(response.data);

  } catch (error) {
    console.error(
      "LOCATION SEARCH ERROR FULL:",
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      message: "Location search failed"
    });
  }
});

// ================= LALAMOVE QUOTATION =================
app.post("/api/lalamove/quotation", async (req, res) => {
  try {
    const path = "/v3/quotations";
    const method = "POST";

    const body = JSON.stringify(req.body);

    const { time, signature } =
      generateLalamoveSignature(method, path, body);

    const response = await axios.post(
      `${process.env.LALAMOVE_BASE_URL}${path}`,
      body,
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `hmac ${process.env.LALAMOVE_API_KEY}:${time}:${signature}`,
          Market: process.env.LALAMOVE_MARKET || "PH",
          "Request-ID": `drin-${Date.now()}`
        }
      }
    );

    res.json({
      success: true,
      data: response.data
    });

  } catch (err) {
    console.error("LALAMOVE QUOTATION ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      message: "Lalamove quotation failed",
      error: err.response?.data || err.message
    });
  }
});

// ================= LALAMOVE CREATE ORDER =================
app.post("/api/orders/:orderId/lalamove-create", async (req, res) => {
  try {
    const { orderId } = req.params;

    let orders = await readOrders();

    const index = orders.findIndex(
      order => String(order.external_id) === String(orderId)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const order = orders[index];

    const savedAddress = order.address || {};

    // TEMPORARY payload muna
    const path = "/v3/orders";
    const method = "POST";

    const payload = {
      data: {
        serviceType: "MOTORCYCLE",
        specialRequests: [],
        stops: [
          {
            coordinates: {
              lat: "14.5995",
              lng: "120.9842"
            },
            address: "Your Pickup Address"
          },
          {
            coordinates: {
              lat: "14.6760",
              lng: "121.0437"
            },
            address: `${savedAddress.fullAddress}, ${savedAddress.city}`
          }
        ]
      }
    };

    const body = JSON.stringify(payload);

    const { time, signature } =
      generateLalamoveSignature(method, path, body);

    const response = await axios.post(
      `${process.env.LALAMOVE_BASE_URL}${path}`,
      body,
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `hmac ${process.env.LALAMOVE_API_KEY}:${time}:${signature}`,
          Market: process.env.LALAMOVE_MARKET || "PH",
          "Request-ID": `drin-book-${Date.now()}`
        }
      }
    );

    orders[index].courier = "Lalamove";
    orders[index].shipping_status = "BOOKED";
    orders[index].lalamove_booking = response.data;
    orders[index].updated_at = new Date().toISOString();

    await saveOrders(orders);

    res.json({
      success: true,
      booking: response.data
    });

  } catch (err) {
    console.error("LALAMOVE BOOK ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      message: "Lalamove booking failed",
      error: err.response?.data || err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});