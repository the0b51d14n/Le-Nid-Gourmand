document.addEventListener("DOMContentLoaded", async () => {

    await loadComponent("header", getComponentPath("header.html"));
    await loadComponent("footer", getComponentPath("footer.html"));

    initMobileMenu();
    initScrollReveal();
    initSmoothScroll();

});


/* ================= COMPONENT PATH ================= */

function getComponentPath(file) {

    if (window.location.pathname.includes("/pages/")) {
        return "../components/" + file;
    }

    return "components/" + file;

}


/* ================= LOAD COMPONENT ================= */

async function loadComponent(id, url) {

    const container = document.getElementById(id);
    if (!container) return;

    try {

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Component not found");
        }

        const data = await response.text();

        container.innerHTML = data;

        container.style.opacity = "1";

    } catch (err) {

        console.warn("Component loading error:", err);

    }

}


/* ================= MOBILE MENU ================= */

function initMobileMenu() {

    const menuButton = document.querySelector(".menu-toggle");
    const nav = document.querySelector(".nav");

    if (!menuButton || !nav) return;

    menuButton.addEventListener("click", () => {

        nav.classList.toggle("active");

    });

}


/* ================= SCROLL REVEAL ================= */

function initScrollReveal() {

    const sections = document.querySelectorAll("section");

    const observer = new IntersectionObserver((entries) => {

        entries.forEach(entry => {

            if (entry.isIntersecting) {

                entry.target.classList.add("visible");

            } else {

                entry.target.classList.remove("visible");

            }

        });

    }, {
        threshold: 0.15
    });

    sections.forEach(section => {

        if (!section.classList.contains("hero")) {
            observer.observe(section);
        }

    });

}


/* ================= SMOOTH SCROLL ================= */

function initSmoothScroll() {

    const links = document.querySelectorAll("a[href^='#']");

    links.forEach(link => {

        link.addEventListener("click", e => {

            const targetId = link.getAttribute("href");

            if (targetId === "#") return;

            const target = document.querySelector(targetId);

            if (!target) return;

            e.preventDefault();

            target.scrollIntoView({
                behavior: "smooth"
            });

        });

    });

}
