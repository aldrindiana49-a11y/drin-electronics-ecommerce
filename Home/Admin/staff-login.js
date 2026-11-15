
/* DRIN ELECTRONICS - STAFF LOGIN */

(() => {
    const form = document.getElementById("staffLoginForm");
    const emailInput = document.getElementById("staffEmail");
    const passwordInput = document.getElementById("staffPassword");
    const loginBtn = document.getElementById("staffLoginBtn");
    const message = document.getElementById("staffLoginMessage");

    if (!form || !emailInput || !passwordInput ||
        !loginBtn || !message) return;

    function showMessage(text, isError = false) {
        message.textContent = text;
        message.style.color = isError ? "#dc2626" : "#047857";
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value;

        loginBtn.disabled = true;
        loginBtn.textContent = "Signing in...";
        showMessage("");

        try {
            // Step 1: Authenticate with Supabase
            const { data, error: loginError } =
                await supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });

            if (loginError || !data.user) {
                throw new Error("Invalid email or password.");
            }

            // Step 2: Verify staff role
            const { data: staff, error: staffError } =
                await supabaseClient
                    .from("staff_users")
                    .select("role, is_active")
                    .eq("id", data.user.id)
                    .maybeSingle();

            if (staffError || !staff) {
                await supabaseClient.auth.signOut({ scope: "local" });
                throw new Error("This account is not registered as staff.");
            }

            if (!staff.is_active) {
                await supabaseClient.auth.signOut({ scope: "local" });
                throw new Error("Your staff account is disabled.");
            }

            if (!["moderator", "staff"].includes(staff.role)) {
                await supabaseClient.auth.signOut({ scope: "local" });
                throw new Error("Invalid staff role.");
            }

            showMessage("Login successful!");

            window.location.replace("./index.html");

            // Temporary: No staff dashboard redirect yet.
            // We will connect a role-restricted dashboard next.

        } catch (error) {
            showMessage(
                error.message || "Unable to sign in.",
                true
            );
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = "Login";
        }
    });
})();
