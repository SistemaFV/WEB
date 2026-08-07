/* =========================================================
   Construcciones FV / Interacciones
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

/* ---------- Tema claro / oscuro ---------- */

const CLAVE_TEMA = "fv-tema";
const temaToggle = document.querySelector(".theme-toggle");

if (temaToggle) {
  const etiqueta = temaToggle.querySelector(".sr-only");
  const metaColor = document.querySelector('meta[name="theme-color"]');

  const aplicarTema = (oscuro) => {
    document.documentElement.dataset.theme = oscuro ? "oscuro" : "claro";
    temaToggle.setAttribute("aria-pressed", String(oscuro));
    if (etiqueta) {
      etiqueta.textContent = oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
    }
    // La barra del navegador en móvil también acompaña al tema.
    if (metaColor) metaColor.setAttribute("content", oscuro ? "#0e0f12" : "#101114");
  };

  // El script del <head> ya decidió el tema inicial para evitar el destello;
  // acá solo se sincronizan el rótulo accesible y el estado del botón.
  aplicarTema(document.documentElement.dataset.theme === "oscuro");

  temaToggle.addEventListener("click", () => {
    const oscuro = document.documentElement.dataset.theme !== "oscuro";
    aplicarTema(oscuro);
    try {
      localStorage.setItem(CLAVE_TEMA, oscuro ? "oscuro" : "claro");
    } catch (e) {
      /* sin almacenamiento: el cambio vale solo para esta visita */
    }
  });
}

/* ---------- Menú "Ingresar" ---------- */

const loginToggle = document.querySelector(".nav-login-toggle");
const loginMenu = document.querySelector(".nav-login-menu");

if (loginToggle && loginMenu) {
  const setLogin = (abierto) => {
    loginToggle.setAttribute("aria-expanded", String(abierto));
    loginMenu.hidden = !abierto;
  };

  loginToggle.addEventListener("click", (event) => {
    // Sin esto, el listener de "clic afuera" recibiría el mismo clic y
    // cerraría el menú justo después de abrirlo.
    event.stopPropagation();
    setLogin(loginMenu.hidden);
  });

  document.addEventListener("click", (event) => {
    if (!loginMenu.hidden && !loginMenu.contains(event.target)) setLogin(false);
  });

  loginMenu.querySelectorAll("a").forEach((enlace) => {
    enlace.addEventListener("click", () => setLogin(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !loginMenu.hidden) {
      setLogin(false);
      loginToggle.focus();
    }
  });
}

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
    ".fleet-grid, .split-grid, .process-grid, .works-list, .identity-stack"
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

/* ---------- Constelación de fondo ---------- */

/* Trama de puntos unidos por líneas, la misma que recibe al usuario en el
   login del ERP. Se dibuja en un canvas para poder cubrir cualquier alto de
   sección sin deformarse y sin descargar una imagen.

   Tres cuidados que no se ven pero se notan:
   - Se pausa cuando la sección sale de pantalla. Una animación corriendo
     fuera de vista es batería regalada, sobre todo en teléfono.
   - Con `prefers-reduced-motion` se dibuja un solo cuadro fijo, no se anima.
   - La densidad se calcula por área, así que en un teléfono no quedan los
     mismos 90 puntos apretados que en un monitor. */

document.querySelectorAll(".constelacion").forEach((lienzo) => {
  const ctx = lienzo.getContext("2d", { alpha: true });
  if (!ctx) return;

  const seccion = lienzo.parentElement;
  const DISTANCIA = 132; // radio en que dos puntos se unen con una línea
  let puntos = [];
  let ancho = 0;
  let alto = 0;
  let animando = false;
  let cuadro = null;

  const medir = () => {
    const caja = seccion.getBoundingClientRect();
    // El canvas se dibuja en píxeles físicos y se muestra en píxeles CSS; sin
    // esto las líneas de 1 px se ven borrosas en pantallas de alta densidad.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ancho = Math.round(caja.width);
    alto = Math.round(caja.height);
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cantidad = Math.round(
      Math.min(96, Math.max(26, (ancho * alto) / 17000))
    );
    puntos = Array.from({ length: cantidad }, () => ({
      x: Math.random() * ancho,
      y: Math.random() * alto,
      vx: (Math.random() - 0.5) * 0.16,
      vy: (Math.random() - 0.5) * 0.16,
      r: Math.random() * 1.4 + 0.7,
    }));
  };

  const pintar = () => {
    ctx.clearRect(0, 0, ancho, alto);

    for (let i = 0; i < puntos.length; i += 1) {
      const a = puntos[i];
      for (let j = i + 1; j < puntos.length; j += 1) {
        const b = puntos[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d > DISTANCIA) continue;
        // Cuanto más lejos, más tenue: así la malla se desvanece sola en vez
        // de cortarse de golpe al pasar el umbral.
        ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - d / DISTANCIA) * 0.21})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.52)";
    puntos.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const paso = () => {
    puntos.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      // Rebote en los bordes. Reaparecer por el lado contrario cortaría las
      // líneas de un lado al otro del canvas.
      if (p.x < 0 || p.x > ancho) p.vx *= -1;
      if (p.y < 0 || p.y > alto) p.vy *= -1;
    });
    pintar();
    cuadro = window.requestAnimationFrame(paso);
  };

  const arrancar = () => {
    if (animando || prefersReducedMotion) return;
    animando = true;
    cuadro = window.requestAnimationFrame(paso);
  };

  const detener = () => {
    animando = false;
    if (cuadro) window.cancelAnimationFrame(cuadro);
    cuadro = null;
  };

  medir();
  pintar();
  lienzo.classList.add("lista");

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      ([e]) => (e.isIntersecting ? arrancar() : detener()),
      { threshold: 0 }
    ).observe(seccion);
  } else {
    arrancar();
  }

  if ("ResizeObserver" in window) {
    // La sección cambia de alto cuando entran o salen tarjetas del panel, no
    // solo cuando se redimensiona la ventana.
    let espera;
    new ResizeObserver(() => {
      window.clearTimeout(espera);
      espera = window.setTimeout(() => {
        medir();
        pintar();
      }, 150);
    }).observe(seccion);
  }
});
