/* =====================================================
   auth.js
   Fonctions Supabase Auth partagées.

   FLOW INSCRIPTION :
   1. signUp() → tout le profil est passé dans
      user_metadata (prenom, nom, tel, naissance, parrain)
   2. Supabase envoie l'email de confirmation
   3. Le client clique sur le lien → redirigé vers connexion.html
   4. connexion.js détecte le token, établit la session
   5. Redirection automatique vers espace-client.html (connecté)
   6. Le trigger handle_new_user() insère automatiquement
      le profil dans public.clients (côté serveur, SECURITY
      DEFINER, bypasse le RLS)
   ===================================================== */

import { supabase } from "./supabase.js";


/* ════════════════════════════════════════════════════
   INSCRIPTION
   N'insère PLUS dans clients directement.
   Le trigger SQL s'en charge après confirmation email.
════════════════════════════════════════════════════ */

export async function inscrire({
    prenom,
    nom,
    email,
    password,
    passwordConfirm,
    telephone,
    date_naissance,
    code_parrainage_parrain
}) {
    if (password !== passwordConfirm) {
        throw new Error("Les mots de passe ne correspondent pas.");
    }

    const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
            /* Toutes les données du profil passent en metadata.
               Le trigger les récupère via raw_user_meta_data. */
            data: {
                prenom: prenom.trim(),
                nom: nom.trim(),
                telephone: telephone.trim(),
                date_naissance: date_naissance || null,
                code_parrainage_parrain: code_parrainage_parrain?.trim().toUpperCase() || null
            },
            /* Après clic sur le lien mail → connexion.js intercepte
               le token et redirige vers espace-client.html */
            emailRedirectTo: `${window.location.origin}/pages/fidelite/connexion.html`
        }
    });

    if (error) throw error;

    return data.user;
}


/* ════════════════════════════════════════════════════
   CONNEXION
════════════════════════════════════════════════════ */

export async function connecter(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
    });
    if (error) throw error;
    return data.user;
}


/* ════════════════════════════════════════════════════
   DÉCONNEXION
════════════════════════════════════════════════════ */

export async function deconnecter() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    window.location.href = "/pages/fidelite/connexion.html";
}


/* ════════════════════════════════════════════════════
   SESSION COURANTE
════════════════════════════════════════════════════ */

export async function getUser() {
    const { data } = await supabase.auth.getSession();
    return data.session?.user ?? null;
}


/* ════════════════════════════════════════════════════
   GARDE DE ROUTE
════════════════════════════════════════════════════ */

export async function requireAuth(redirectTo = "/pages/fidelite/connexion.html") {
    const user = await getUser();
    if (!user) {
        window.location.href = redirectTo;
        return null;
    }
    return user;
}


/* ════════════════════════════════════════════════════
   MOT DE PASSE OUBLIÉ
════════════════════════════════════════════════════ */

export async function motDePasseOublie(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/pages/fidelite/connexion.html?reset=1` }
    );
    if (error) throw error;
}


/* ════════════════════════════════════════════════════
   MISE À JOUR MOT DE PASSE
════════════════════════════════════════════════════ */

export async function mettreAJourMotDePasse(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
}


/* ════════════════════════════════════════════════════
   TRADUCTION DES ERREURS SUPABASE → Français
════════════════════════════════════════════════════ */

export function traduireErreur(msg = "") {
    if (msg.includes("Invalid login credentials")) return "Email ou mot de passe incorrect.";
    if (msg.includes("Email not confirmed")) return "Confirmez votre email avant de vous connecter. Vérifiez votre boîte mail.";
    if (msg.includes("already registered")) return "Cet email est déjà utilisé. Connectez-vous ou réinitialisez votre mot de passe.";
    if (msg.includes("User already registered")) return "Cet email est déjà utilisé. Connectez-vous ou réinitialisez votre mot de passe.";
    if (msg.includes("Password should be")) return "Le mot de passe doit contenir au moins 8 caractères.";
    if (msg.includes("rate limit")) return "Trop de tentatives. Veuillez patienter quelques minutes.";
    if (msg.includes("network")) return "Erreur réseau. Vérifiez votre connexion internet.";
    return "Une erreur est survenue. Veuillez réessayer.";
}