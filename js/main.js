/* ==========================================================================
   BEYOND — main.js
   --------------------------------------------------------------------------
   You normally do NOT need to edit this file: all content is in content.js.

   What this file does:
     1. Builds the shared header and footer on every page
     2. Renders the mentor cards (Home), founders and projects (About)
     3. Opens and closes the mobile menu
     4. Checks the application forms and sends them
     5. Shares its small helpers with js/members.js (members area)
   ========================================================================== */

(function () {
  "use strict";

  var DATA = window.BEYOND;
  if (!DATA) {
    console.error("Beyond: js/content.js did not load, so the page cannot be built.");
    return;
  }

  /* ------------------------------------------------------------------------
     Pages of the site, in menu order. The id must match the
     data-page="..." attribute on each page's <body>.
     ------------------------------------------------------------------------ */
  var PAGES = [
    { id: "home",   file: "index.html" },
    { id: "about",  file: "about.html" },
    { id: "mentor", file: "mentor.html" },
    { id: "mentee", file: "mentee.html" },
    { id: "members", file: "members.html" }
  ];

  /* ------------------------------------------------------------------------
     Language and paths
     ------------------------------------------------------------------------ */
  var LANG = (document.documentElement.lang || "en").slice(0, 2).toLowerCase();
  var T = DATA.strings[LANG] || DATA.strings.en;
  var CURRENT_PAGE = document.body.getAttribute("data-page");

  // The site's root folder, worked out from where this script lives.
  // This keeps links working on the root pages and inside a future /it/ folder.
  var scriptEl = document.currentScript || document.querySelector('script[src*="main.js"]');
  var ROOT = scriptEl ? scriptEl.src.replace(/js\/main\.js(\?.*)?$/, "") : "";

  function pageUrl(file, lang) {
    lang = lang || LANG;
    return ROOT + (lang === "en" ? "" : lang + "/") + file;
  }

  function assetUrl(path) {
    if (!path) return "";
    if (/^(https?:)?\/\//.test(path)) return path; // full web address: use as is
    return ROOT + path;
  }

  /* ------------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------------ */

  // Makes text safe to insert into the page.
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // A value can be plain text, or { en: "...", it: "..." } for translations.
  function pick(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value[LANG] || value.en || "";
    }
    return value || "";
  }

  function isExternal(url) {
    return /^https?:\/\//.test(url);
  }

  function linkAttrs(url) {
    return 'href="' + esc(url) + '"' + (isExternal(url) ? ' target="_blank" rel="noopener"' : "");
  }

  /* ========================================================================
     1. Header
     ======================================================================== */
  function renderHeader() {
    var header = document.getElementById("site-header");
    if (!header) return;

    var links = PAGES.map(function (page) {
      var current = page.id === CURRENT_PAGE ? ' aria-current="page"' : "";
      return '<li><a href="' + pageUrl(page.file) + '"' + current + ">" + esc(T.nav[page.id]) + "</a></li>";
    }).join("");

    // Language switch: only shown when more than one language is listed in content.js
    var langSwitch = "";
    var languages = DATA.languages || [];
    if (languages.length > 1) {
      var thisPage = PAGES.filter(function (p) { return p.id === CURRENT_PAGE; })[0] || PAGES[0];
      langSwitch =
        '<ul class="lang-switch" aria-label="' + esc(T.languageLabel) + '">' +
        languages.map(function (l) {
          var current = l.code === LANG ? ' aria-current="true"' : "";
          return '<li><a href="' + pageUrl(thisPage.file, l.code) + '" hreflang="' + esc(l.code) + '" lang="' + esc(l.code) + '"' + current + ">" + esc(l.label) + "</a></li>";
        }).join("") +
        "</ul>";
    }

    header.innerHTML =
      '<div class="container header-inner">' +
        '<a class="wordmark" href="' + pageUrl("index.html") + '" aria-label="' + esc(T.homeLink) + '">' + esc(DATA.site.name) + "</a>" +
        '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">' +
          '<span class="nav-toggle-bars" aria-hidden="true"></span>' +
          '<span class="nav-toggle-text">' + esc(T.menu) + "</span>" +
        "</button>" +
        '<nav id="site-nav" class="site-nav" aria-label="' + esc(T.mainNavLabel) + '">' +
          "<ul>" + links + "</ul>" + langSwitch +
        "</nav>" +
      "</div>";

    setupMenu(header);
  }

  /* ========================================================================
     3. Mobile menu
     ======================================================================== */
  function setupMenu(header) {
    var button = header.querySelector(".nav-toggle");
    var nav = header.querySelector(".site-nav");
    var label = header.querySelector(".nav-toggle-text");

    function setOpen(open) {
      button.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
      label.textContent = open ? T.close : T.menu;
    }

    button.addEventListener("click", function () {
      setOpen(button.getAttribute("aria-expanded") !== "true");
    });

    // Escape closes the menu and puts focus back on the button
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && button.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        button.focus();
      }
    });

    // Close the menu if the screen becomes wide (e.g. rotating a tablet)
    var wide = window.matchMedia("(min-width: 900px)");
    var onChange = function (e) { if (e.matches) setOpen(false); };
    if (wide.addEventListener) wide.addEventListener("change", onChange);
    else if (wide.addListener) wide.addListener(onChange);
  }

  /* ========================================================================
     1. Footer
     ======================================================================== */
  function renderFooter() {
    var footer = document.getElementById("site-footer");
    if (!footer) return;

    var email = DATA.contact.email;

    var mailIcon =
      '<svg class="footer-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
        '<rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
        '<path d="M3.5 6l8.5 7 8.5-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
      "</svg>";

    var legal = (DATA.legal || []).map(function (item) {
      return "<li><a " + linkAttrs(item.url) + ">" + esc(pick(item.label)) + "</a></li>";
    }).join("");

    // Two rows: brand and email on top, copyright and legal links below
    footer.innerHTML =
      '<div class="container">' +
        '<div class="footer-row footer-row--top">' +
          '<p class="footer-brand">' +
            '<span class="footer-wordmark">' + esc(DATA.site.name) + "</span> " +
            '<span class="footer-tagline">' + esc(T.tagline) + "</span>" +
          "</p>" +
          '<a class="footer-email" href="mailto:' + esc(email) + '">' + mailIcon + "<span>" + esc(email) + "</span></a>" +
        "</div>" +
        '<div class="footer-row footer-row--bottom">' +
          '<p class="footer-copy">&copy; ' + new Date().getFullYear() + " " + esc(DATA.site.name) + ". " + esc(T.footer.rights) + "</p>" +
          (legal ? '<ul class="footer-legal" aria-label="' + esc(T.footer.legal) + '">' + legal + "</ul>" : "") +
        "</div>" +
      "</div>";
  }

  /* ========================================================================
     2. Mentor cards (Home)
     ======================================================================== */
  function renderMentors() {
    var grid = document.getElementById("mentor-grid");
    if (!grid) return;

    function fact(label, value, modifier) {
      return (
        '<div class="mentor-fact' + (modifier ? " mentor-fact--" + modifier : "") + '">' +
          "<dt>" + esc(label) + "</dt>" +
          "<dd>" + esc(value) + "</dd>" +
        "</div>"
      );
    }

    var placeholder = assetUrl(DATA.placeholderPhoto);
    var mentors = DATA.mentors || [];

    function card(m, i, isCopy) {
      return (
        '<li class="mentor-card"' + (isCopy ? ' aria-hidden="true"' : "") + ">" +
          '<div class="mentor-photo">' +
            '<img src="' + esc(assetUrl(m.photo) || placeholder) + '" alt="" width="400" height="300" loading="lazy" decoding="async">' +
          "</div>" +
          '<div class="mentor-body">' +
            '<p class="mentor-role">' + esc(pick(m.role)) + "</p>" +
            (m.location ? '<p class="mentor-location">' + esc(pick(m.location)) + "</p>" : "") +
            '<dl class="mentor-facts">' +
              fact(T.mentorLabels.studied, pick(m.studied)) +
              fact(T.mentorLabels.experience, pick(m.experience)) +
            "</dl>" +
          "</div>" +
        "</li>"
      );
    }

    // The cards are written twice so the row can loop without a gap.
    // The second copy is hidden from screen readers.
    grid.innerHTML =
      mentors.map(function (m, i) { return card(m, i, false); }).join("") +
      mentors.map(function (m, i) { return card(m, i, true); }).join("");

    // Missing photo file: show the placeholder instead
    grid.querySelectorAll(".mentor-photo img").forEach(function (img) {
      img.addEventListener("error", function onError() {
        img.removeEventListener("error", onError);
        img.src = placeholder;
      });
    });

    setupCarousel(grid, mentors.length);
  }

  /* ------------------------------------------------------------------------
     Mentor carousel: the row slides continuously and pauses while the mouse
     is over it (or a finger is on it). People who prefer reduced motion get
     a still row they can scroll by hand instead. The sliding itself is CSS.
     ------------------------------------------------------------------------ */
  function setupCarousel(track, count) {
    // About 12 seconds per card, so the speed stays calm with any number of mentors
    track.style.setProperty("--marquee-duration", Math.max(count, 1) * 12 + "s");
  }

  /* ========================================================================
     2. Founders (About)
     ======================================================================== */
  function renderFounders() {
    var wrap = document.getElementById("founders");
    if (!wrap) return;

    var placeholder = assetUrl(DATA.placeholderPhoto);

    wrap.innerHTML = (DATA.founders || []).map(function (f) {
      var name = pick(f.name);
      var bio = pick(f.bio);
      if (!Array.isArray(bio)) bio = [bio];

      var links = [];
      if (f.linkedin) links.push('<li><a class="link-arrow" ' + linkAttrs(f.linkedin) + '>LinkedIn <span aria-hidden="true">&rarr;</span></a></li>');
      if (f.email) links.push('<li><a class="link-arrow" href="mailto:' + esc(f.email) + '">Email <span aria-hidden="true">&rarr;</span></a></li>');

      return (
        '<article class="founder">' +
          '<figure class="founder-photo">' +
            '<img src="' + esc(assetUrl(f.photo) || placeholder) + '" alt="' + esc(T.portraitOf.replace("{name}", name)) + '" width="800" height="1000" loading="lazy" decoding="async">' +
          "</figure>" +
          '<div class="founder-body">' +
            '<p class="eyebrow eyebrow--blue">' + esc(pick(f.role)) + "</p>" +
            '<h3 class="founder-name">' + esc(name) + "</h3>" +
            '<div class="founder-bio">' + bio.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div>" +
            (links.length ? '<ul class="founder-links">' + links.join("") + "</ul>" : "") +
          "</div>" +
        "</article>"
      );
    }).join("");

    // If a photo path is wrong or the file is missing, show the placeholder instead
    wrap.querySelectorAll(".founder-photo img").forEach(function (img) {
      img.addEventListener("error", function onError() {
        img.removeEventListener("error", onError);
        img.src = placeholder;
      });
    });
  }

  /* ========================================================================
     2. Other projects (About)
     ======================================================================== */
  function renderProjects() {
    var list = document.getElementById("projects");
    if (!list) return;

    var placeholder = assetUrl(DATA.placeholderImage);

    list.innerHTML = (DATA.projects || []).map(function (p) {
      var name = pick(p.name);
      return (
        '<li class="project">' +
          '<figure class="project-image">' +
            '<img src="' + esc(assetUrl(p.image) || placeholder) + '" alt="" width="800" height="450" loading="lazy" decoding="async">' +
          "</figure>" +
          '<div class="project-body">' +
            '<p class="eyebrow">' + esc(pick(p.tag)) + "</p>" +
            "<h3>" + esc(name) + "</h3>" +
            "<p>" + esc(pick(p.description)) + "</p>" +
            '<a class="link-arrow" ' + linkAttrs(p.url) + ">" +
              esc(T.visit) + '<span class="visually-hidden"> ' + esc(name) + '</span> <span aria-hidden="true">&rarr;</span>' +
            "</a>" +
          "</div>" +
        "</li>"
      );
    }).join("");

    // If an image path is wrong or the file is missing, show the placeholder instead
    list.querySelectorAll(".project-image img").forEach(function (img) {
      img.addEventListener("error", function onError() {
        img.removeEventListener("error", onError);
        img.src = placeholder;
      });
    });
  }

  /* ========================================================================
     4. Application forms (Become a mentor / Become a mentee)
     A form is handled here when it has data-form="mentor" or data-form="mentee".
     ======================================================================== */
  function setupForms() {
    document.querySelectorAll("form[data-form]").forEach(setupForm);
  }

  // Checks one field and shows or clears its error message. Returns true if valid.
  function validateField(field) {
    var errorEl = document.getElementById(field.id + "-error");
    var v = field.validity;
    var message = "";

    if (field.required && field.type !== "checkbox" && !field.value.trim()) {
      message = field.tagName === "SELECT" ? T.form.choose : T.form.required;
    } else if (v.valueMissing) {
      message = field.type === "checkbox" ? T.form.checkbox : T.form.required;
    } else if (v.typeMismatch && field.type === "email") {
      message = T.form.email;
    } else if (field.minLength > 0 && field.value.trim().length < field.minLength) {
      message = T.form.tooShort.replace("{min}", field.minLength);
    } else if (!v.valid) {
      message = T.form.generic;
    }

    if (message) {
      field.setAttribute("aria-invalid", "true");
    } else {
      field.removeAttribute("aria-invalid");
    }
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = !message;
    }
    return !message;
  }

  function setupForm(form) {
    var key = form.getAttribute("data-form");
    var endpoint = (DATA.forms && DATA.forms[key]) || "";
    var demo = !endpoint || endpoint.indexOf("YOUR_") !== -1;
    var thanks = document.getElementById(form.getAttribute("data-thanks"));
    var status = form.querySelector(".form-status");
    var submit = form.querySelector('[type="submit"]');

    form.noValidate = true; // we show our own, friendlier messages
    if (!demo) form.setAttribute("action", endpoint);

    var demoNote = form.querySelector(".form-demo-note");
    if (demo && demoNote) {
      demoNote.textContent = T.form.demoNote;
      demoNote.hidden = false;
    }

    // "Other" option in a select reveals an extra text field
    form.querySelectorAll("[data-other-target]").forEach(function (select) {
      var wrap = document.getElementById(select.getAttribute("data-other-target"));
      var input = wrap && wrap.querySelector("input");
      if (!input) return;
      function sync() {
        var show = select.value.toLowerCase() === "other";
        wrap.hidden = !show;
        input.required = show;
        if (!show) {
          input.value = "";
          input.removeAttribute("aria-invalid");
          var err = document.getElementById(input.id + "-error");
          if (err) { err.textContent = ""; err.hidden = true; }
        }
      }
      select.addEventListener("change", sync);
      sync();
    });

    // Once a field has shown an error, re-check it as the person types
    function recheck(event) {
      if (event.target.getAttribute("aria-invalid") === "true") validateField(event.target);
    }
    form.addEventListener("input", recheck);
    form.addEventListener("change", recheck);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (status) status.hidden = true;

      // 1. Check every visible field; focus the first one with a problem
      var firstInvalid = null;
      Array.prototype.forEach.call(form.elements, function (field) {
        if (!field.name || !field.willValidate || field.closest(".hp") || field.closest("[hidden]")) return;
        if (!validateField(field) && !firstInvalid) firstInvalid = field;
      });
      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      // 2. Spam trap: real people never fill the hidden field
      var trap = form.querySelector('input[name="_gotcha"]');
      if (trap && trap.value) {
        showThanks();
        return;
      }

      // 3. Send
      var originalLabel = submit.textContent;
      submit.disabled = true;
      submit.textContent = T.form.sending;
      function reset() {
        submit.disabled = false;
        submit.textContent = originalLabel;
      }

      if (demo) {
        setTimeout(function () { reset(); showThanks(); }, 600);
        return;
      }

      fetch(endpoint, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      })
        .then(function (response) {
          if (!response.ok) throw new Error("Status " + response.status);
          reset();
          showThanks();
        })
        .catch(function (error) {
          console.error("Beyond: form could not be sent.", error);
          reset();
          if (status) {
            status.textContent = T.form.error.replace("{email}", DATA.contact.email);
            status.hidden = false;
          }
        });
    });

    function showThanks() {
      form.reset();
      form.hidden = true;
      if (thanks) {
        thanks.hidden = false;
        thanks.focus();
      }
    }
  }

  /* ------------------------------------------------------------------------
     Shared with js/members.js (members area), so it reuses these helpers
     ------------------------------------------------------------------------ */
  window.BEYOND_UI = {
    esc: esc,
    pick: pick,
    assetUrl: assetUrl,
    pageUrl: pageUrl,
    validateField: validateField,
    strings: T
  };

  /* ------------------------------------------------------------------------
     Build the page
     ------------------------------------------------------------------------ */
  renderHeader();
  renderFooter();
  renderMentors();
  renderFounders();
  renderProjects();
  setupForms();
})();
