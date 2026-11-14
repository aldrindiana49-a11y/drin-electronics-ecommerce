async function checkAdminAccess() {

    const { data: { session } } =
        await supabaseClient.auth.getSession();

    if (!session) {
        window.location.href =
            "./dashboard-index.html";
        return;
    }

    const { data: adminData, error } =
        await supabaseClient
            .from("admin_users")
            .select("role")
            .eq("id", session.user.id)
            .eq("role", "admin")
            .single();

    if (error || !adminData) {
        await supabaseClient.auth.signOut();

        window.location.href =
            "./dashboard-index.html";
        return;
    }
}

checkAdminAccess();

async function adminLogout() {
    await supabaseClient.auth.signOut();

    window.location.href =
        "./dashboard-index.html";
}

const menuItems = document.querySelectorAll(".menu-item");
const contentSections = document.querySelectorAll(".content-section");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const sidebar = document.getElementById("sidebar");
/* DASHBOARD */
const dashboardTotalProducts = document.getElementById("dashboardTotalProducts");
const dashboardTotalStock = document.getElementById("dashboardTotalStock");
const dashboardTotalBanners = document.getElementById("dashboardTotalBanners");

/* PRODUCT FORM */
const productForm = document.getElementById("productForm");
const productId = document.getElementById("productId");
const existingImageData = document.getElementById("existingImageData");
const nameInput = document.getElementById("name");
const categoryInput = document.getElementById("category");
const brandInput = document.getElementById("brand");
const productTypeInput = document.getElementById("productType");
const variantTitleInput = document.getElementById("variantTitle");
const productImageFile = document.getElementById("productImageFile");
const productImagePreview = document.getElementById("productImagePreview");
const imagePreviewPlaceholder = document.getElementById("imagePreviewPlaceholder");
const descriptionInput = document.getElementById("description");
const submitBtn = document.getElementById("submitBtn");
const resetBtn = document.getElementById("resetBtn");
const inventoryTableBody = document.getElementById("inventoryTableBody");
const searchInput = document.getElementById("searchInput");
const addVariantBtn = document.getElementById("addVariantBtn");
const variantTableBody = document.getElementById("variantTableBody");
const singleSkuSection = document.getElementById("singleSkuSection");
const variantSection = document.getElementById("variantSection");
const singlePriceInput = document.getElementById("singlePrice");
const singleDiscountPriceInput = document.getElementById("singleDiscountPrice");
const singleStockInput = document.getElementById("singleStock");
const singleSkuInput = document.getElementById("singleSku");
const singleWeightInput = document.getElementById("singleWeight");
const singleLengthInput = document.getElementById("singleLength");
const singleWidthInput = document.getElementById("singleWidth");
const singleHeightInput = document.getElementById("singleHeight");
const singleVariantImageFile = document.getElementById("singleVariantImageFile");

/* QUICK ACTIONS */
const actionButtons = document.querySelectorAll(".action-btn");
/* VOUCHERS */
const voucherForm = document.getElementById("voucherForm");
const voucherCode = document.getElementById("voucherCode");
const voucherAmount = document.getElementById("voucherAmount");
const voucherMinSpend = document.getElementById("voucherMinSpend");
const voucherStatus = document.getElementById("voucherStatus");
const voucherType = document.getElementById("voucherType");
const voucherShowPopup = document.getElementById("voucherShowPopup");
const voucherTableBody = document.getElementById("voucherTableBody");
const welcomeVoucherTableBody = document.getElementById("welcomeVoucherTableBody");


/* ===============================
   MARKETING CENTER - VOUCHERS
================================ */

async function loadVouchers() {
    await loadRegularVouchers();
    await loadWelcomeVouchers();
}

async function loadRegularVouchers() {
    if (!voucherTableBody) return;

    const { data, error } = await supabaseClient
        .from("vouchers")
        .select("*")
        .eq("voucher_type", "regular")
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        showToast("Failed to load regular vouchers", "error");
        return;
    }

    if (!data || data.length === 0) {
        voucherTableBody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-box">No regular vouchers yet.</div>
                </td>
            </tr>
        `;
        return;
    }

    voucherTableBody.innerHTML = data.map((voucher) => `
        <tr>
            <td><strong>${voucher.code}</strong></td>
            <td>₱${Number(voucher.discount_amount || 0).toLocaleString()}</td>
            <td>₱${Number(voucher.min_spend || 0).toLocaleString()}</td>
            <td>
                <span class="status-badge ${voucher.is_active ? "status-active" : "status-inactive"}">
                    ${voucher.is_active ? "Active" : "Inactive"}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="small-btn" onclick="toggleVoucherStatus(${voucher.id}, ${voucher.is_active})">
                        ${voucher.is_active ? "Disable" : "Enable"}
                    </button>
                    <button class="danger-btn" onclick="deleteVoucher(${voucher.id})">
                        Delete
                    </button>
                </div>
            </td>
        </tr>
    `).join("");
}

async function loadWelcomeVouchers() {
    if (!welcomeVoucherTableBody) return;

    const { data, error } = await supabaseClient
        .from("vouchers")
        .select("*")
        .eq("voucher_type", "welcome")
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        showToast("Failed to load welcome vouchers", "error");
        return;
    }

    if (!data || data.length === 0) {
        welcomeVoucherTableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-box">No welcome vouchers yet.</div>
                </td>
            </tr>
        `;
        return;
    }

    welcomeVoucherTableBody.innerHTML = data.map((voucher) => `
        <tr>
            <td><strong>${voucher.code}</strong></td>
            <td>₱${Number(voucher.discount_amount || 0).toLocaleString()}</td>
            <td>₱${Number(voucher.min_spend || 0).toLocaleString()}</td>
            <td>
                <span class="status-badge ${voucher.is_active ? "status-active" : "status-inactive"}">
                    ${voucher.is_active ? "Active" : "Inactive"}
                </span>
            </td>
            <td>
                <span class="status-badge ${voucher.show_popup ? "status-active" : "status-inactive"}">
                    ${voucher.show_popup ? "Yes" : "No"}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="small-btn" onclick="toggleVoucherStatus(${voucher.id}, ${voucher.is_active})">
                        ${voucher.is_active ? "Disable" : "Enable"}
                    </button>
                    <button class="danger-btn" onclick="deleteVoucher(${voucher.id})">
                        Delete
                    </button>
                </div>
            </td>
        </tr>
    `).join("");
}

if (voucherForm) {
    voucherForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const code = voucherCode.value.trim().toUpperCase();
        const amount = Number(voucherAmount.value || 0);
        const minSpend = Number(voucherMinSpend.value || 0);

        if (!code) {
            showToast("Voucher code required", "warning");
            return;
        }

        if (amount <= 0) {
            showToast("Discount must be greater than 0", "warning");
            return;
        }

        const payload = {
            code,
            discount_amount: amount,
            min_spend: minSpend,
            is_active: voucherStatus.value === "true",
            voucher_type: voucherType.value,
            show_popup: voucherShowPopup.value === "true"
        };

        const saveBtn = voucherForm.querySelector("button[type='submit']");

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = "Saving...";
        }

        const { error } = await supabaseClient
            .from("vouchers")
            .insert([payload]);

        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Voucher";
        }

        if (error) {
            console.error(error);
            showToast(error.message || "Failed to save voucher", "error");
            return;
        }

        voucherForm.reset();
        showToast("Voucher saved successfully!", "success");
        loadVouchers();
    });
}

async function toggleVoucherStatus(id, currentStatus) {
    const { error } = await supabaseClient
        .from("vouchers")
        .update({ is_active: !currentStatus })
        .eq("id", id);

    if (error) {
        showToast("Failed to update voucher", "error");
        return;
    }

    showToast("Voucher status updated", "success");
    loadVouchers();
}

async function deleteVoucher(id) {
    const confirmDelete = await showConfirmModal(
        "Delete Voucher",
        "Are you sure you want to delete this voucher?"
    );

    if (!confirmDelete) return;

    const { error } = await supabaseClient
        .from("vouchers")
        .delete()
        .eq("id", id);

    if (error) {
        showToast("Failed to delete voucher", "error");
        return;
    }

    showToast("Voucher deleted", "success");
    loadVouchers();
}

loadVouchers();

/* ===============================
   CUSTOM CONFIRM MODAL
================================ */

function showConfirmModal(title, message, confirmLabel = "Confirm") {

    return new Promise((resolve) => {

        const modal = document.createElement("div");

        modal.innerHTML = `
      <div class="confirm-modal-overlay">

        <div class="confirm-modal-box">

          <h3>${title}</h3>

          <p>${message}</p>

          <div class="confirm-modal-actions">

            <button class="confirm-cancel-btn">
              Cancel
            </button>

            <button class="confirm-ok-btn">
              ${confirmLabel}
            </button>

          </div>

        </div>

      </div>
    `;

        document.body.appendChild(modal);

        modal.querySelector(".confirm-cancel-btn")
            .addEventListener("click", () => {
                modal.remove();
                resolve(false);
            });

        modal.querySelector(".confirm-ok-btn")
            .addEventListener("click", () => {
                modal.remove();
                resolve(true);
            });

    });

}

/* END CUSTOM CONFIRM MODAL */

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;

        reader.readAsDataURL(file);
    });
}

function getStoreSettings() {
    return JSON.parse(localStorage.getItem("drinStoreSettings")) || {
        branding: {}
    };
}

function saveStoreSettings(settings) {
    localStorage.setItem("drinStoreSettings", JSON.stringify(settings));
}

function loadBrandingSettings() {
    const settings = getStoreSettings();

    const logoPreview = document.getElementById("storeLogoPreview");
    const faviconPreview = document.getElementById("storeFaviconPreview");

    if (logoPreview && settings.branding?.logo) {
        logoPreview.src = settings.branding.logo;
    }

    if (faviconPreview && settings.branding?.favicon) {
        faviconPreview.src = settings.branding.favicon;
    }
}

document.getElementById("storeLogoUpload")?.addEventListener("change", async function () {
    const file = this.files?.[0];
    if (!file) return;

    const base64 = await readFileAsBase64(file);

    const settings = getStoreSettings();
    settings.branding = settings.branding || {};
    settings.branding.logo = base64;

    saveStoreSettings(settings);
    loadBrandingSettings();

    showToast("Logo saved successfully.", "success");
});

document.getElementById("storeFaviconUpload")?.addEventListener("change", async function () {
    const file = this.files?.[0];
    if (!file) return;

    const base64 = await readFileAsBase64(file);

    const settings = getStoreSettings();
    settings.branding = settings.branding || {};
    settings.branding.favicon = base64;

    saveStoreSettings(settings);
    loadBrandingSettings();

    showToast("Favicon saved successfully.", "success");
});

loadBrandingSettings();

const adminChatBadge =
    document.getElementById("adminChatBadge");

async function loadAdminChatBadge() {

    if (!adminChatBadge) return;

    const { data, error } = await supabaseClient
        .from("chat_messages")
        .select("id")
        .eq("sender_type", "customer")
        .eq("is_read", false);

    if (error) {
        console.error(error);
        return;
    }

    const count = data?.length || 0;

    adminChatBadge.textContent = count;

    adminChatBadge.style.display =
        count > 0 ? "flex" : "none";
}

loadAdminChatBadge();

setInterval(loadAdminChatBadge, 5000);

supabaseClient
    .channel("admin-chat-badge")

    .on(
        "postgres_changes",
        {
            event: "*",
            schema: "public",
            table: "chat_messages"
        },
        () => {
            loadAdminChatBadge();
        }
    )

    .subscribe();

/* ===============================
GLOBAL MAINTENANCE CONTROL
================================ */

async function enableGlobalMaintenance() {

    const { error } =
        await supabaseClient
            .from("site_settings")
            .update({
                value: "true"
            })
            .eq(
                "key",
                "maintenance_mode"
            );

    if (error) {

        alert(
            "Failed to enable maintenance."
        );

        return;
    }

    alert(
        "Maintenance Mode Enabled"
    );

}

async function disableGlobalMaintenance() {

    const { error } =
        await supabaseClient
            .from("site_settings")
            .update({
                value: "false"
            })
            .eq(
                "key",
                "maintenance_mode"
            );

    if (error) {

        alert(
            "Failed to disable maintenance."
        );

        return;
    }

    alert(
        "Maintenance Mode Disabled"
    );

}

