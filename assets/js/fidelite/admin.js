/* =====================================================
   admin.js
   Logique de la page admin — Scanner QR & visites.
   Chargé en type="module" depuis admin.html.
   ===================================================== */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* ── Supabase ── */
const SUPABASE_URL = "https://qtrjvdpcsnpbjzxkywhy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_XPhqVncU41t7MoXhpWUSYQ_5p_-Zra2";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── État global ── */
let currentClient = null;
let scannerRunning = false;
let videoStream = null;
let animFrame = null;
let adminEmail = "";

const RANG_LABELS = {
    oeuf: "🥚 Œuf",
    poussin: "🐣 Poussin",
    oiseau: "🐦 Oiseau",
    rapace: "🦅 Rapace",
    phenix: "🔥 Phénix"
};


/* ════════════════════════════════════════════════════
   UTILS
════════════════════════════════════════════════════ */

function showToast(msg, duration = 2800) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), duration);
}

function showMsg(id, text, type = "error") {
    const el = document.getElementById(id);
    el.textContent = text;
    el.className = `msg ${type} visible`;
}

function hideMsg(id) {
    document.getElementById(id).className = "msg";
}

function setLoading(btn, loading, label) {
    btn.disabled = loading;
    btn.textContent = loading ? "…" : label;
}


/* ════════════════════════════════════════════════════
   AUTH
════════════════════════════════════════════════════ */

async function checkSession() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
        adminEmail = data.session.user.email;
        showScanner();
    }
}

document.getElementById("btn-login").addEventListener("click", async () => {
    const email = document.getElementById("admin-email").value.trim();
    const pwd = document.getElementById("admin-password").value;

    if (!email || !pwd) {
        showMsg("login-msg", "Email et mot de passe requis.");
        return;
    }

    const btn = document.getElementById("btn-login");
    setLoading(btn, true, "Se connecter");
    hideMsg("login-msg");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pwd });

    setLoading(btn, false, "Se connecter");

    if (error) {
        showMsg("login-msg", "Email ou mot de passe incorrect.");
        return;
    }

    /* Vérifier le rôle admin dans les métadonnées */
    if (data.user.user_metadata?.role !== "admin") {
        await supabase.auth.signOut();
        showMsg("login-msg", "Accès réservé au personnel du restaurant.");
        return;
    }

    adminEmail = data.user.email;
    showScanner();
});

document.getElementById("btn-logout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    stopCamera();
    document.getElementById("screen-scanner").style.display = "none";
    document.getElementById("screen-login").style.display = "block";
    document.getElementById("admin-email").value = "";
    document.getElementById("admin-password").value = "";
});

function showScanner() {
    document.getElementById("screen-login").style.display = "none";
    document.getElementById("screen-scanner").style.display = "block";
    document.getElementById("admin-name").textContent = adminEmail;
}


/* ════════════════════════════════════════════════════
   CAMÉRA / jsQR
════════════════════════════════════════════════════ */

document.getElementById("btn-camera").addEventListener("click", startCamera);
document.getElementById("btn-stop-camera").addEventListener("click", stopCamera);

async function startCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });

        const video = document.getElementById("qr-video");
        video.srcObject = videoStream;
        await video.play();

        video.style.display = "block";
        document.getElementById("scan-placeholder").style.display = "none";
        document.getElementById("btn-camera").style.display = "none";
        document.getElementById("btn-stop-camera").style.display = "";

        scannerRunning = true;
        scanFrame();

    } catch {
        showToast("❌ Caméra inaccessible. Utilisez la saisie manuelle.");
    }
}

function stopCamera() {
    scannerRunning = false;
    if (animFrame) cancelAnimationFrame(animFrame);
    if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }

    const video = document.getElementById("qr-video");
    video.style.display = "none";
    video.srcObject = null;

    document.getElementById("scan-placeholder").style.display = "block";
    document.getElementById("btn-camera").style.display = "";
    document.getElementById("btn-stop-camera").style.display = "none";
}

function scanFrame() {
    if (!scannerRunning) return;

    const video = document.getElementById("qr-video");
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        animFrame = requestAnimationFrame(scanFrame);
        return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert"
    });

    if (code?.data) {
        stopCamera();
        loadClientByQR(code.data);
        return;
    }

    animFrame = requestAnimationFrame(scanFrame);
}


/* ════════════════════════════════════════════════════
   SAISIE MANUELLE
════════════════════════════════════════════════════ */

document.getElementById("btn-manual").addEventListener("click", () => {
    const z = document.getElementById("manual-zone");
    z.style.display = z.style.display === "none" ? "block" : "none";
});

document.getElementById("btn-search-manual").addEventListener("click", () => {
    const code = document.getElementById("manual-qr").value.trim().toUpperCase();
    if (code) loadClientByQR(code);
});

document.getElementById("manual-qr").addEventListener("keydown", e => {
    if (e.key === "Enter") {
        const code = e.target.value.trim().toUpperCase();
        if (code) loadClientByQR(code);
    }
});


/* ════════════════════════════════════════════════════
   CHARGER CLIENT PAR QR
════════════════════════════════════════════════════ */

async function loadClientByQR(qrCode) {
    hideMsg("client-msg");

    const { data: client, error } = await supabase
        .from("clients")
        .select("*")
        .eq("qr_code", qrCode)
        .single();

    if (error || !client) {
        document.getElementById("client-card").style.display = "block";
        showMsg("client-msg", `QR code introuvable : ${qrCode}`);
        currentClient = null;
        document.getElementById("btn-valider").disabled = true;
        return;
    }

    currentClient = client;
    await renderClient(client);
    document.getElementById("client-card").style.display = "block";
    document.getElementById("manual-qr").value = "";
    document.getElementById("manual-zone").style.display = "none";
}

async function renderClient(client) {
    /* Avatar & infos */
    document.getElementById("cl-avatar").textContent = (client.prenom || "?").charAt(0).toUpperCase();
    document.getElementById("cl-name").textContent = `${client.prenom} ${client.nom}`;
    document.getElementById("cl-email").textContent = client.email || "";
    document.getElementById("cl-rang").textContent = RANG_LABELS[client.niveau] || client.niveau;

    /* Stats */
    document.getElementById("cl-visites").textContent = client.visites_scannees ?? 0;
    document.getElementById("cl-points").textContent = client.points ?? 0;

    /* Réduction du niveau */
    const { data: niv } = await supabase
        .from("niveaux")
        .select("reduction_pct")
        .eq("slug", client.niveau)
        .single();

    document.getElementById("cl-reduction").textContent = `${niv?.reduction_pct ?? 0}%`;

    /* Récompenses actives */
    const { data: recomp } = await supabase
        .from("recompenses")
        .select("*")
        .eq("client_id", client.id)
        .eq("utilisee", false)
        .order("created_at", { ascending: false });

    const recompSection = document.getElementById("recomp-section");
    const recompList = document.getElementById("recomp-list");
    recompList.innerHTML = "";

    if (recomp?.length) {
        recompSection.style.display = "block";
        recomp.forEach(r => {
            const pill = document.createElement("span");
            pill.className = "recomp-pill";
            pill.textContent = r.description || r.type;
            recompList.appendChild(pill);
        });
    } else {
        recompSection.style.display = "none";
    }

    /* Reset formulaire */
    document.getElementById("montant-input").value = "";
    document.getElementById("note-input").value = "";
    document.getElementById("reduction-preview").style.display = "none";
    document.getElementById("btn-valider").disabled = false;
}


/* ════════════════════════════════════════════════════
   APERÇU RÉDUCTION EN DIRECT
════════════════════════════════════════════════════ */

document.getElementById("montant-input").addEventListener("input", () => {
    const montant = parseFloat(document.getElementById("montant-input").value);
    const prev = document.getElementById("reduction-preview");

    if (!currentClient || isNaN(montant) || montant <= 0) {
        prev.style.display = "none";
        return;
    }

    const redTxt = document.getElementById("cl-reduction").textContent;
    prev.style.display = "block";
    prev.innerHTML = `Montant brut : <strong>${montant.toFixed(2)} €</strong> — la réduction <strong>${redTxt}</strong> sera appliquée automatiquement.`;
});


/* ════════════════════════════════════════════════════
   VALIDER LA VISITE
════════════════════════════════════════════════════ */

document.getElementById("btn-valider").addEventListener("click", async () => {
    if (!currentClient) return;

    const montantBrut = parseFloat(document.getElementById("montant-input").value);
    if (isNaN(montantBrut) || montantBrut < 0) {
        showMsg("client-msg", "Entrez un montant valide.", "error");
        return;
    }

    const note = document.getElementById("note-input").value.trim();
    const btn = document.getElementById("btn-valider");

    btn.disabled = true;
    btn.textContent = "Enregistrement…";
    hideMsg("client-msg");

    const { data: visite, error } = await supabase
        .from("visites")
        .insert({
            client_id: currentClient.id,
            montant_brut: montantBrut,
            scanne_par: adminEmail,
            note: note || null
        })
        .select()
        .single();

    if (error) {
        showMsg("client-msg", "Erreur lors de l'enregistrement. Réessayez.", "error");
        btn.disabled = false;
        btn.textContent = "✓ Valider la visite";
        return;
    }

    /* Succès */
    const ptsGagnes = visite.points_gagnes ?? 0;
    const net = visite.montant_net ?? montantBrut;
    const red = visite.reduction_pct ?? 0;

    showMsg("client-msg",
        `✅ Visite enregistrée ! Montant net : ${net.toFixed(2)} € (−${red}%). +${ptsGagnes} pts crédités.`,
        "success"
    );
    showToast(`✅ ${currentClient.prenom} — visite enregistrée !`);

    btn.textContent = "✓ Enregistré !";
    document.getElementById("montant-input").value = "";
    document.getElementById("note-input").value = "";
    document.getElementById("reduction-preview").style.display = "none";

    /* Rafraîchir les stats */
    const { data: updated } = await supabase
        .from("clients")
        .select("*")
        .eq("id", currentClient.id)
        .single();

    if (updated) {
        currentClient = updated;
        document.getElementById("cl-visites").textContent = updated.visites_scannees ?? 0;
        document.getElementById("cl-points").textContent = updated.points ?? 0;
        document.getElementById("cl-rang").textContent = RANG_LABELS[updated.niveau] || updated.niveau;
    }

    setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "✓ Valider la visite";
    }, 3000);
});


/* ════════════════════════════════════════════════════
   NOUVEAU SCAN
════════════════════════════════════════════════════ */

document.getElementById("btn-nouveau-scan").addEventListener("click", () => {
    currentClient = null;
    document.getElementById("client-card").style.display = "none";
    hideMsg("client-msg");
});


/* ── Démarrage ── */
checkSession();