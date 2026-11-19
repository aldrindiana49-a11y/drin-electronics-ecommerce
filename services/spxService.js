const axios = require("axios");
const crypto = require("crypto");

const BASE_URL = process.env.SPX_API_BASE_URL;

function generateCheckSign(appId, appSecret, timestamp, randomNum, payloadString) {
  const raw = `${appId}_${timestamp}_${randomNum}_${payloadString}`;

  return crypto
    .createHmac("sha256", appSecret)
    .update(raw)
    .digest("hex");
}

async function spxPost(endpoint, payload) {
  const appId = process.env.SPX_APP_ID;
  const appSecret = process.env.SPX_APP_SECRET;

  if (!appId || !appSecret || !BASE_URL) {
    throw new Error(
      "Missing SPX configuration: check SPX_APP_ID, SPX_APP_SECRET, and SPX_API_BASE_URL."
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const randomNum = Math.floor(Math.random() * 1000000000);

  const payloadString = JSON.stringify(payload);

  const checkSign = generateCheckSign(
    appId,
    appSecret,
    timestamp,
    randomNum,
    payloadString
  );

  try {

    const response = await axios.post(
      `${BASE_URL}${endpoint}`,
      payloadString,
      {
        headers: {
          "app-id": appId,
          "check-sign": checkSign,
          timestamp,
          "random-num": randomNum,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("SPX RESPONSE:", response.data);

    return response.data;

  } catch (error) {

    console.log(
      "SPX FULL ERROR:",
      error.response?.data || error.message
    );

    throw error;
  }
}

async function verifyAccount() {
  return spxPost("/open/api/v1/account/verify", {
    user_id: Number(process.env.SPX_USER_ID),
    user_secret: process.env.SPX_USER_SECRET
  });
}

function normalizeParcelInfo(parcelInfo = {}) {
  return {
    parcel_weight: Number(parcelInfo.parcelWeight || parcelInfo.parcel_weight || 1),
    parcel_length: Number(parcelInfo.parcelLength || parcelInfo.parcel_length || 10),
    parcel_width: Number(parcelInfo.parcelWidth || parcelInfo.parcel_width || 10),
    parcel_height: Number(parcelInfo.parcelHeight || parcelInfo.parcel_height || 10),
    parcel_item_name: parcelInfo.itemName || parcelInfo.parcel_item_name || "Electronics",
    parcel_item_quantity: Number(parcelInfo.itemQuantity || parcelInfo.parcel_item_quantity || 1),
    express_insured_value: Number(parcelInfo.expressInsuredValue || parcelInfo.express_insured_value || 0),
    parcel_item_type: parcelInfo.itemType || parcelInfo.parcel_item_type || "Electronics"
  };
}

function normalizeAddress(address = {}) {
  const isMetroManila = address.areaGroup === "Metro Manila";

  return {
    deliver_state:
      isMetroManila ? "Metro Manila" : address.areaGroup,

    deliver_city:
      isMetroManila ? "Metro Manila" : address.province,

    deliver_district:
      address.city || "",

    deliver_street:
      address.barangay,

    deliver_post_code:
      address.zip ||
      address.postCode ||
      address.zipCode ||
      address.deliverPostCode ||
      "",

    deliver_detail_address:
      address.fullAddress || ""
  };
}

async function checkShippingFee({ amount, paymentMethod, address, parcelInfo, voucherCode, baseInfo }) {
  const parcel = normalizeParcelInfo({
    ...parcelInfo,
    expressInsuredValue: Number(amount || 0)
  });
  const delivery = normalizeAddress(address);

  console.log("SPX DELIVERY DEBUG:", delivery);
  console.log("SPX RAW ADDRESS:", address);

  return spxPost("/open/api/v1/order/batch_check_order", {
    user_id: Number(process.env.SPX_USER_ID),
    user_secret: process.env.SPX_USER_SECRET,
    orders: [
      {
        base_info: {
          service_type: 1,
          product_id: process.env.SPX_PRODUCT_ID || "1",
          ed_item_list: baseInfo?.ed_item_list || [],
          vas_info: {}
        },
        sender_info: {
          sender_state: "Metro Manila",
          sender_city: "Metro Manila",
          sender_district: "Binondo",
          sender_street: "Barangay 294",
          sender_post_code: "115",
          sender_name: "Drin Electronics",
          sender_phone: "639123456789",
          sender_detail_address: "1"
        },

        fulfillment_info: {
          cod_collection: 0,
          cod_amount: 0,

          collect_type:
            Number(process.env.SPX_COLLECT_TYPE || 2),

          ...(voucherCode ? { voucher_code: voucherCode } : {})
        },

        deliver_info: {
          ...delivery,

          deliver_name: "Test Customer",

          deliver_phone: "09171234567"
        },

        parcel_info: parcel

      }
    ]
  });
}

async function createOrder(order) {
  const delivery = normalizeAddress(order.address || {});
  const isCOD = order.paymentMethod === "COD";

  const codAmount = isCOD
    ? Number(order.totalAmount || order.amount || 0)
    : 0;
  return spxPost("/open/api/v2/order/batch_create_order", {
    user_id: Number(process.env.SPX_USER_ID),
    user_secret: process.env.SPX_USER_SECRET,
    orders: [
      {
        order_id: order._id.toString(),

        base_info: {
          service_type: 1
        },

        sender_info: {
          sender_state: "Metro Manila",
          sender_city: "Metro Manila",
          sender_district: "Pasig City",
          sender_street: "Pinagbuhatan",
          sender_post_code: "1600",
          sender_name: "DRIN ELECTRONICS PASIG",
          sender_phone: "639206780409",
          sender_detail_address:
            "PINALAD RD CAMACHILI ST CENTENNIAL 2A NAGPAYONG"
        },

        fulfillment_info: {
          payment_role: 1,

          cod_collection: isCOD ? 1 : 0,

          cod_amount: codAmount,

          collect_type: 2
        },

        deliver_info: {
          ...delivery,

          deliver_name:
            order.customerName || "Customer",

          deliver_phone:
            order.phone || "09171234567",

          deliver_instruction:
            order.note || ""
        },

        parcel_info: {
          parcel_weight: order.parcelWeight || 1,
          parcel_length: order.parcelLength || 10,
          parcel_width: order.parcelWidth || 10,
          parcel_height: order.parcelHeight || 10,
          parcel_item_name: order.parcelItemName || "Electronics",
          parcel_item_quantity: order.parcelItemQuantity || order.items?.length || 1,
          express_insured_value: Math.max(
            Number(
              order.declaredValue ||
              order.totalAmount ||
              0
            ),
            1
          ),
          parcel_item_type: order.parcelItemType || "Electronics"
        }
      }
    ]
  });
}

async function getCreateResult(batchNo) {
  return spxPost("/open/api/v2/order/get_order_create_result", {
    user_id: Number(process.env.SPX_USER_ID),
    user_secret: process.env.SPX_USER_SECRET,
    batch_no: Number(batchNo)
  });
}

async function getAWB(batchNo) {
  return spxPost("/open/api/v2/order/batch_get_shipping_label", {
    user_id: Number(process.env.SPX_USER_ID),
    user_secret: process.env.SPX_USER_SECRET,
    batch_no: Number(batchNo)
  });
}


function verifyWebhookSignature({
  timestamp,
  randomNum,
  payloadString,
  checkSign
}) {
  const appId = process.env.SPX_APP_ID;
  const appSecret = process.env.SPX_APP_SECRET;

  if (
    !appId ||
    !appSecret ||
    !timestamp ||
    !randomNum ||
    !checkSign
  ) {
    return false;
  }

  const expected = generateCheckSign(
    appId,
    appSecret,
    timestamp,
    randomNum,
    payloadString || ""
  );

  const expectedBuffer =
    Buffer.from(expected, "utf8");

  const receivedBuffer =
    Buffer.from(String(checkSign), "utf8");

  if (
    expectedBuffer.length !==
    receivedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    receivedBuffer
  );
}

module.exports = {
  spxPost,
  verifyAccount,
  checkShippingFee,
  createOrder,
  getCreateResult,
  getAWB,
  verifyWebhookSignature
};