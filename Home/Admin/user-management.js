
/* =========================================
   DRIN ELECTRONICS
   USERS / MODERATORS MANAGEMENT
========================================= */

(() => {
    const form = document.getElementById("addUserForm");
    const nameInput = document.getElementById("newUserName");
    const emailInput = document.getElementById("newUserEmail");
    const roleInput = document.getElementById("newUserRole");
    const createBtn = document.getElementById("createUserBtn");

    if (!form || !nameInput || !emailInput ||
        !roleInput || !createBtn) {
        console.warn("User Management HTML not found.");
        return;
    }

    function notify(message, type = "success") {
        if (typeof showToast === "function") {
            showToast(message, type);
        } else {
            alert(message);
        }
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const fullName = nameInput.value.trim();
        const email = emailInput.value.trim().toLowerCase();
        const role = roleInput.value;

        if (!fullName || !email) {
            notify("Please complete all required fields.", "warning");
            return;
        }

        if (!["moderator", "staff"].includes(role)) {
            notify("Please select a valid user role.", "warning");
            return;
        }

        createBtn.disabled = true;
        createBtn.textContent = "Creating User...";

        try {
            const { data: { user }, error: authError } =
                await supabaseClient.auth.getUser();

            if (authError || !user) {
                throw new Error("Please log in as admin.");
            }

            // UI check only. Backend must verify admin role too.
            const { data: admin, error: adminError } =
                await supabaseClient
                    .from("admin_users")
                    .select("role")
                    .eq("id", user.id)
                    .eq("role", "admin")
                    .single();

            if (adminError || !admin) {
                throw new Error("Admin permission required.");
            }

            // Secure backend function (to be created next)
            const { data, error } =
                await supabaseClient.functions.invoke(
                    "create-staff-user",
                    {
                        body: {
                            fullName,
                            email,
                            role
                        }
                    }
                );

            if (error) throw error;

            if (!data?.success) {
                throw new Error(
                    data?.error || "Account creation failed."
                );
            }

            notify("User invitation created successfully!", "success");

            form.reset();

        } catch (error) {
            console.error("Create user failed:", error);

            notify(
                error.message || "Failed to create user.",
                "error"
            );

        } finally {
            createBtn.disabled = false;
            createBtn.textContent = "+ Create User";
        }
    });

    console.log("User Management module initialized.");
})();
