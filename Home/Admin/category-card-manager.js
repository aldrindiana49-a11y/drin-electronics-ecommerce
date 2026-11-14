
/* ==========================================
   DRIN ELECTRONICS
   CATEGORY CARD IMAGE MANAGER
   ========================================== */

(() => {
    const BUCKET = "category-card-images";
    const TABLE = "category_card_images";


    function showCategoryToast(title, message, type = "success") {
        document.getElementById("categoryPremiumToast")?.remove();

        const toast = document.createElement("div");
        toast.id = "categoryPremiumToast";

        const success = type === "success";

        Object.assign(toast.style, {
            position: "fixed",
            top: "85px",
            right: "20px",
            zIndex: "999999",
            width: "min(360px, calc(100vw - 40px))",
            padding: "18px 20px",
            borderRadius: "16px",
            background: "#ffffff",
            color: "#172033",
            border: `1px solid ${success ? "#b7ead2" : "#fecaca"}`,
            borderLeft: `5px solid ${success ? "#10b981" : "#ef4444"}`,
            boxShadow: "0 12px 35px rgba(0,0,0,0.16)",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            fontFamily: "Segoe UI, Arial, sans-serif"
        });

        const icon = document.createElement("div");
        icon.textContent = success ? "✓" : "!";
        Object.assign(icon.style, {
            width: "42px",
            height: "42px",
            borderRadius: "50%",
            flexShrink: "0",
            display: "grid",
            placeItems: "center",
            background: success ? "#d1fae5" : "#fee2e2",
            color: success ? "#047857" : "#dc2626",
            fontSize: "24px",
            fontWeight: "800"
        });

        const content = document.createElement("div");
        const heading = document.createElement("strong");
        heading.textContent = title;
        heading.style.display = "block";
        heading.style.marginBottom = "4px";

        const description = document.createElement("p");
        description.textContent = message;
        description.style.fontSize = "13px";
        description.style.color = "#64748b";
        description.style.margin = "0";

        content.append(heading, description);
        toast.append(icon, content);
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 4000);
    }


    const categorySelect =
        document.getElementById("categoryCardSelect");

    const imageInput =
        document.getElementById("categoryCardImageUpload");

    const preview =
        document.getElementById("categoryCardImagePreview");

    const placeholder =
        document.getElementById("categoryCardImagePlaceholder");

    const saveBtn =
        document.getElementById("saveCategoryCardImageBtn");

    const removeBtn =
        document.getElementById("removeCategoryCardImageBtn");

    if (!categorySelect || !imageInput || !preview ||
        !saveBtn || !removeBtn) return;

    let savedImages = new Map();
    let temporaryPreviewUrl = null;

    function clearTemporaryPreview() {
        if (temporaryPreviewUrl) {
            URL.revokeObjectURL(temporaryPreviewUrl);
            temporaryPreviewUrl = null;
        }
    }

    function displayPreview(url) {
        preview.style.display = url ? "block" : "none";
        preview.src = url || "";
        placeholder.style.display = url ? "none" : "block";
    }

    function getPublicUrl(path) {
        if (!path) return "";

        const { data } = supabaseClient.storage
            .from(BUCKET)
            .getPublicUrl(path);

        return data?.publicUrl || "";
    }


    function populateCategories() {
        const previous = categorySelect.value;

        const names = new Set();


        // Include categories used by actual products
        if (typeof products !== "undefined" && Array.isArray(products)) {
            products.forEach(product => {
                const name = String(product.category || "").trim();

                if (name) {
                    names.add(name);
                }
            });
        }


        // Get categories from existing Inventory dropdown
        const inventoryDropdown =
            document.getElementById("category");

        [...(inventoryDropdown?.options || [])]
            .forEach(option => {
                const name = option.value.trim();

                if (name && !name.startsWith("__")) {
                    names.add(name);
                }
            });

        // Get default + added categories from localStorage
        try {
            const saved = JSON.parse(
                localStorage.getItem("drinCategories") || "[]"
            );

            if (Array.isArray(saved)) {
                saved.forEach(category => {
                    const name = String(category.name || "").trim();

                    if (name && category.status !== "inactive") {
                        names.add(name);
                    }
                });
            }
        } catch (error) {
            console.error("Category storage error:", error);
        }

        categorySelect.replaceChildren(
            new Option("Select category", "")
        );

        [...names]
            .sort((a, b) => a.localeCompare(b))
            .forEach(name => {
                categorySelect.add(new Option(name, name));
            });

        if (names.has(previous)) {
            categorySelect.value = previous;
        }

        updatePreview();
    }

    function updatePreview() {
        clearTemporaryPreview();
        imageInput.value = "";

        const category = categorySelect.value;
        const path = savedImages.get(category);

        displayPreview(path ? getPublicUrl(path) : "");
    }

    async function loadSavedImages() {
        const { data, error } = await supabaseClient
            .from(TABLE)
            .select("category_name,image_path");

        if (error) {
            console.error("Category image load error:", error);
            alert("Unable to load saved category images.");
            return;
        }

        savedImages = new Map(
            (data || []).map(item => [
                item.category_name,
                item.image_path
            ])
        );

        updatePreview();
    }

    imageInput.addEventListener("change", () => {
        clearTemporaryPreview();

        const file = imageInput.files?.[0];

        if (!file) {
            updatePreview();
            return;
        }

        const allowed = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowed.includes(file.type)) {
            alert("Only JPG, PNG, and WebP images are allowed.");
            imageInput.value = "";
            return;
        }

        if (file.size > 300 * 1024) {
            showCategoryToast(
                "Image Too Large",
                "Maximum image size is 300 KB.",
                "error"
            );

            imageInput.value = "";
            updatePreview();
            return;
        }

        temporaryPreviewUrl = URL.createObjectURL(file);
        displayPreview(temporaryPreviewUrl);
    });

    categorySelect.addEventListener("change", updatePreview);

    saveBtn.addEventListener("click", async () => {
        const category = categorySelect.value;
        const file = imageInput.files?.[0];

        if (!category) {
            alert("Please select a category.");
            return;
        }

        if (!file) {
            alert("Please select an image.");
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = "Uploading...";

        let newPath = "";

        try {
            const extension = file.type === "image/png"
                ? "png"
                : file.type === "image/webp"
                    ? "webp"
                    : "jpg";

            newPath = `${crypto.randomUUID()}.${extension}`;

            const { error: uploadError } =
                await supabaseClient.storage
                    .from(BUCKET)
                    .upload(newPath, file, {
                        contentType: file.type,
                        upsert: false
                    });

            if (uploadError) throw uploadError;

            const { error: saveError } =
                await supabaseClient
                    .from(TABLE)
                    .upsert({
                        category_name: category,
                        image_path: newPath,
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: "category_name"
                    });

            if (saveError) {
                await supabaseClient.storage
                    .from(BUCKET)
                    .remove([newPath]);

                throw saveError;
            }

            const previousPath = savedImages.get(category);

            savedImages.set(category, newPath);
            updatePreview();

            if (previousPath && previousPath !== newPath) {
                const { error: cleanupError } =
                    await supabaseClient.storage
                        .from(BUCKET)
                        .remove([previousPath]);

                if (cleanupError) {
                    console.warn("Old image cleanup failed:", cleanupError);
                }
            }

            showCategoryToast(
                "Upload Successful",
                "Category image saved successfully!",
                "success"
            );

        } catch (error) {
            console.error("Save category image error:", error);

            showCategoryToast(
                "Upload Failed",
                error.message || "Unable to save category image.",
                "error"
            );

        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Image";
        }
    });

    removeBtn.addEventListener("click", async () => {
        const category = categorySelect.value;

        if (!category) {
            alert("Please select a category.");
            return;
        }

        const oldPath = savedImages.get(category);

        if (!oldPath) {
            alert("This category already uses automatic images.");
            return;
        }

        if (!confirm("Use automatic product image instead?")) {
            return;
        }

        removeBtn.disabled = true;

        try {
            const { error } = await supabaseClient
                .from(TABLE)
                .delete()
                .eq("category_name", category);

            if (error) throw error;

            savedImages.delete(category);
            updatePreview();

            const { error: cleanupError } =
                await supabaseClient.storage
                    .from(BUCKET)
                    .remove([oldPath]);

            if (cleanupError) {
                console.warn("Image cleanup failed:", cleanupError);
            }

            alert("Automatic image mode restored!");

        } catch (error) {
            console.error(error);
            alert(error.message || "Failed to remove custom image.");

        } finally {
            removeBtn.disabled = false;
        }
    });

    document.querySelector(
        '[data-section="settingsSection"]'
    )?.addEventListener("click", () => {
        populateCategories();
    });

    populateCategories();
    loadSavedImages();

})();
