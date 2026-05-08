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

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    if (header) {
      header.dataset.open = "false";
    }
    if (navToggle) {
      navToggle.setAttribute("aria-expanded", "false");
    }
  });
});

const supportsFinePointer = window.matchMedia("(pointer: fine)").matches;
const spotlightCards = document.querySelectorAll(
  ".service-card, .project-card, .mvv-card, .contact-card, .highlight-card, .process-step, .hero-card, .carousel-card, .gallery-item, .video-frame"
);

if (supportsFinePointer) {
  spotlightCards.forEach((card) => {
    card.classList.add("spotlight-card");

    card.addEventListener("mousemove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      card.style.setProperty("--mx", `${x}px`);
      card.style.setProperty("--my", `${y}px`);
    });

    card.addEventListener("mouseleave", () => {
      card.style.removeProperty("--mx");
      card.style.removeProperty("--my");
    });
  });
}

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealItems = document.querySelectorAll("[data-reveal]");

if (prefersReducedMotion) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const carousels = document.querySelectorAll("[data-carousel]");

carousels.forEach((carousel) => {
  const track = carousel.querySelector(".carousel-track");
  if (!track) {
    return;
  }

  const slides = Array.from(track.children);
  if (slides.length === 0) {
    return;
  }

  const prevButton = carousel.querySelector("[data-carousel-prev]");
  const nextButton = carousel.querySelector("[data-carousel-next]");
  let index = 0;
  let timerId = null;

  const update = () => {
    track.style.transform = `translateX(-${index * 100}%)`;
    slides.forEach((slide, slideIndex) => {
      slide.setAttribute("aria-hidden", String(slideIndex !== index));
    });
  };

  const goTo = (nextIndex) => {
    index = (nextIndex + slides.length) % slides.length;
    update();
  };

  const startAuto = () => {
    if (prefersReducedMotion) {
      return;
    }
    stopAuto();
    timerId = window.setInterval(() => {
      goTo(index + 1);
    }, 5200);
  };

  const stopAuto = () => {
    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
  };

  prevButton?.addEventListener("click", () => {
    goTo(index - 1);
    startAuto();
  });

  nextButton?.addEventListener("click", () => {
    goTo(index + 1);
    startAuto();
  });

  carousel.addEventListener("mouseenter", stopAuto);
  carousel.addEventListener("mouseleave", startAuto);
  carousel.addEventListener("focusin", stopAuto);
  carousel.addEventListener("focusout", startAuto);

  update();
  startAuto();
});
