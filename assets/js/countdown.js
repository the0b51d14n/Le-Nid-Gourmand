document.addEventListener("DOMContentLoaded", async () => {

    const seasonData = await fetchSeasonDates();

    const now = new Date();

    const currentSeason = detectSeason(now, seasonData);

    loadSeasonCSS(currentSeason);

    const nextSeason = getNextSeason(now, seasonData);

    startCountdown(nextSeason.date, nextSeason.name);

});


/* ================= API SAISONS ================= */

async function fetchSeasonDates() {

    const year = new Date().getFullYear();

    return {
        printemps: new Date(`${year}-03-20T03:06:00Z`),
        ete: new Date(`${year}-06-21T20:51:00Z`),
        automne: new Date(`${year}-09-23T06:50:00Z`),
        hiver: new Date(`${year}-12-21T09:21:00Z`)
    };

}


/* ================= DETECTER SAISON ================= */

function detectSeason(now, seasons) {

    if (now >= seasons.printemps && now < seasons.ete) return "printemps";
    if (now >= seasons.ete && now < seasons.automne) return "ete";
    if (now >= seasons.automne && now < seasons.hiver) return "automne";

    return "hiver";

}


/* ================= PROCHAINE SAISON ================= */

function getNextSeason(now, seasons) {

    const list = [
        { name: "Printemps", key: "printemps" },
        { name: "Été", key: "ete" },
        { name: "Automne", key: "automne" },
        { name: "Hiver", key: "hiver" }
    ];

    for (let s of list) {

        if (now < seasons[s.key]) {
            return {
                name: s.name,
                date: seasons[s.key]
            };
        }

    }

    return {
        name: "Printemps",
        date: new Date(now.getFullYear() + 1, 2, 20)
    };

}


/* ================= COUNTDOWN ================= */

function startCountdown(targetDate, seasonName) {

    const el = document.getElementById("season-countdown");

    if (!el) return;

    function update() {

        const now = new Date();
        const diff = targetDate - now;

        if (diff <= 0) {

            el.innerHTML = `
            <div class="season-title">Nouvelle saison : ${seasonName}</div>
            <div class="season-timer">Maintenant</div>
            `;

            location.reload();
            return;

        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const seconds = Math.floor((diff / 1000) % 60);

        el.innerHTML = `
        <div class="season-title">
            Nouvelle saison : ${seasonName}
        </div>

        <div class="season-label">
            dans :
        </div>

        <div class="season-timer">
            <span>${days}j</span>
            <span>${hours}h</span>
            <span>${minutes}m</span>
            <span>${seconds}s</span>
        </div>
        `;

    }

    update();

    setInterval(update, 1000);

}


/* ================= CHARGER CSS SAISON ================= */

function loadSeasonCSS(season) {

    const link = document.createElement("link");

    link.rel = "stylesheet";
    link.href = `assets/css/${season}.css`;

    document.head.appendChild(link);

}
