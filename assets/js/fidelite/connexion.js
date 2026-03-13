/* =====================================================
   connexion.js
   Logique de la page connexion / inscription.
   Chargé en type="module" depuis connexion.html.
   ===================================================== */

import { inscrire, connecter, motDePasseOublie, getUser, traduireErreur } from "./auth.js";


/* ════════════════════════════════════════════════════
   INIT — s'exécute dès le chargement du module
   (les modules ES sont automatiquement différés,
    le DOM est garanti prêt à ce stade)
════════════════════════════════════════════════════ */

init();

async function init() {

    /* Redirige si déjà connecté */
    const user = await getUser();
    if (user) {
        window.location.href = "/pages/fidelite/espace-client.html";
        return;
    }

    /* Bannière email confirmé (?confirmed=1 dans l'URL) */
    const params = new URLSearchParams(window.location.search);
    if (params.get("confirmed") === "1") {
        document.getElementById("confirmed-banner").classList.add("visible");
    }

    /* Bascule sur l'onglet inscription si demandé */
    if (params.get("tab") === "inscription") {
        switchTab("inscription");
    }

    bindTabs();
    bindPwdToggles();
    bindPwdStrength();
    bindParrainUppercase();
    bindFormConnexion();
    bindFormInscription();
    bindForgotPassword();
}


/* ════════════════════════════════════════════════════
   ONGLETS
════════════════════════════════════════════════════ */

function switchTab(target) {
    document.querySelectorAll(".auth-tab").forEach(t => {
        t.classList.toggle("active", t.dataset.tab === target);
    });
    document.querySelectorAll(".auth-form").forEach(f => {
        f.classList.toggle("active", f.id === `form-${target}`);
    });
    clearMsg();
}

function bindTabs() {
    document.querySelectorAll(".auth-tab").forEach(tab => {
        tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });
}


/* ════════════════════════════════════════════════════
   AFFICHER / MASQUER MOT DE PASSE
════════════════════════════════════════════════════ */

function bindPwdToggles() {
    document.querySelectorAll(".pwd-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
            const input = document.getElementById(btn.dataset.target);
            const isHidden = input.type === "password";
            input.type = isHidden ? "text" : "password";
            btn.textContent = isHidden ? "🙈" : "👁";
        });
    });
}


/* ════════════════════════════════════════════════════
   INDICATEUR FORCE MOT DE PASSE
════════════════════════════════════════════════════ */

const STRENGTH_LABELS = ["", "Trop court", "Faible", "Moyen", "Fort"];

function bindPwdStrength() {
    const input = document.getElementById("reg-password");
    if (!input) return;

    input.addEventListener("input", () => {
        const val = input.value;
        let level = 0;
        if (val.length >= 8) level++;
        if (/[A-Z]/.test(val) && /[a-z]/.test(val)) level++;
        if (/\d/.test(val)) level++;
        if (/[^A-Za-z0-9]/.test(val)) level++;
        if (val.length === 0) level = 0;

        document.getElementById("pwd-strength").dataset.level = level;
        document.getElementById("pwd-strength-label").textContent =
            val.length > 0 ? STRENGTH_LABELS[level] : "";
    });
}


/* ════════════════════════════════════════════════════
   CODE PARRAINAGE EN MAJUSCULES
════════════════════════════════════════════════════ */

function bindParrainUppercase() {
    const input = document.getElementById("reg-parrain");
    if (!input) return;
    input.addEventListener("input", function () {
        const pos = this.selectionStart;
        this.value = this.value.toUpperCase();
        this.setSelectionRange(pos, pos);
    });
}


/* ════════════════════════════════════════════════════
   HELPERS UI
════════════════════════════════════════════════════ */

function showMsg(text, type = "error") {
    const box = document.getElementById("auth-msg");
    box.textContent = text;
    box.className = `auth-message ${type}`;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearMsg() {
    const box = document.getElementById("auth-msg");
    box.className = "auth-message";
    box.textContent = "";
}

function setLoading(btn, loading, label) {
    btn.disabled = loading;
    btn.innerHTML = loading
        ? `<span class="spinner"></span> Chargement…`
        : label;
}

function fieldError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("visible", !!msg);

    /* Marque l'input parent comme invalide */
    const wrap = el.closest(".form-group");
    const input = wrap?.querySelector("input");
    if (input) input.classList.toggle("invalid", !!msg);
}

function clearFieldErrors() {
    document.querySelectorAll(".field-error").forEach(el => {
        el.classList.remove("visible");
        el.textContent = "";
    });
    document.querySelectorAll("input.invalid").forEach(el => {
        el.classList.remove("invalid");
    });
}


/* ════════════════════════════════════════════════════
   FORMULAIRE CONNEXION
════════════════════════════════════════════════════ */

function bindFormConnexion() {
    document.getElementById("form-connexion").addEventListener("submit", async e => {
        e.preventDefault();
        clearMsg();

        const btn = document.getElementById("btn-login");
        const email = document.getElementById("login-email").value;
        const pwd = document.getElementById("login-password").value;

        if (!email || !pwd) {
            return showMsg("Veuillez remplir tous les champs.");
        }

        setLoading(btn, true, "Se connecter");
        try {
            await connecter(email, pwd);
            showMsg("✅ Connexion réussie ! Redirection…", "success");
            setTimeout(() => {
                window.location.href = "/pages/fidelite/espace-client.html";
            }, 900);
        } catch (err) {
            showMsg(traduireErreur(err.message));
        } finally {
            setLoading(btn, false, "Se connecter");
        }
    });
}


/* ════════════════════════════════════════════════════
   FORMULAIRE INSCRIPTION
════════════════════════════════════════════════════ */

function bindFormInscription() {
    document.getElementById("form-inscription").addEventListener("submit", async e => {
        e.preventDefault();
        clearMsg();
        clearFieldErrors();

        const btn = document.getElementById("btn-register");
        const prenom = document.getElementById("reg-prenom").value.trim();
        const nom = document.getElementById("reg-nom").value.trim();
        const email = document.getElementById("reg-email").value.trim();
        const tel = document.getElementById("reg-tel").value.trim();
        const naissance = document.getElementById("reg-naissance").value;
        const pwd = document.getElementById("reg-password").value;
        const pwdConf = document.getElementById("reg-password-confirm").value;
        const parrain = document.getElementById("reg-parrain").value.trim();

        /* Validation inline */
        let hasError = false;

        if (!prenom) { fieldError("err-prenom", "Le prénom est obligatoire."); hasError = true; }
        if (!nom) { fieldError("err-nom", "Le nom est obligatoire."); hasError = true; }
        if (!email) { fieldError("err-email", "L'email est obligatoire."); hasError = true; }
        if (!tel) { fieldError("err-tel", "Le téléphone est obligatoire."); hasError = true; }
        if (!naissance) { fieldError("err-naissance", "La date de naissance est obligatoire."); hasError = true; }

        if (!pwd) {
            fieldError("err-password", "Le mot de passe est obligatoire.");
            hasError = true;
        } else if (pwd.length < 8) {
            fieldError("err-password", "Minimum 8 caractères.");
            hasError = true;
        }

        if (pwd && pwd !== pwdConf) {
            fieldError("err-confirm", "Les mots de passe ne correspondent pas.");
            hasError = true;
        }

        if (hasError) return;

        setLoading(btn, true, "Créer mon compte");
        try {
            await inscrire({
                prenom,
                nom,
                email,
                password: pwd,
                passwordConfirm: pwdConf,
                telephone: tel,
                date_naissance: naissance,
                code_parrainage_parrain: parrain || null
            });

            showMsg(
                "🎉 Compte créé ! Un email de vérification vous a été envoyé. Cliquez sur le lien pour activer votre compte.",
                "success"
            );
            e.target.reset();
            document.getElementById("pwd-strength").dataset.level = "0";
            document.getElementById("pwd-strength-label").textContent = "";

        } catch (err) {
            showMsg(traduireErreur(err.message));
        } finally {
            setLoading(btn, false, "Créer mon compte");
        }
    });
}


/* ════════════════════════════════════════════════════
   MOT DE PASSE OUBLIÉ
════════════════════════════════════════════════════ */

function bindForgotPassword() {
    document.getElementById("btn-forgot").addEventListener("click", async () => {
        const email = document.getElementById("login-email").value.trim();
        if (!email) {
            return showMsg("Entrez d'abord votre email dans le champ ci-dessus.");
        }
        try {
            await motDePasseOublie(email);
            showMsg("📧 Un lien de réinitialisation vous a été envoyé par email.", "success");
        } catch (err) {
            showMsg(traduireErreur(err.message));
        }
    });
}