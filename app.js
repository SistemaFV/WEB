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
const heroSection = document.querySelector(".hero");

if (heroVideo && heroSection) {
  // Respeta el ahorro de datos del navegador y la preferencia de
  // movimiento reducido: en esos casos no se descarga ni un byte de video
  // y la imagen del hero se queda como está.
  const conn = navigator.connection || {};
  const saveData = conn.saveData === true;
  const slowNetwork = /(^|-)2g$/.test(conn.effectiveType || "");
  const allowVideo = !prefersReducedMotion && !saveData && !slowNetwork;

  // El avance por scroll solo se ofrece en escritorio con puntero fino.
  // En táctil el scroll es inercial y el navegador entrega los eventos a
  // saltos, así que el seek continuo se percibe a tirones: ahí conviene
  // más el loop automático.
  const canScrub =
    allowVideo &&
    window.matchMedia("(min-width: 1024px)").matches &&
    window.matchMedia("(pointer: fine)").matches;

  const giveUp = () => {
    heroVideo.classList.remove("is-ready");
    heroSection.classList.remove("has-scrub");
  };

  heroVideo.addEventListener("error", giveUp, { once: true });

  /* Traduce la posición de scroll dentro del hero en un instante del
     video, suavizando el salto para que no se sienta escalonado. */
  const startScrub = () => {
    const FRAME = 1 / 30;
    let current = 0;
    let rafId = null;
    let running = false;

    const targetTime = () => {
      const runway = heroSection.offsetHeight - window.innerHeight;
      if (runway <= 0) return 0;
      const passed = -heroSection.getBoundingClientRect().top;
      const progress = Math.min(Math.max(passed / runway, 0), 1);
      return progress * heroVideo.duration;
    };

    const tick = () => {
      const target = targetTime();
      // Interpolación: el video persigue al scroll en vez de saltar a él.
      current += (target - current) * 0.14;
      if (Math.abs(target - current) < FRAME / 4) current = target;
      // Solo se busca si el desfase supera medio fotograma, para no
      // pedirle al decodificador más trabajo del necesario.
      if (Math.abs(heroVideo.currentTime - current) > FRAME / 2) {
        heroVideo.currentTime = current;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      tick();
    };

    const stop = () => {
      if (!running) return;
      running = false;
      window.cancelAnimationFrame(rafId);
    };

    // Solo se calcula mientras el hero está a la vista.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (entries) => (entries[0].isIntersecting ? start() : stop()),
        { threshold: 0 }
      ).observe(heroSection);
    } else {
      start();
    }
  };

  if (canScrub) {
    let activated = false;

    const activateScrub = () => {
      if (activated) return;
      if (heroVideo.readyState < 3) return;
      if (!heroVideo.duration || !isFinite(heroVideo.duration)) {
        giveUp();
        return;
      }
      activated = true;
      heroVideo.pause();
      heroVideo.classList.add("is-ready");
      heroSection.classList.add("has-scrub");
      startScrub();
    };

    heroVideo.addEventListener("canplaythrough", activateScrub, { once: true });
    // Respaldo: algunos navegadores son reacios a emitir `canplaythrough`.
    // Si el video ya es reproducible pasados unos segundos, se activa
    // igual; el archivo tiene todos los fotogramas clave, así que buscar
    // dentro de lo ya descargado funciona sin esperar al resto.
    window.setTimeout(activateScrub, 5000);

    heroVideo.preload = "auto";
    heroVideo.src = heroVideo.dataset.srcScrub;
  } else if (allowVideo) {
    // Loop automático. En pantallas chicas, la versión liviana (300 KB).
    const useSmall = window.matchMedia("(max-width: 900px)").matches;

    heroVideo.addEventListener(
      "canplay",
      () => {
        heroVideo.classList.add("is-ready");
        const attempt = heroVideo.play();
        if (attempt && typeof attempt.catch === "function") {
          // Si el navegador bloquea la reproducción automática, se
          // descarta el video y queda la imagen. Nunca un hueco negro.
          attempt.catch(giveUp);
        }
      },
      { once: true }
    );

    heroVideo.preload = "auto";
    heroVideo.src = useSmall ? heroVideo.dataset.srcSm : heroVideo.dataset.src;
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
        // En modo scrubbing el bloque visual va fijo (sticky) y el
        // movimiento lo da el video, así que desplazarlo aquí lo
        // desalinearía. Se deja quieto.
        if (document.querySelector(".hero.has-scrub")) {
          heroMedia.style.translate = "";
          parallaxTicking = false;
          return;
        }
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
