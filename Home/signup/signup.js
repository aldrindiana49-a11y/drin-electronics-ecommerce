const signupForm =
    document.getElementById("signupForm");

// EMAIL AUTO LOWERCASE AND CHARACTER FILTER
const emailInput =
    document.getElementById("email");

emailInput?.addEventListener("input", () => {
    emailInput.value = emailInput.value
        .toLowerCase()
        .replace(/\s/g, "")
        .replace(/[^a-z0-9@._+-]/g, "");
});

const googleSignupBtn =
    document.getElementById("googleSignupBtn");

googleSignupBtn.addEventListener("click", async () => {

    const { error } =
        await supabaseClient.auth.signInWithOAuth({

            provider: "google",

            options: {
                redirectTo: "https://drinelectronicsph.com/"
            }

        });

    if (error) {
        alert(error.message);
    }

});

signupForm.addEventListener("submit", async (e) => {

    e.preventDefault();

    const name =
        document.getElementById("name").value;

    const email =
        document.getElementById("email").value
            .trim()
            .toLowerCase();

    const password =
        document.getElementById("password").value;

    const confirmPassword =
        document.getElementById("confirmPassword").value;

    const signupBtn =
        document.querySelector(".signup-btn");

    signupBtn.disabled = true;

    signupBtn.innerHTML =
        '<span class="loading-spinner"></span>';

    if (password !== confirmPassword) {
        signupBtn.disabled = false;
        signupBtn.innerHTML = "Create Account";

        showPasswordMismatchPopup();
        return;
    }

    const { data: existingProfile, error: checkError } =
        await supabaseClient
            .from("signup_emails")
            .select("email")
            .eq("email", email)
            .maybeSingle();

    if (checkError) {
        signupBtn.disabled = false;
        signupBtn.innerHTML = "Create Account";

        alert(checkError.message);
        return;
    }

    if (existingProfile) {
        signupBtn.disabled = false;
        signupBtn.innerHTML = "Create Account";

        showEmailExistsPopup();
        return;
    }

    const { data, error } =

        await supabaseClient.auth.signUp({

            email,
            password,

            options: {
                data: {
                    full_name: name
                },

                emailRedirectTo:
                    "https://drinelectronicsph.com/"
            }

        });

    if (error) {

        if (
            error.message.toLowerCase().includes("already") ||
            error.message.toLowerCase().includes("registered") ||
            error.message.toLowerCase().includes("exists")
        ) {
            signupBtn.disabled = false;
            signupBtn.innerHTML = "Create Account";

            showEmailExistsPopup();
            return;
        }

        signupBtn.disabled = false;
        signupBtn.innerHTML = "Create Account";

        alert(error.message);
        return;
    }

    const { error: signupEmailError } =
        await supabaseClient
            .from("signup_emails")
            .insert({
                email: email,
                full_name: name
            });

    if (signupEmailError) {
        signupBtn.disabled = false;
        signupBtn.innerHTML = "Create Account";

        showEmailExistsPopup();
        return;
    }

    signupBtn.disabled = false;
    signupBtn.innerHTML = "Create Account";

    showSignupSuccessPopup();

});


function togglePassword(id, el) {

    const input =
        document.getElementById(id);

    if (!input) return;

    if (input.type === "password") {

        input.type = "text";
        el.innerHTML = '<i class="fa-solid fa-eye"></i>';

    } else {

        input.type = "password";
        el.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';

    }

}

function showSignupSuccessPopup() {
    const popup =
        document.getElementById("signupSuccessPopup");

    const checkEmailBtn =
        document.getElementById("checkEmailBtn");

    if (!popup) return;

    popup.classList.add("active");

    if (checkEmailBtn) {
        checkEmailBtn.onclick = () => {
            window.location.href =
                "https://drinelectronicsph.com/";
        };
    }
}

function showEmailExistsPopup() {
    const popup =
        document.getElementById("emailExistsPopup");

    const goToLoginBtn =
        document.getElementById("goToLoginBtn");

    const useDifferentEmailBtn =
        document.getElementById("useDifferentEmailBtn");

    if (!popup) return;

    popup.classList.add("active");

    if (goToLoginBtn) {
        goToLoginBtn.onclick = () => {
            window.location.href =
                "https://drinelectronicsph.com/login/";
        };
    }

    if (useDifferentEmailBtn) {
        useDifferentEmailBtn.onclick = () => {
            popup.classList.remove("active");

            const emailInput =
                document.getElementById("email");

            if (emailInput) {
                emailInput.value = "";
                emailInput.focus();
            }
        };
    }
}

function showPasswordMismatchPopup() {
    const popup =
        document.getElementById("passwordMismatchPopup");

    const retryPasswordBtn =
        document.getElementById("retryPasswordBtn");

    if (!popup) return;

    popup.classList.add("active");

    if (retryPasswordBtn) {
        retryPasswordBtn.onclick = () => {
            popup.classList.remove("active");

            const confirmPasswordInput =
                document.getElementById("confirmPassword");

            if (confirmPasswordInput) {
                confirmPasswordInput.value = "";
                confirmPasswordInput.focus();
            }
        };
    }
}