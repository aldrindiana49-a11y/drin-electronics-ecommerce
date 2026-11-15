
/* DRIN ELECTRONICS - STAFF DASHBOARD */

(() => {
    const welcome = document.getElementById("staffWelcome");
    const logoutBtn = document.getElementById("staffLogoutBtn");

    if (!welcome || !logoutBtn) return;

    async function checkStaffAccess() {
        logoutBtn.disabled = true;
        welcome.textContent = "Checking staff access...";

        try {
            // Verify the authenticated user
            const { data: { user }, error: authError } =
                await supabaseClient.auth.getUser();

            if (authError || !user) {
                window.location.replace("./staff-login.html");
                return;
            }

            // Verify staff account and role
            const { data: staff, error: staffError } =
                await supabaseClient
                    .from("staff_users")
                    .select("full_name, role, is_active")
                    .eq("id", user.id)
                    .maybeSingle();

            if (
                staffError ||
                !staff ||
                !staff.is_active ||
                !["moderator", "staff"].includes(staff.role)
            ) {
                await supabaseClient.auth.signOut({ scope: "local" });
                window.location.replace("./staff-login.html");
                return;
            }

            welcome.textContent =
                `Welcome, ${staff.full_name}! Role: ${staff.role}`;

            logoutBtn.disabled = false;


            const ordersContent =
                document.getElementById("staffOrdersContent");

            if (ordersContent) {
                ordersContent.textContent = "Loading orders...";

                try {
                    const { data: { session } } =
                        await supabaseClient.auth.getSession();

                    if (!session?.access_token) {
                        throw new Error("Please log in again.");
                    }

                    const response = await fetch(
                        "http://localhost:3000/api/staff/orders",
                        {
                            headers: {
                                Authorization: `Bearer ${session.access_token}`
                            }
                        }
                    );

                    const contentType =
                        response.headers.get("content-type") || "";

                    if (!contentType.includes("application/json")) {
                        throw new Error(
                            `Staff Orders API unavailable (HTTP ${response.status}). Check backend deployment.`
                        );
                    }

                    const result = await response.json();

                    if (!response.ok || !result.success) {
                        throw new Error(
                            result.message || "Failed to load orders."
                        );
                    }

                    const orders = result.orders || [];

                    const groups = {
                        orders: [],
                        pickup: [],
                        roro: []
                    };

                    orders.forEach(order => {
                        const courier = String(
                            order.courier || ""
                        ).toLowerCase();

                        if (courier.includes("store pickup")) {
                            groups.pickup.push(order);
                        } else if (
                            courier.includes("roro") ||
                            courier.includes("manual freight")
                        ) {
                            groups.roro.push(order);
                        } else {
                            groups.orders.push(order);
                        }
                    });

                    function showOrders(tab) {
                        ordersContent.replaceChildren();

                        const selected = groups[tab] || [];

                        if (selected.length === 0) {
                            ordersContent.textContent = "No orders found.";
                            return;
                        }

                        selected.forEach(order => {
                            const card = document.createElement("div");
                            card.className = "warehouse-order-card";

                            const title = document.createElement("h3");
                            title.textContent =
                                order.external_id || "Order";

                            const customer = document.createElement("p");
                            customer.textContent =
                                `Customer: ${order.customer_name || "-"}`;

                            const status = document.createElement("p");
                            status.textContent =
                                `Status: ${order.order_status || "-"}`;

                            const amount = document.createElement("p");
                            amount.textContent =
                                `Amount: ₱${Number(order.amount || 0).toLocaleString("en-PH")}`;


                            const itemsBox = document.createElement("div");
                            itemsBox.className = "staff-order-items";

                            const items = Array.isArray(order.items)
                                ? order.items
                                : [];

                            const itemsHeading = document.createElement("h4");
                            itemsHeading.textContent = "Products";
                            itemsBox.appendChild(itemsHeading);

                            if (items.length === 0) {
                                const empty = document.createElement("p");
                                empty.textContent = "No product details found.";
                                itemsBox.appendChild(empty);
                            } else {
                                items.forEach(item => {
                                    const product = document.createElement("p");

                                    const name =
                                        item.name ||
                                        item.product_name ||
                                        item.title ||
                                        "Product";

                                    const variation =
                                        item.variantLabel ||
                                        item.variant ||
                                        item.variation ||
                                        "";

                                    const quantity =
                                        item.quantity ||
                                        item.qty ||
                                        1;

                                    product.textContent =
                                        `${name}${variation ? " - " + variation : ""} × ${quantity}`;

                                    itemsBox.appendChild(product);
                                });
                            }

                            card.append(title, customer, status, amount, itemsBox);


                            ordersContent.appendChild(card);
                        });
                    }

                    document.querySelectorAll(
                        ".staff-order-tabs button"
                    ).forEach(button => {
                        button.addEventListener("click", () => {
                            showOrders(button.dataset.tab);
                        });
                    });

                    showOrders("orders");

                } catch (error) {
                    console.error("Staff orders error:", error);
                    ordersContent.textContent = error.message;
                }
            }


        } catch (error) {
            console.error("Staff access error:", error);
            window.location.replace("./staff-login.html");
        }
    }

    logoutBtn.addEventListener("click", async () => {
        logoutBtn.disabled = true;

        await supabaseClient.auth.signOut({ scope: "local" });

        window.location.replace("./staff-login.html");
    });

    checkStaffAccess();
})();
