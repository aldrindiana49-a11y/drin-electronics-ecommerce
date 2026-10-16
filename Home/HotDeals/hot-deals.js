(function () {
    const section = document.getElementById("hotDealsSection");
    if (!section) return;

    function safeNumber(value) {
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
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
        return `₱${safeNumber(value).toLocaleString()}`;
    }

    function getBestDeal(product) {
        let original = safeNumber(product.price);
        let discount = safeNumber(product.discountPrice || product.discount_price);

        if (Array.isArray(product.variants) && product.variants.length) {
            product.variants.forEach((variant) => {
                const vOriginal = safeNumber(variant.price);
                const vDiscount = safeNumber(variant.discountPrice || variant.discount_price);

                if (vOriginal > 0 && vDiscount > 0 && vDiscount < vOriginal) {
                    const currentPercent =
                        original > 0 && discount > 0
                            ? ((original - discount) / original) * 100
                            : 0;

                    const variantPercent = ((vOriginal - vDiscount) / vOriginal) * 100;

                    if (variantPercent > currentPercent) {
                        original = vOriginal;
                        discount = vDiscount;
                    }
                }
            });
        }

        if (!(original > 0 && discount > 0 && discount < original)) {
            return null;
        }

        const savings = original - discount;
        const percent = Math.round((savings / original) * 100);

        return {
            original,
            discount,
            savings,
            percent
        };
    }

    function getImage(product) {
        if (product.image) return product.image;
        if (Array.isArray(product.images) && product.images.length) return product.images[0];
        if (Array.isArray(product.variants) && product.variants[0]?.image) return product.variants[0].image;

        return "https://via.placeholder.com/400x400?text=No+Image";
    }

    function getStock(product) {
        if (Array.isArray(product.variants) && product.variants.length) {
            return product.variants.reduce(
                (sum, v) => sum + safeNumber(v.stock),
                0
            );
        }

        return safeNumber(product.stock);
    }

    function getHotDeals(productList = []) {
        return productList
            .filter(product => getStock(product) > 0)
            .map((product) => {
                const deal = getBestDeal(product);
                return deal ? { ...product, deal } : null;
            })
            .filter(Boolean)
            .sort((a, b) => b.deal.percent - a.deal.percent)
            .slice(0, 10);
    }

    function renderHotDeals(productList = []) {
        const deals = getHotDeals(productList);

        if (!deals.length) {
            section.innerHTML = "";
            return;
        }

        section.innerHTML = `
        <div class="hot-deals-outer">

            <button class="hot-deals-outside-btn hot-deals-outside-prev"
                    type="button"
                    onclick="scrollHotDeals(-1)">
                ‹
            </button>

            <div class="hot-deals-wrap">

                <div class="hot-deals-header">
                    <div>
                        <h2>🔥 Hot Deals</h2>
                        <p>Best price deals and biggest discounts today</p>
                    </div>
                </div>

                <div class="hot-deals-row" id="hotDealsRow">
                    ${deals.map((product) => `
                        <div class="hot-deal-card" data-id="${escapeHtml(product.id)}">

                            <div class="hot-deal-badge">-${product.deal.percent}%</div>

                            <div class="hot-deal-image">
                                <img
                                  loading="lazy"
                                  src="${escapeHtml(getImage(product))}"
                                  alt="${escapeHtml(product.name)}"
                                  onerror="this.src='https://via.placeholder.com/400x400?text=No+Image'"
                                >
                            </div>

                            <div class="hot-deal-info">
                                <span class="hot-deal-category">${escapeHtml(product.category || "Product")}</span>
                                <h3>${escapeHtml(product.name || "Unnamed Product")}</h3>

                                <div class="hot-deal-prices">
                                    <span class="hot-deal-current">${formatPrice(product.deal.discount)}</span>
                                    <span class="hot-deal-old">${formatPrice(product.deal.original)}</span>
                                </div>

                                <div class="hot-deal-save">
                                    Save ${formatPrice(product.deal.savings)}
                                </div>
                            </div>

                        </div>
                    `).join("")}
                </div>

            </div>

            <button class="hot-deals-outside-btn hot-deals-outside-next"
                    type="button"
                    onclick="scrollHotDeals(1)">
                ›
            </button>

        </div>
        `;

        section.querySelectorAll(".hot-deal-card").forEach((card) => {
            card.addEventListener("click", () => {
                const id = card.dataset.id;
                const product = deals.find((item) => String(item.id) === String(id));
                if (!product) return;

                localStorage.setItem("selectedProduct", JSON.stringify(product));
                localStorage.setItem("selectedProductId", product.id);

                window.location.href = `./Product/index.html?id=${encodeURIComponent(product.id)}`;
            });
        });
    }

    window.scrollHotDeals = function (direction) {
        const row = document.getElementById("hotDealsRow");
        if (!row) return;

        row.scrollBy({
            left: direction * 360,
            behavior: "smooth"
        });
    };

    window.renderHotDeals = renderHotDeals;
})();