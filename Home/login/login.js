async function claimGuestOrdersAfterAuthentication() {
  try {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError) {
      console.error("GET USER ERROR:", userError);
      return 0;
    }

    if (!user) {
      console.log("No authenticated user.");
      return 0;
    }

    const { data, error } =
      await supabaseClient.rpc("claim_guest_orders");

    if (error) {
      console.error("CLAIM GUEST ORDERS ERROR:", error);
      return 0;
    }

    console.log(`${data || 0} guest order(s) synced.`);

    return Number(data || 0);
  } catch (error) {
    console.error("GUEST ORDER SYNC ERROR:", error);
    return 0;
  }
}

const loginForm =
  document.getElementById("loginForm");

const emailInput = document.getElementById("email");

emailInput?.addEventListener("input", () => {
  emailInput.value = emailInput.value
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[^a-z0-9@._+-]/g, "");
});

const googleLoginBtn =
  document.getElementById("googleLoginBtn");

const facebookLoginBtn =
  document.getElementById("facebookLoginBtn");

const params =
  new URLSearchParams(window.location.search);

const redirect =
  params.get("redirect") ||
  "https://drinelectronicsph.com/";

googleLoginBtn?.addEventListener("click", async () => {

  const { error } =
    await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirect
      }
    });

  if (error) {
    await showPremiumAlert({
      title: "Google Login Failed",
      message: "Unable to sign in with Google right now. Please try again in a few moments.",
      icon: "⚠️",
      confirmText: "Try Again"
    });
    return;
  }

});

facebookLoginBtn?.addEventListener("click", async () => {

  const { error } =
    await supabaseClient.auth.signInWithOAuth({
      provider: "facebook",
      options: {
        redirectTo: redirect
      }
    });

  if (error) {
    await showPremiumAlert({
      title: "Facebook Login Failed",
      message: "Unable to sign in with Facebook at the moment. Please try again later.",
      icon: "⚠️",
      confirmText: "Try Again"
    });
    return;
  }

});

loginForm.addEventListener("submit", async (e) => {

  e.preventDefault();

  const email =
    document.getElementById("email").value
      .trim()
      .toLowerCase();

  const password =
    document.getElementById("password").value;

  const loginBtn =
    document.querySelector(".login-btn");

  loginBtn.disabled = true;
  loginBtn.innerHTML =
    '<span class="loading-spinner"></span>';

  const { error } =
    await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    loginBtn.disabled = false;
    loginBtn.innerHTML = "Login";

    await showPremiumAlert({
      title: "Invalid Login",
      message: "The email address or password you entered is incorrect. Please check your login details and try again.",
      icon: "⚠️",
      confirmText: "Try Again"
    });
    return;
  }

  await claimGuestOrdersAfterAuthentication();

  localStorage.removeItem(
    "drinCustomerCheckoutInfo"
  );

  localStorage.removeItem(
    "drinCheckoutItems"
  );

  localStorage.removeItem(
    "drinCart"
  );


  window.location.href = redirect || "/";

});

function togglePassword(id, el) {



  const input =
    document.getElementById(id);

  if (input.type === "password") {
    input.type = "text";
    el.innerHTML = '<i class="fa-solid fa-eye"></i>';
  } else {
    input.type = "password";
    el.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
  }

}

function showPremiumAlert({
  title,
  message,
  icon = "🔐",
  confirmText = "OK",
  cancelText = "Cancel",
  showCancel = false
}) {

  return new Promise((resolve) => {

    const modal =
      document.getElementById("premiumAlert");

    const titleEl =
      document.getElementById("premiumAlertTitle");

    const messageEl =
      document.getElementById("premiumAlertMessage");

    const iconEl =
      modal.querySelector(".premium-alert-icon");

    const cancelBtn =
      document.getElementById("premiumAlertCancel");

    const confirmBtn =
      document.getElementById("premiumAlertConfirm");

    titleEl.textContent = title;

    messageEl.textContent = message;

    iconEl.textContent = icon;

    confirmBtn.textContent = confirmText;

    cancelBtn.textContent = cancelText;

    cancelBtn.style.display =
      showCancel ? "block" : "none";

    modal.classList.add("show");

    confirmBtn.onclick = () => {

      modal.classList.remove("show");

      resolve(true);

    };

    cancelBtn.onclick = () => {

      modal.classList.remove("show");

      resolve(false);

    };

  });

}

const forgotPasswordBtn =
  document.getElementById("forgotPasswordBtn");

forgotPasswordBtn?.addEventListener(
  "click",
  async (e) => {

    e.preventDefault();

    const email =
      document.getElementById("email").value
        .trim()
        .toLowerCase();

    if (!email) {

      await showPremiumAlert({
        title: "Email Required",
        message: "Please enter your email address first before requesting a password reset.",
        icon: "📧",
        confirmText: "OK"
      });

      return;
    }

    const confirmReset =
      await showPremiumAlert({
        title: "Reset Password",
        message: `We will send a password reset link to ${email}. Continue?`,
        icon: "🔐",
        confirmText: "Send Link",
        cancelText: "Cancel",
        showCancel: true
      });

    if (!confirmReset) return;


    const confirmBtn =
      document.getElementById("premiumAlertConfirm");

    confirmBtn.disabled = true;
    confirmBtn.innerHTML =
      `<span class="loading-spinner"></span>`;
    const { error } =
      await supabaseClient.auth.resetPasswordForEmail(
        email,
        {
          redirectTo:
            "https://drinelectronicsph.com/reset-password/"
        }
      );

    confirmBtn.disabled = false;

    confirmBtn.textContent =
      "Send Link";

    if (error) {

      await showPremiumAlert({
        title: "Reset Failed",
        message: error.message,
        icon: "⚠️",
        confirmText: "OK"
      });

      return;
    }

    await showPremiumAlert({
      title: "Check Your Email",
      message: "Password reset link sent successfully. Please check your inbox or spam folder.",
      icon: "✅",
      confirmText: "Got it"
    });

  }
);

window.addEventListener("load", async () => {
  try {
    const {
      data: { session }
    } = await supabaseClient.auth.getSession();

    if (!session?.user) return;

    await claimGuestOrdersAfterAuthentication();
  } catch (error) {
    console.error("AUTO CLAIM GUEST ORDER ERROR:", error);
  }
});