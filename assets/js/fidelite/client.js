/* =====================================================
   client.js
   Logique de l'espace client fidélité.
   Chargé en type="module" depuis espace-client.html.
   ===================================================== */

import { supabase } from "./supabase.js";
import { requireAuth, deconnecter } from "./auth.js";


/* ════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════ */

init();

async function init() {

    /* Redirige si non connecté */
    const user = await requireAuth();
    if (!user) return;

    try {
        /* Charge les données en parallèle */
        const [client, visites, recompenses, niveaux, catalogue] = await Promise.all([
            fetchClient(user.id),
            fetchVisites(user.id),
            fetchRecompenses(user.id),
            fetchNiveaux(),
            fetchCatalogue()
        ]);

        renderHero(client);
        renderRang(client, niveaux);
        renderPoints(client, catalogue);
        renderQR(client);
        renderRecompenses(recompenses);
        renderParrainage(client);
        renderHistorique(visites);

        /* Affiche le contenu, masque le skeleton */
        document.getElementById("ec-skeleton").style.display = "none";
        document.getElementById("ec-content").style.display = "block";

    } catch (err) {
        console.error("[client.js]", err);
        showToast("Erreur de chargement. Rechargez la page.", 5000);
    }

    /* Bouton déconnexion */
    document.getElementById("ec-logout").addEventListener("click", deconnecter);
}


/* ════════════════════════════════════════════════════
   FETCH SUPABASE
════════════════════════════════════════════════════ */

async function fetchClient(userId) {
    const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", userId)
        .single();
    if (error) throw error;
    return data;
}

async function fetchVisites(userId) {
    const { data, error } = await supabase
        .from("visites")
        .select("*")
        .eq("client_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
    if (error) throw error;
    return data ?? [];
}

async function fetchRecompenses(userId) {
    const { data, error } = await supabase
        .from("recompenses")
        .select("*")
        .eq("client_id", userId)
        .eq("utilisee", false)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
}

async function fetchNiveaux() {
    const { data, error } = await supabase
        .from("niveaux")
        .select("*")
        .order("visites_min");
    if (error) throw error;
    return data ?? [];
}

async function fetchCatalogue() {
    const { data, error } = await supabase
        .from("catalogue_points")
        .select("*")
        .eq("actif", true)
        .order("cout_points");
    if (error) throw error;
    return data ?? [];
}


/* ════════════════════════════════════════════════════
   RENDER — HERO
════════════════════════════════════════════════════ */

function renderHero(client) {
    const prenom = client.prenom || "";
    const nom = client.nom || "";

    document.getElementById("ec-nom").textContent = `Bonjour, ${prenom} ${nom}`;
    document.getElementById("ec-avatar").textContent = prenom.charAt(0).toUpperCase();
    document.getElementById("ec-depuis").textContent =
        `Membre depuis ${formatDate(client.created_at)}`;
}


/* ════════════════════════════════════════════════════
   RENDER — RANG
════════════════════════════════════════════════════ */

function renderRang(client, niveaux) {
    const niveau = niveaux.find(n => n.slug === client.niveau) || niveaux[0];
    if (!niveau) return;

    const visites = client.visites_scannees;

    document.getElementById("rang-emoji").textContent = niveau.emoji;
    document.getElementById("rang-label").textContent = niveau.label;
    document.getElementById("rang-desc").textContent = niveau.description;

    /* Progression vers le rang suivant */
    const suivant = niveaux.find(n => n.visites_min > visites);

    if (suivant) {
        const min = niveau.visites_min;
        const max = suivant.visites_min;
        const pct = Math.round(((visites - min) / (max - min)) * 100);

        document.getElementById("rang-progress").style.width = `${pct}%`;
        document.getElementById("rang-progress-label").textContent =
            `${visites - min} / ${max - min} visite${max - min > 1 ? "s" : ""} vers ${suivant.emoji} ${suivant.label}`;
    } else {
        /* Rang max */
        document.getElementById("rang-progress").style.width = "100%";
        document.getElementById("rang-progress-label").textContent = "🔥 Rang maximum atteint !";
    }

    /* Avantages */
    const ul = document.getElementById("rang-avantages");
    ul.innerHTML = "";
    (niveau.avantages || []).forEach(av => {
        const li = document.createElement("li");
        li.textContent = av;
        ul.appendChild(li);
    });
}


/* ════════════════════════════════════════════════════
   RENDER — POINTS + CATALOGUE
════════════════════════════════════════════════════ */

function renderPoints(client, catalogue) {
    document.getElementById("points-total").textContent = client.points ?? 0;

    const wrap = document.getElementById("ec-catalogue");
    wrap.innerHTML = "";

    if (!catalogue.length) {
        wrap.innerHTML = `<p class="ec-empty">Catalogue indisponible.</p>`;
        return;
    }

    catalogue.forEach(item => {
        const canAfford = client.points >= item.cout_points;

        const div = document.createElement("div");
        div.className = "ec-catalogue-item";
        div.innerHTML = `
            <div class="ec-catalogue-info">
                <span class="ec-catalogue-label">${item.label}</span>
                <span class="ec-catalogue-cost">${item.cout_points} pts · valeur ~${item.valeur_euros}€</span>
            </div>
            <button class="ec-catalogue-btn" data-type="${item.type}" ${canAfford ? "" : "disabled"}>
                ${canAfford ? "Échanger" : `${item.cout_points} pts`}
            </button>
        `;
        wrap.appendChild(div);
    });

    /* Échange de points */
    wrap.addEventListener("click", async e => {
        const btn = e.target.closest(".ec-catalogue-btn");
        if (!btn || btn.disabled) return;

        const type = btn.dataset.type;
        btn.disabled = true;
        btn.textContent = "…";

        const { data, error } = await supabase.rpc("echanger_points", {
            p_client_id: client.id,
            p_type: type
        });

        if (error || data !== "ok") {
            showToast(data === "points_insuffisants"
                ? "Points insuffisants."
                : "Erreur lors de l'échange.");
            btn.disabled = false;
            btn.textContent = "Échanger";
            return;
        }

        showToast("🎁 Récompense ajoutée à votre compte !");
        /* Recharge la page pour refléter les nouveaux points */
        setTimeout(() => window.location.reload(), 1200);
    });
}


/* ════════════════════════════════════════════════════
   RENDER — QR CODE
════════════════════════════════════════════════════ */

function renderQR(client) {
    const wrap = document.getElementById("ec-qr");
    wrap.innerHTML = "";

    if (!client.qr_code) {
        wrap.innerHTML = `<p class="ec-empty">QR code indisponible.</p>`;
        return;
    }

    /* QRCode.js (chargé via CDN dans le HTML) */
    if (typeof QRCode !== "undefined") {
        new QRCode(wrap, {
            text: client.qr_code,
            width: 180,
            height: 180,
            colorDark: "#5C3B1E",
            colorLight: "#FFFBF5",
            correctLevel: QRCode.CorrectLevel.M
        });
    } else {
        /* Fallback texte si lib non chargée */
        wrap.innerHTML = `<p class="ec-empty">QR code non disponible.</p>`;
    }

    document.getElementById("ec-qr-text").textContent = client.qr_code;
}


/* ════════════════════════════════════════════════════
   RENDER — RÉCOMPENSES
════════════════════════════════════════════════════ */

const TYPE_LABELS = {
    cafe: "☕ Café offert",
    dessert: "🍮 Dessert offert",
    entree: "🥗 Entrée offerte",
    plat: "🍽️ Plat offert",
    repas_complet: "🎉 Repas complet offert",
    points_bonus: "⭐ Points bonus",
    passage_niveau: "🏅 Passage de niveau"
};

function renderRecompenses(recompenses) {
    const wrap = document.getElementById("ec-recompenses");
    wrap.innerHTML = "";

    if (!recompenses.length) {
        wrap.innerHTML = `<p class="ec-empty">Aucune récompense disponible pour l'instant.</p>`;
        return;
    }

    recompenses.forEach(rec => {
        const div = document.createElement("div");
        div.className = "ec-recompense-item";

        const expiry = rec.expire_le
            ? `Expire le ${formatDate(rec.expire_le)}`
            : "Sans expiration";

        div.innerHTML = `
            <div class="ec-recompense-info">
                <span class="ec-recompense-type">${TYPE_LABELS[rec.type] || rec.type}</span>
                <span class="ec-recompense-expiry">${expiry}</span>
            </div>
            <button class="ec-recompense-btn" data-id="${rec.id}">Utiliser</button>
        `;
        wrap.appendChild(div);
    });

    /* Marquer comme utilisée */
    wrap.addEventListener("click", async e => {
        const btn = e.target.closest(".ec-recompense-btn");
        if (!btn) return;

        if (!confirm("Confirmer l'utilisation de cette récompense ?")) return;

        btn.disabled = true;
        btn.textContent = "…";

        const { error } = await supabase
            .from("recompenses")
            .update({ utilisee: true, utilisee_le: new Date().toISOString() })
            .eq("id", btn.dataset.id);

        if (error) {
            showToast("Erreur. Réessayez.");
            btn.disabled = false;
            btn.textContent = "Utiliser";
            return;
        }

        showToast("✅ Récompense utilisée !");
        btn.closest(".ec-recompense-item").remove();

        /* Si plus aucune récompense */
        if (!wrap.querySelector(".ec-recompense-item")) {
            wrap.innerHTML = `<p class="ec-empty">Aucune récompense disponible pour l'instant.</p>`;
        }
    });
}


/* ════════════════════════════════════════════════════
   RENDER — PARRAINAGE
════════════════════════════════════════════════════ */

function renderParrainage(client) {
    const code = client.code_parrainage || "——";
    document.getElementById("ec-parrain-code").textContent = code;

    /* Lien d'invitation pré-rempli */
    const url = `${window.location.origin}/pages/fidelite/connexion.html?tab=inscription&parrain=${code}`;
    document.getElementById("ec-parrain-invite").href = url;

    /* Copier le code */
    document.getElementById("ec-copy-parrain").addEventListener("click", () => {
        navigator.clipboard.writeText(code).then(() => {
            showToast("📋 Code copié !");
        }).catch(() => {
            showToast("Code : " + code);
        });
    });
}


/* ════════════════════════════════════════════════════
   RENDER — HISTORIQUE VISITES
════════════════════════════════════════════════════ */

function renderHistorique(visites) {
    const wrap = document.getElementById("ec-visites");
    wrap.innerHTML = "";

    if (!visites.length) {
        wrap.innerHTML = `<p class="ec-empty">Aucune visite enregistrée pour l'instant.</p>`;
        return;
    }

    visites.forEach(v => {
        const div = document.createElement("div");
        div.className = "ec-visite-item";
        div.innerHTML = `
            <span class="ec-visite-date">${formatDate(v.created_at)}</span>
            <span class="ec-visite-montant">${v.montant_net ?? v.montant_brut}€</span>
            <span class="ec-visite-pts">+${v.points_gagnes} pts</span>
        `;
        wrap.appendChild(div);
    });
}


/* ════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════ */

function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

/* Toast notification */
let toastTimer = null;

function showToast(msg, duration = 3000) {
    let toast = document.querySelector(".ec-toast");

    if (!toast) {
        toast = document.createElement("div");
        toast.className = "ec-toast";
        document.body.appendChild(toast);
    }

    toast.textContent = msg;
    toast.classList.add("visible");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), duration);
}