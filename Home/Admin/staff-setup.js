
/* =========================================
   DRIN ELECTRONICS
   STAFF INVITATION & PASSWORD SETUP
========================================= */

(() => {
    const form = document.getElementById("staffSetupForm");
    const passwordInput = document.getElementById("staffPassword");
    const confirmInput = document.getElementById("staffConfirmPassword");
    const setupBtn = document.getElementById("staffSetupBtn");
    const message = document.getElementById("staffSetupMessage");

    if (!form || !passwordInput || !confirmInput ||
        !setupBtn || !message) return;

    let verifiedUserId = null;

    function showMessage(text, error = false) {
        message.textContent = text;
        message.style.color = error ? "#dc2626" : "#047857";
    }

    async function verifyInvitation() {
        setupBtn.disabled = true;
        showMessage("Verifying your staff account...");

        try {
            // Supabase may process the invitation URL
            // automatically and establish a session.
            const { data: { session }, error: sessionError } =
                await supabaseClient.auth.getSession();

            if (sessionError || !session) {
                throw new Error(
                    "Invitation session not found. Open your invitation email link."
                );
            }

            // Verify identity against Supabase Auth.
            const { data: { user }, error: authError } =
                await supabaseClient.auth.getUser();

            if (authError || !user) {
                throw new Error("Unable to verify your account.");
            }

            // Only registered, active staff may use this page.
            const { data: staff, error: staffError } =
                await supabaseClient
                    .from("staff_users")
                    .select("id,role,is_active")
                    .eq("id", user.id)
                    .single();

            if (staffError || !staff) {
                throw new Error("No staff account found for this login.");
            }

            if (!staff.is_active) {
                throw new Error("Your staff account is disabled.");
            }

            if (!["moderator", "staff"].includes(staff.role)) {
                throw new Error("Invalid staff role.");
            }

            verifiedUserId = user.id;
            setupBtn.disabled = false;

            showMessage("Account verified. You can set your password.");

        } catch (error) {
            verifiedUserId = null;
            setupBtn.disabled = true;
            showMessage(error.message, true);
        }
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!verifiedUserId) {
            showMessage("Verify your invitation first.", true);
            return;
        }

        const password = passwordInput.value;
        const confirmPassword = confirmInput.value;

        if (password.length < 8) {
            showMessage("Password must have at least 8 characters.", true);
            return;
        }

        if (password !== confirmPassword) {
            showMessage("Passwords do not match.", true);
            return;
        }

        setupBtn.disabled = true;
        setupBtn.textContent = "Saving Password...";

        try {
            const { data: { user }, error: authError } =
                await supabaseClient.auth.getUser();

            if (authError || user?.id !== verifiedUserId) {
                throw new Error("Your login session has changed.");
            }

            const { error } = await supabaseClient.auth.updateUser({
                password
            });

            if (error) throw error;

            form.reset();
            showMessage("Password saved successfully! Your account is ready.");
            setupBtn.textContent = "Password Saved";

        } catch (error) {
            showMessage(error.message || "Password setup failed.", true);
            setupBtn.disabled = false;
            setupBtn.textContent = "Set Password";
        }
    });

    verifyInvitation();
})();
