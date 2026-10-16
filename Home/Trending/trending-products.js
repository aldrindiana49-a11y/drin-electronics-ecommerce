(function () {
  const section = document.getElementById("trendingProductsSection");
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

  function getStock(product) {
    if (Array.isArray(product.variants) && product.variants.length) {
      return product.variants.reduce((sum, v) => sum + safeNumber(v.stock), 0);
    }
    return safeNumber(product.stock);
  }

  function getSold(product) {
    return safeNumber(product.sold_count || product.soldCount || product.sold);
  }

  function getPrice(product) {
    if (Array.isArray(product.variants) && product.variants.length) {
      const inStock = product.variants.find(v => safeNumber(v.stock) > 0) || product.variants[0];
      return inStock.discountPrice || inStock.price || 0;
    }
    return product.discountPrice || product.price || 0;
  }

  function getImage(product) {
    if (product.image) return product.image;
    if (Array.isArray(product.images) && product.images.length) return product.images[0];
    if (Array.isArray(product.variants) && product.variants[0]?.image) return product.variants[0].image;
    return "https://via.placeholder.com/400x400?text=No+Image";
  }

  function getTrendingProducts(productList = []) {
    return [...productList]
      .filter(product => getStock(product) > 0)
      .sort((a, b) => getSold(b) - getSold(a))
      .slice(0, 10);
  }

  function renderTrendingProducts(productList = []) {
    const products = getTrendingProducts(productList);

    if (!products.length) {
      section.innerHTML = "";
      return;
    }

    section.innerHTML = `
      <div class="trending-outer">
        <button class="trending-outside-btn trending-outside-prev" type="button" onclick="scrollTrendingProducts(-1)">
         ‹
       </button>

        <div class="trending-products-wrap">
          <div class="trending-products-header">
            <div>
              <h2>🔥 Trending Products</h2>
              <p>Top 10 best-selling products</p>
            </div>
          </div>

          <div class="trending-products-row" id="trendingProductsRow">
            ${products.map((product, index) => `
              <div class="trending-product-card" data-id="${escapeHtml(product.id)}">
                <div class="trending-rank">#${index + 1}</div>

                <div class="trending-image">
                  <img
                    src="${escapeHtml(getImage(product))}"
                    alt="${escapeHtml(product.name)}"
                    onerror="this.src='https://via.placeholder.com/400x400?text=No+Image'"
                  >
                </div>

                <div class="trending-info">
                  <span class="trending-category">${escapeHtml(product.category || "Product")}</span>
                  <h3>${escapeHtml(product.name || "Unnamed Product")}</h3>
                  <div class="trending-price">${formatPrice(getPrice(product))}</div>
                  <div class="trending-meta">
                    🔥 Sold ${getSold(product)}
                  </div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>

        <button class="trending-outside-btn trending-outside-next" type="button" onclick="scrollTrendingProducts(1)">
          ›
        </button>
      </div>
    `;

    section.querySelectorAll(".trending-product-card").forEach(card => {
      card.addEventListener("click", () => {
        const id = card.dataset.id;
        const product = products.find(p => String(p.id) === String(id));
        if (!product) return;

        localStorage.setItem("selectedProduct", JSON.stringify(product));
        localStorage.setItem("selectedProductId", product.id);

        window.location.href = `./Product/index.html?id=${encodeURIComponent(product.id)}`;
      });
    });
  }

  window.scrollTrendingProducts = function (direction) {
    const row = document.getElementById("trendingProductsRow");
    if (!row) return;

    row.scrollBy({
      left: direction * 360,
      behavior: "smooth"
    });
  };

  window.renderTrendingProducts = renderTrendingProducts;
})();