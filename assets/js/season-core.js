/* =====================================================
   season-core.js
   Source de vérité + orchestrateur principal.

   CE FICHIER FAIT TOUT DANS LE BON ORDRE :
   1. Appelle l'API USNO pour les dates exactes
   2. Détecte la saison courante
   3. Injecte le CSS de la saison
   4. Lance le compte à rebours
   5. Charge les plats featured

   API : US Naval Observatory — aa.usno.navy.mil
   Gratuit, sans clé, 1700–2100.
   Fallback local si API indisponible.
   ===================================================== */

(function () {

    "use strict";


    /* ══════════════════════════════════════════════════
       CONFIGURATION
    ══════════════════════════════════════════════════ */

    const USNO_API = "https://aa.usno.navy.mil/api/seasons";
    const CACHE_KEY = "nid_season_dates";

    /* Coordonnées de Lille (pour les chemins relatifs) */
    const IN_PAGES = window.location.pathname.includes("/pages/");
    const BASE_PATH = IN_PAGES ? "../" : "./";


    /* ══════════════════════════════════════════════════
       MÉTADONNÉES DES SAISONS
    ══════════════════════════════════════════════════ */

    const SAISONS = [
        { key: "printemps", label: "Printemps", emoji: "🌸", themeColor: "#2F4A3A" },
        { key: "ete", label: "Été", emoji: "☀️", themeColor: "#2A6E7A" },
        { key: "automne", label: "Automne", emoji: "🍂", themeColor: "#2A1E14" },
        { key: "hiver", label: "Hiver", emoji: "❄️", themeColor: "#1A2830" }
    ];


    /* ══════════════════════════════════════════════════
       TABLE DE SECOURS (IMCCE 2024–2030)
    ══════════════════════════════════════════════════ */

    const FALLBACK = {
        2024: { printemps: [2, 20, 3, 6], ete: [5, 20, 20, 51], automne: [8, 22, 12, 44], hiver: [11, 21, 9, 20] },
        2025: { printemps: [2, 20, 9, 1], ete: [5, 21, 2, 42], automne: [8, 22, 18, 19], hiver: [11, 21, 15, 3] },
        2026: { printemps: [2, 20, 14, 46], ete: [5, 21, 8, 25], automne: [8, 23, 0, 5], hiver: [11, 21, 20, 50] },
        2027: { printemps: [2, 20, 20, 25], ete: [5, 21, 14, 11], automne: [8, 23, 6, 2], hiver: [11, 22, 2, 42] },
        2028: { printemps: [2, 20, 2, 17], ete: [5, 20, 20, 2], automne: [8, 22, 11, 45], hiver: [11, 21, 8, 20] },
        2029: { printemps: [2, 20, 8, 1], ete: [5, 21, 1, 48], automne: [8, 22, 17, 38], hiver: [11, 21, 14, 4] },
        2030: { printemps: [2, 20, 13, 51], ete: [5, 21, 7, 31], automne: [8, 22, 23, 27], hiver: [11, 21, 19, 49] }
    };

    const FALLBACK_BASE = 2026;
    const FALLBACK_SHIFT = 6 * 60 * 60 * 1000;


    /* ══════════════════════════════════════════════════
       CACHE sessionStorage
    ══════════════════════════════════════════════════ */

    function cacheRead(year) {
        try {
            const raw = sessionStorage.getItem(`${CACHE_KEY}_${year}`);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const result = {};
            for (const [k, v] of Object.entries(parsed)) result[k] = new Date(v);
            return result;
        } catch { return null; }
    }

    function cacheWrite(year, dates) {
        try {
            const toStore = {};
            for (const [k, v] of Object.entries(dates)) toStore[k] = v.toISOString();
            sessionStorage.setItem(`${CACHE_KEY}_${year}`, JSON.stringify(toStore));
        } catch { }
    }


    /* ══════════════════════════════════════════════════
       FALLBACK LOCAL
    ══════════════════════════════════════════════════ */

    function getFallbackDates(year) {
        let raw = FALLBACK[year];
        if (!raw) {
            const baseRaw = FALLBACK[FALLBACK_BASE];
            const delta = (year - FALLBACK_BASE) * FALLBACK_SHIFT;
            raw = {};
            for (const key of Object.keys(baseRaw)) {
                const [m, d, h, min] = baseRaw[key];
                const shifted = new Date(Date.UTC(FALLBACK_BASE, m, d, h, min) + delta);
                raw[key] = [shifted.getUTCMonth(), shifted.getUTCDate(),
                shifted.getUTCHours(), shifted.getUTCMinutes()];
            }
        }
        const dates = {};
        for (const key of Object.keys(raw)) {
            const [m, d, h, min] = raw[key];
            dates[key] = new Date(Date.UTC(year, m, d, h, min));
        }
        return dates;
    }


    /* ══════════════════════════════════════════════════
       API USNO
    ══════════════════════════════════════════════════ */

    const PHENOM_MAP = {
        "March Equinox": "printemps",
        "June Solstice": "ete",
        "September Equinox": "automne",
        "December Solstice": "hiver"
    };

    function parseUSNO(json, year) {
        const dates = {};
        for (const entry of json.data) {
            const key = PHENOM_MAP[entry.phenom];
            if (!key) continue;
            const [h, m] = entry.time.split(":").map(Number);
            dates[key] = new Date(Date.UTC(year, entry.month - 1, entry.day, h, m));
        }
        if (Object.keys(dates).length < 4) {
            throw new Error("Réponse USNO incomplète");
        }
        return dates;
    }

    async function getDatesForYear(year) {
        const cached = cacheRead(year);
        if (cached) return cached;
        try {
            const res = await fetch(`${USNO_API}?year=${year}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const dates = parseUSNO(json, year);
            cacheWrite(year, dates);
            console.info(`[SeasonCore] Dates ${year} via USNO ✓`);
            return dates;
        } catch (err) {
            console.warn(`[SeasonCore] USNO indisponible (${err.message}), fallback local.`);
            return getFallbackDates(year);
        }
    }


    /* ══════════════════════════════════════════════════
       DÉTECTION
    ══════════════════════════════════════════════════ */

    function detectSeason(now, dates) {
        if (now >= dates.printemps && now < dates.ete) return "printemps";
        if (now >= dates.ete && now < dates.automne) return "ete";
        if (now >= dates.automne && now < dates.hiver) return "automne";
        return "hiver";
    }


    /* ══════════════════════════════════════════════════
       MODULE 1 — CSS SAISONNIER
    ══════════════════════════════════════════════════ */

    function applySeasonCSS(season) {

        /* Précharge l'image hero immédiatement — coupe la cascade JS→CSS→image */
        const preload = document.createElement("link");
        preload.rel = "preload";
        preload.as = "image";
        preload.href = `${BASE_PATH}assets/images/hero/${season.key}/hero.png`;
        document.head.appendChild(preload);

        /* CSS principal saisonnier */
        const href = `${BASE_PATH}assets/css/${season.key}/${season.key}.css`;

        if (!document.querySelector(`link[href="${href}"]`)) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = href;
            document.head.appendChild(link);
        }

        /* CSS header saisonnier */
        const hrefHeader = `${BASE_PATH}assets/css/${season.key}/${season.key}-header.css`;

        if (!document.querySelector(`link[href="${hrefHeader}"]`)) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = hrefHeader;
            document.head.appendChild(link);
        }

        /* CSS footer saisonnier */
        const hrefFooter = `${BASE_PATH}assets/css/${season.key}/${season.key}-footer.css`;

        if (!document.querySelector(`link[href="${hrefFooter}"]`)) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = hrefFooter;
            document.head.appendChild(link);
        }

        /* theme-color onglet mobile */
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement("meta");
            meta.name = "theme-color";
            document.head.appendChild(meta);
        }
        meta.content = season.themeColor;

        /* Classe utilitaire sur <body> */
        document.body.classList.add(`saison-${season.key}`);

        console.info(`[SeasonCore] CSS appliqué : ${season.key}`);
    }


    /* ══════════════════════════════════════════════════
       MODULE 2 — COMPTE À REBOURS
    ══════════════════════════════════════════════════ */

    function startCountdown(next) {

        const container = document.getElementById("season-countdown");
        if (!container) return;

        /* Styles injectés une seule fois */
        if (!document.getElementById("cd-styles")) {
            const style = document.createElement("style");
            style.id = "cd-styles";
            style.textContent = `
                #season-countdown { margin-top:32px; text-align:center; color:rgba(255,255,255,.95); }
                .cd-label { font-size:.9rem; opacity:.82; margin:0 0 12px; letter-spacing:.04em; }
                .cd-season-name { font-weight:700; white-space:nowrap; }
                .cd-timer { display:inline-flex; gap:10px; justify-content:center; flex-wrap:wrap; }
                .cd-timer span {
                    display:flex; flex-direction:column; align-items:center;
                    min-width:58px; padding:10px 12px 8px; border-radius:14px;
                    background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.22);
                    backdrop-filter:blur(6px); transition:transform .2s ease; line-height:1;
                }
                .cd-timer span:hover { transform:translateY(-3px); }
                .cd-timer strong { font-size:1.25rem; font-weight:700; font-variant-numeric:tabular-nums; }
                .cd-timer small { font-size:.68rem; opacity:.72; margin-top:4px; text-transform:uppercase; }
                .cd-arrived { font-size:1.1rem; font-weight:600; }
                @media(min-width:768px){
                    .cd-timer span { min-width:68px; padding:12px 14px 10px; }
                    .cd-timer strong { font-size:1.45rem; }
                }
            `;
            document.head.appendChild(style);
        }

        function pad(n) { return String(n).padStart(2, "0"); }

        function tick() {
            const diff = next.date - new Date();

            if (diff <= 0) {
                container.innerHTML = `<p class="cd-arrived">${next.emoji} Bienvenue en ${next.label} !</p>`;
                clearInterval(id);
                setTimeout(() => window.location.reload(), 2000);
                return;
            }

            const days = Math.floor(diff / 86400000);
            const hours = Math.floor(diff / 3600000) % 24;
            const minutes = Math.floor(diff / 60000) % 60;
            const seconds = Math.floor(diff / 1000) % 60;

            container.innerHTML = `
                <p class="cd-label">
                    Prochaine saison&nbsp;:
                    <strong class="cd-season-name">${next.emoji} ${next.label}</strong>
                </p>
                <div class="cd-timer" role="timer">
                    <span><strong>${pad(days)}</strong><small>j</small></span>
                    <span><strong>${pad(hours)}</strong><small>h</small></span>
                    <span><strong>${pad(minutes)}</strong><small>min</small></span>
                    <span><strong>${pad(seconds)}</strong><small>sec</small></span>
                </div>
            `;
        }

        tick();
        const id = setInterval(tick, 1000);
    }


    /* ══════════════════════════════════════════════════
       MODULE 3 — PLATS FEATURED
    ══════════════════════════════════════════════════ */

    async function loadFeaturedDishes(seasonKey) {

        const container = document.getElementById("featured-dishes");
        if (!container) return;

        try {
            const res = await fetch(`${BASE_PATH}data/menu-${seasonKey}.json`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!data.featured || !data.featured.length) throw new Error("Aucun plat");

            container.innerHTML = "";
            data.featured.forEach(dish => {
                const el = document.createElement("article");
                el.className = "dish";
                el.innerHTML = `
                    <img src="${dish.image || ""}" alt="${dish.name}"
                         loading="lazy" onerror="this.style.display='none'">
                    <h3>${dish.name}</h3>
                    <p>${dish.description}</p>
                `;
                container.appendChild(el);
            });

        } catch (err) {
            console.warn(`[SeasonCore] Plats introuvables :`, err.message);
            container.innerHTML = `<p style="grid-column:1/-1;text-align:center;opacity:.6;font-style:italic;padding:40px 0">
                La carte de saison arrive bientôt.
            </p>`;
        }
    }


    /* ══════════════════════════════════════════════════
       ORCHESTRATEUR PRINCIPAL
       Tout démarre ici, dans le bon ordre.
    ══════════════════════════════════════════════════ */

    async function boot() {

        const now = new Date();
        const year = now.getUTCFullYear();

        /* 1. Récupère les dates de l'année en cours (+ suivante en bg) */
        const [dates] = await Promise.all([
            getDatesForYear(year),
            getDatesForYear(year + 1).catch(() => { })
        ]);

        /* 2. Détecte la saison courante */
        const key = detectSeason(now, dates);
        const season = SAISONS.find(s => s.key === key);

        /* 3. Applique le CSS immédiatement */
        applySeasonCSS(season);

        /* 4. Trouve la prochaine saison */
        let nextSeason;
        const remaining = SAISONS.filter(s => now < dates[s.key]);

        if (remaining.length > 0) {
            const next = remaining[0];
            nextSeason = { ...next, date: dates[next.key] };
        } else {
            /* On est après le solstice d'hiver → printemps de l'année prochaine */
            const nextDates = await getDatesForYear(year + 1);
            nextSeason = { ...SAISONS[0], date: nextDates.printemps };
        }

        /* 5. Lance le compte à rebours */
        startCountdown(nextSeason);

        /* 6. Charge les plats featured */
        loadFeaturedDishes(key);

        /* 7. Expose l'API publique pour les autres scripts éventuels */
        window.SeasonCore = { season, nextSeason, SAISONS };
    }


    /* ── Point d'entrée — attend le DOM ───────────────── */

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }

    /* =====================================================
   PATCH season-core.js
   Ajouter ce bloc dans la fonction applySeasonCSS(),
   APRÈS le bloc "CSS footer saisonnier" et AVANT
   le bloc "theme-color onglet mobile".

   Emplacement exact : après ces lignes :
   ─────────────────────────────────────────────────
        if (!document.querySelector(`link[href="${hrefFooter}"]`)) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = hrefFooter;
            document.head.appendChild(link);
        }
   ─────────────────────────────────────────────────
   Insérer le bloc ci-dessous :
===================================================== */

    /* CSS fidélité saisonnier
       Injecté uniquement sur les pages du module fidélité
       (connexion, espace-client, admin). */
    const IS_FIDELITE = window.location.pathname.includes("/fidelite/");

    if (IS_FIDELITE) {
        const hrefFidelite = `${BASE_PATH}assets/css/${season.key}/${season.key}-fidelite.css`;

        if (!document.querySelector(`link[href="${hrefFidelite}"]`)) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = hrefFidelite;
            document.head.appendChild(link);
        }
    }

    /* =====================================================
       FIN DU PATCH
       Le reste de applySeasonCSS() continue normalement :
       ─────────────────────────────────────────────────
            /* theme-color onglet mobile
            let meta = document.querySelector('meta[name="theme-color"]');
            ...
    ===================================================== */
}());