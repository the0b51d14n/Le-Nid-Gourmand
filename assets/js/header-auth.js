/* =====================================================
   header-auth.js
   Met à jour le lien fidélité dans le header
   selon la session Supabase courante.

   Chargé en type="module" sur toutes les pages,
   APRÈS script.js (qui injecte le header).

   Fonctionnement :
   - Non connecté  → affiche "🐣 Fidélité"  (→ /connexion)
   - Connecté      → affiche "🐣 Mon compte" (→ /espace-client)
                     + met à jour le titre en "Bonjour [Prénom]"
                     si le prénom est disponible dans les métadonnées Auth
   ===================================================== */

import { supabase } from "./fidelite/supabase.js";

/* Attend que script.js ait injecté le header dans le DOM */
function waitForHeader(callback, attempts = 0) {
    const guest = document.querySelector(".nav-fidelite--guest");
    const member = document.querySelector(".nav-fidelite--member");

    if (guest && member) {
        callback(guest, member);
    } else if (attempts < 20) {
        /* Réessaie toutes les 100ms jusqu'à 2s max */
        setTimeout(() => waitForHeader(callback, attempts + 1), 100);
    }
}

async function updateHeaderAuth(guest, member) {
    try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session;

        if (session?.user) {
            /* Connecté */
            const prenom = session.user.user_metadata?.prenom;

            guest.style.display = "none";
            member.style.display = "";

            if (prenom) {
                member.textContent = `🐣 ${prenom}`;
            }
        } else {
            /* Non connecté — état par défaut déjà dans le HTML */
            guest.style.display = "";
            member.style.display = "none";
        }
    } catch {
        /* En cas d'erreur réseau, on laisse l'état guest par défaut */
        guest.style.display = "";
        member.style.display = "none";
    }
}

/* Lance la vérification dès que le header est disponible */
waitForHeader(updateHeaderAuth);

/* Écoute les changements de session (connexion / déconnexion en direct) */
supabase.auth.onAuthStateChange((_event, session) => {
    waitForHeader((guest, member) => {
        if (session?.user) {
            const prenom = session.user.user_metadata?.prenom;
            guest.style.display = "none";
            member.style.display = "";
            if (prenom) member.textContent = `🐣 ${prenom}`;
        } else {
            guest.style.display = "";
            member.style.display = "none";
            member.textContent = "🐣 Mon compte";
        }
    });
});