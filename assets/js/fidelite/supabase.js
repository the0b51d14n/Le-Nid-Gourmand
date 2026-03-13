/* =====================================================
   supabase.js
   Client Supabase partagé pour tout le module fidélité.

   UTILISATION :
     import { supabase } from './supabase.js';
   ===================================================== */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://qtrjvdpcsnpbjzxkywhy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_XPhqVncU41t7MoXhpWUSYQ_5p_-Zra2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


/* ══════════════════════════════════════════════════
   HELPERS — Clients
══════════════════════════════════════════════════ */

/**
 * Récupère le profil complet d'un client par son UUID.
 * Inclut ses récompenses non utilisées.
 */
export async function getClient(clientId) {
    const { data, error } = await supabase
        .from("clients")
        .select(`
            *,
            recompenses (
                id, origine, type, description,
                cout_points, utilisee, expire_le, created_at
            )
        `)
        .eq("id", clientId)
        .eq("recompenses.utilisee", false)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Récupère un client via son QR code (scan admin).
 */
export async function getClientByQR(qrCode) {
    const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("qr_code", qrCode)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Inscrit un nouveau client.
 * QR code et code parrainage générés côté DB.
 */
export async function inscrireClient({ prenom, nom, email, telephone, date_naissance, code_parrainage_parrain }) {

    let parrain_id = null;
    if (code_parrainage_parrain) {
        const { data } = await supabase
            .from("clients")
            .select("id")
            .eq("code_parrainage", code_parrainage_parrain.toUpperCase())
            .single();
        parrain_id = data?.id ?? null;
    }

    const { data, error } = await supabase
        .from("clients")
        .insert({ prenom, nom, email, telephone, date_naissance, parrain_id })
        .select()
        .single();

    if (error) throw error;
    return data;
}


/* ══════════════════════════════════════════════════
   HELPERS — Visites
══════════════════════════════════════════════════ */

/**
 * Enregistre une visite (scan QR).
 * La réduction, les points et le rang sont calculés
 * automatiquement par le trigger côté Supabase.
 *
 * @param {string} clientId    - UUID du client
 * @param {number} montantBrut - Montant addition AVANT réduction
 * @param {string} scannePar   - Email de l'admin qui scanne
 * @param {string} [note]      - Note libre optionnelle
 */
export async function enregistrerVisite(clientId, montantBrut, scannePar, note = "") {
    const { data, error } = await supabase
        .from("visites")
        .insert({
            client_id: clientId,
            montant_brut: montantBrut,
            scanne_par: scannePar,
            note
        })
        .select()
        .single();

    if (error) throw error;
    return data; // contient montant_net, reduction_pct, points_gagnes calculés
}

/**
 * Historique des visites d'un client (20 dernières).
 */
export async function getVisites(clientId, limit = 20) {
    const { data, error } = await supabase
        .from("visites")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data;
}


/* ══════════════════════════════════════════════════
   HELPERS — Points & Récompenses
══════════════════════════════════════════════════ */

/**
 * Échange des points contre une récompense du catalogue.
 * Retourne 'ok' | 'points_insuffisants' | 'catalogue_inconnu'
 */
export async function echangerPoints(clientId, type) {
    const { data, error } = await supabase
        .rpc("echanger_points", {
            p_client_id: clientId,
            p_type: type
        });

    if (error) throw error;
    return data;
}

/**
 * Marque une récompense comme utilisée.
 */
export async function utiliserRecompense(recompenseId) {
    const { data, error } = await supabase
        .from("recompenses")
        .update({ utilisee: true, utilisee_le: new Date().toISOString() })
        .eq("id", recompenseId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Récupère le catalogue de récompenses actives.
 */
export async function getCatalogue() {
    const { data, error } = await supabase
        .from("catalogue_points")
        .select("*")
        .eq("actif", true)
        .order("cout_points");

    if (error) throw error;
    return data;
}


/* ══════════════════════════════════════════════════
   HELPERS — Niveaux
══════════════════════════════════════════════════ */

/**
 * Récupère tous les rangs (pour affichage espace client).
 */
export async function getNiveaux() {
    const { data, error } = await supabase
        .from("niveaux")
        .select("*")
        .order("visites_min");

    if (error) throw error;
    return data;
}


/* ══════════════════════════════════════════════════
   HELPERS — Auth
══════════════════════════════════════════════════ */

/** Connexion email + mot de passe. */
export async function connexion(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

/** Déconnexion. */
export async function deconnexion() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

/** Session courante (null si non connecté). */
export async function getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
}