document.addEventListener("DOMContentLoaded", () => {

    const seasons = getSeasonDates();
    const now = new Date();

    const currentSeason = detectSeason(now, seasons);

    applySeason(currentSeason);

});


/* ================= DATES DES SAISONS ================= */

function getSeasonDates() {

    const year = new Date().getFullYear();

    return {

        printemps: new Date(year, 2, 20),
        ete: new Date(year, 5, 21),
        automne: new Date(year, 8, 23),
        hiver: new Date(year, 11, 21)

    };

}


/* ================= DETECTER SAISON ================= */

function detectSeason(now, seasons) {

    if (now >= seasons.printemps && now < seasons.ete) {
        return "printemps";
    }

    if (now >= seasons.ete && now < seasons.automne) {
        return "ete";
    }

    if (now >= seasons.automne && now < seasons.hiver) {
        return "automne";
    }

    return "hiver";

}


/* ================= APPLIQUER SAISON ================= */

function applySeason(season) {

    loadCSS(`assets/css/${season}.css`);

    loadCSS(`assets/css/header-${season}.css`);

    loadCSS(`assets/css/footer-${season}.css`);

}


/* ================= CHARGER CSS ================= */

function loadCSS(path) {

    const link = document.createElement("link");

    link.rel = "stylesheet";
    link.href = path;

    document.head.appendChild(link);

}
