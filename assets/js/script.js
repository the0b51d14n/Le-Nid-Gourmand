/* =====================================================
   script.js
   Animations, composants, interactions UI.
   Point d'entrée principal — chargé sur toutes les pages.
   ===================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    await loadComponents();

    initMobileMenu();
    initScrollReveal();
    initSmoothScroll();
    initHeaderScroll();
    initHoverTilt();

});


/* ═══════════════════════════════════════════════════
   CHARGEMENT DES COMPOSANTS header / footer
   ═══════════════════════════════════════════════════ */

async function loadComponents() {

    const isInPages = window.location.pathname.includes("/pages/");
    const base = isInPages ? "../components/" : "components/";

    await Promise.all([
        loadComponent("header", base + "header.html"),
        loadComponent("footer", base + "footer.html")
    ]);
}

async function loadComponent(id, url) {

    const container = document.getElementById(id);
    if (!container) return;

    try {

        const response = await fetch(url);

        if (!response.ok) throw new Error(`${response.status} — ${url}`);

        container.innerHTML = await response.text();
        container.removeAttribute("style"); /* retire un éventuel display:none */

    } catch (err) {
        console.warn("[script] Composant introuvable :", err.message);
    }
}


/* ═══════════════════════════════════════════════════
   MENU MOBILE
   ═══════════════════════════════════════════════════ */

function initMobileMenu() {

    const toggle = document.querySelector(".menu-toggle");
    const nav = document.querySelector(".nav");

    if (!toggle || !nav) return;

    toggle.addEventListener("click", () => {

        const isOpen = nav.classList.toggle("active");

        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.textContent = isOpen ? "✕" : "☰";

    });

    /* Ferme le menu si on clique en dehors */
    document.addEventListener("click", e => {

        if (!nav.contains(e.target) && !toggle.contains(e.target)) {
            nav.classList.remove("active");
            toggle.setAttribute("aria-expanded", "false");
            toggle.textContent = "☰";
        }

    });

    /* Ferme le menu sur resize vers desktop */
    window.addEventListener("resize", () => {
        if (window.innerWidth >= 768) {
            nav.classList.remove("active");
            toggle.setAttribute("aria-expanded", "false");
            toggle.textContent = "☰";
        }
    });
}


/* ═══════════════════════════════════════════════════
   SCROLL REVEAL
   Apparition des sections au défilement.
   ═══════════════════════════════════════════════════ */

function initScrollReveal() {

    const sections = document.querySelectorAll("section:not(.hero)");

    if (!sections.length) return;

    /* Si IntersectionObserver n'est pas supporté, tout afficher */
    if (!("IntersectionObserver" in window)) {
        sections.forEach(s => s.classList.add("visible"));
        return;
    }

    const observer = new IntersectionObserver(

        entries => {
            entries.forEach(entry => {

                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                } else {
                    /* Retire visible pour rejouer l'animation au prochain passage */
                    entry.target.classList.remove("visible");
                }

            });
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    sections.forEach(section => observer.observe(section));
}


/* ═══════════════════════════════════════════════════
   SMOOTH SCROLL
   Pour les liens internes type href="#section".
   ═══════════════════════════════════════════════════ */

function initSmoothScroll() {

    document.addEventListener("click", e => {

        const link = e.target.closest("a[href^='#']");
        if (!link) return;

        const targetId = link.getAttribute("href");
        if (targetId === "#") return;

        const target = document.querySelector(targetId);
        if (!target) return;

        e.preventDefault();

        target.scrollIntoView({ behavior: "smooth", block: "start" });

    });
}


/* ═══════════════════════════════════════════════════
   HEADER AU SCROLL
   Ajoute une ombre et un fond semi-opaque au header
   quand on descend dans la page.
   ═══════════════════════════════════════════════════ */

function initHeaderScroll() {

    const SCROLL_THRESHOLD = 60; /* px avant d'activer */

    let ticking = false;

    function update() {

        const header = document.querySelector(".site-header");
        if (!header) return;

        if (window.scrollY > SCROLL_THRESHOLD) {
            header.classList.add("scrolled");
        } else {
            header.classList.remove("scrolled");
        }

        ticking = false;
    }

    window.addEventListener("scroll", () => {
        if (!ticking) {
            requestAnimationFrame(update);
            ticking = true;
        }
    }, { passive: true });

    /* Injecte le style .scrolled une seule fois */
    if (!document.getElementById("header-scroll-style")) {

        const style = document.createElement("style");
        style.id = "header-scroll-style";

        style.textContent = `
            .site-header {
                transition: background .35s ease, box-shadow .35s ease;
            }
            .site-header.scrolled .header-container {
                background: rgba(255, 255, 255, .82);
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
                box-shadow: 0 4px 24px rgba(0, 0, 0, .10);
            }
            .site-header.scrolled .nav a,
            .site-header.scrolled .menu-toggle {
                color: #1a1a1a;
            }
        `;

        document.head.appendChild(style);
    }
}


/* ═══════════════════════════════════════════════════
   HOVER TILT
   Légère inclinaison 3D des cartes au survol souris.
   Uniquement sur écrans larges (pointeur précis).
   ═══════════════════════════════════════════════════ */

function initHoverTilt() {

    /* Seulement si le dispositif a un pointeur fin (souris) */
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const TILT_MAX = 6; /* degrés max */

    function applyTilt(e) {

        const card = e.currentTarget;
        const rect = card.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / (rect.width / 2);
        const dy = (e.clientY - cy) / (rect.height / 2);
        const rotateX = -dy * TILT_MAX;
        const rotateY = dx * TILT_MAX;

        card.style.transform =
            `perspective(600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
    }

    function resetTilt(e) {
        e.currentTarget.style.transform = "";
    }

    /* Applique aux cartes et plats */
    function bindTilt() {
        document.querySelectorAll(".dish, .grid div, .menu-card").forEach(card => {
            /* Évite les doublons */
            if (card.dataset.tiltBound) return;
            card.dataset.tiltBound = "1";
            card.addEventListener("mousemove", applyTilt);
            card.addEventListener("mouseleave", resetTilt);
        });
    }

    /* Bind initial + re-bind après injection dynamique des plats */
    bindTilt();

    /* Observe les ajouts au DOM (plats injectés par season-dishes.js) */
    new MutationObserver(bindTilt).observe(
        document.getElementById("featured-dishes") || document.body,
        { childList: true, subtree: true }
    );
}