/* =========================================================
   THE PHYSICS BEYOND
   Global JavaScript — V1
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    initializeNavigation();
    initializeScrollAnimations();
});


/* ---------------------------------------------------------
   MOBILE NAVIGATION
   --------------------------------------------------------- */

function initializeNavigation() {
    const toggle = document.querySelector(".mobile-toggle");
    const nav = document.querySelector(".nav-links");

    if (!toggle || !nav) {
        return;
    }

    toggle.addEventListener("click", () => {
        const isOpen = nav.classList.toggle("active");

        toggle.setAttribute(
            "aria-expanded",
            String(isOpen)
        );

        toggle.setAttribute(
            "aria-label",
            isOpen ? "Close navigation" : "Open navigation"
        );

        toggle.textContent = isOpen ? "×" : "☰";
    });


    /* Close mobile navigation after selecting a link */

    const navLinks = nav.querySelectorAll("a");

    navLinks.forEach((link) => {
        link.addEventListener("click", () => {
            nav.classList.remove("active");

            toggle.setAttribute(
                "aria-expanded",
                "false"
            );

            toggle.setAttribute(
                "aria-label",
                "Open navigation"
            );

            toggle.textContent = "☰";
        });
    });
}


/* ---------------------------------------------------------
   SCROLL ANIMATIONS
   --------------------------------------------------------- */

function initializeScrollAnimations() {
    const elements = document.querySelectorAll(".fade-in");

    if (!elements.length) {
        return;
    }

    if (
        !("IntersectionObserver" in window) ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
        elements.forEach((element) => {
            element.classList.add("visible");
        });

        return;
    }

    const observer = new IntersectionObserver(
        (entries, observerInstance) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add("visible");

                observerInstance.unobserve(entry.target);
            });
        },
        {
            threshold: 0.1
        }
    );

    elements.forEach((element) => {
        observer.observe(element);
    });
}