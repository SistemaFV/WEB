/* =========================================================
   Construcciones FV — Interacciones
   ========================================================= */

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

/* ---------- Navegación móvil ---------- */

const header = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelectorAll(".site-nav a");

if (navToggle && header) {
  navToggle.addEventListener("click", () => {
    const isOpen = header.dataset.open === "true";
    header.dataset.open = String(!isOpen);
    navToggle.setAttribute("aria-expanded", String(!isOpen));
  });
}

const closeNav = () => {
  if (header) header.dataset.open = "false";
  if (navToggle) navToggle.setAttribute("aria-expanded", "false");
};

navLinks.forEach((link) => link.addEventListener("click", closeNav));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeNav();
});

/* ---------- Header sólido al hacer scroll + CTA flotante ---------- */

const floatingCta = document.querySelector(".floating-cta");
const hero = document.querySelector(".hero");

const onScroll = () => {
  const y = window.scrollY;

  if (header) {
    header.classList.toggle("is-scrolled", y > 40);
  }

  if (floatingCta) {
    const heroHeight = hero ? hero.offsetHeight * 0.7 : 500;
    floatingCta.classList.toggle("is-shown", y > heroHeight);
  }
};

let ticking = false;
window.addEventListener(
  "scroll",
  () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        onScroll();
        ticking = false;
      });
      ticking = true;
    }
  },
  { passive: true }
);
onScroll();

/* ---------- Video de fondo del hero ---------- */

const heroVideo = document.querySelector(".hero-video");

if (heroVideo) {
  // Respeta el ahorro de datos del navegador y la preferencia de
  // movimiento reducido: en esos casos no se descarga ni un byte de video
  // y la imagen del hero se queda como está.
  const conn = navigator.connection || {};
  const saveData = conn.saveData === true;
  const slowNetwork = /(^|-)2g$/.test(conn.effectiveType || "");

  if (!prefersReducedMotion && !saveData && !slowNetwork) {
    // En pantallas chicas se sirve la versión liviana (300 KB en vez de 1,2 MB).
    const useSmall = window.matchMedia("(max-width: 900px)").matches;
    const src = useSmall
      ? heroVideo.dataset.srcSm
      : heroVideo.dataset.src;

    heroVideo.addEventListener(
      "canplay",
      () => {
        heroVideo.classList.add("is-ready");
        const attempt = heroVideo.play();
        if (attempt && typeof attempt.catch === "function") {
          // Si el navegador bloquea la reproducción automática, se
          // descarta el video y queda la imagen. Nunca un hueco negro.
          attempt.catch(() => heroVideo.classList.remove("is-ready"));
        }
      },
      { once: true }
    );

    heroVideo.addEventListener("error", () => heroVideo.classList.remove("is-ready"), {
      once: true,
    });

    heroVideo.preload = "auto";
    heroVideo.src = src;
  }
}

/* ---------- Parallax suave del hero ---------- */

const heroMedia = document.querySelector(".hero-media");

if (heroMedia && !prefersReducedMotion && window.matchMedia("(min-width: 900px)").matches) {
  let parallaxTicking = false;

  window.addEventListener(
    "scroll",
    () => {
      if (parallaxTicking) return;

      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        // Solo mientras el hero está a la vista. Se usa la propiedad
        // `translate` (independiente de `transform`) para no pisar la
        // animación ken-burns que vive en `transform` de la imagen.
        if (y < window.innerHeight) {
          heroMedia.style.translate = `0 ${y * 0.22}px`;
        }
        parallaxTicking = false;
      });

      parallaxTicking = true;
    },
    { passive: true }
  );
}

/* ---------- Reveal al entrar en viewport ---------- */

const revealItems = document.querySelectorAll("[data-reveal]");

if (prefersReducedMotion || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
  );

  revealItems.forEach((item) => revealObserver.observe(item));

  /* Red de seguridad: si por cualquier motivo el observer no llegara a
     dispararse (pestaña en segundo plano al cargar, bug del navegador),
     mostramos todo igual. Nunca debe quedar contenido invisible. */
  window.setTimeout(() => {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }, 2500);

  /* Escalonado dentro de cada grilla, para que las tarjetas
     no aparezcan todas de golpe. */
  const staggerGroups = document.querySelectorAll(
    ".fleet-grid, .split-grid, .process-grid, .works-list, .identity-stack, .gallery-grid"
  );

  staggerGroups.forEach((group) => {
    Array.from(group.children).forEach((child, index) => {
      if (child.hasAttribute("data-reveal")) {
        child.style.transitionDelay = `${Math.min(index * 90, 450)}ms`;
      }
    });
  });
}

/* ---------- Año dinámico en el footer ---------- */

const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = String(new Date().getFullYear());
}

/* ---------- Marcar sección activa en el menú ---------- */

const sections = document.querySelectorAll("main section[id]");
const navAnchors = document.querySelectorAll('.site-nav a[href^="#"]');

if (sections.length && "IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.getAttribute("id");
        navAnchors.forEach((anchor) => {
          anchor.classList.toggle(
            "is-active",
            anchor.getAttribute("href") === `#${id}`
          );
        });
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );

  sections.forEach((section) => sectionObserver.observe(section));
}
