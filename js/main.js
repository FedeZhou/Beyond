/* ==========================================================================
   BEYOND — main.js
   --------------------------------------------------------------------------
   You normally do NOT need to edit this file: all content is in content.js.

   What this file does:
     1. Builds the shared header and footer on every page
     2. Renders the mentor cards (Home), founders and projects (About)
     3. Opens and closes the mobile menu
     4. Checks the application forms and sends them to Supabase
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
     data-page="..." attribute on each page's <body>; "label" is the name
     in strings.nav (content.js) when it differs from the id. Logged-out
     visitors see "Login"; members see "Directory" and "My profile".
     ------------------------------------------------------------------------ */
  var PAGES = [
    { id: "home",   file: "index.html" },
    { id: "about",  file: "about.html" },
    { id: "mentor", file: "mentor.html" },
    { id: "mentee", file: "mentee.html" }
  ].concat(isLoggedIn() ? [
    { id: "members", file: "members.html", label: "directory", alsoCurrent: ["admin"] },
    { id: "my-card", file: "my-card.html", label: "profile", alsoCurrent: ["reset"] }
  ] : [
    { id: "login",  file: "login.html", label: "members", alsoCurrent: ["members", "my-card", "join", "reset", "admin"] }
  ]);

  // True when this browser holds a Beyond sign-in (Supabase keeps it in localStorage
  // as "sb-<project>-auth-token"). Only used to choose the menu links; the members
  // pages check the session properly and send anyone else to the login page.
  function isLoggedIn() {
    var conn = window.BEYOND_CONFIG || {};
    var project = /^https?:\/\/([^.\/]+)\./.exec(conn.supabaseUrl || "");
    if (!project) return false;
    try {
      var saved = JSON.parse(localStorage.getItem("sb-" + project[1] + "-auth-token"));
      return !!(saved && saved.refresh_token);
    } catch (e) {
      return false;
    }
  }

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

  var LINKEDIN_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/>' +
    "</svg>";

  // LinkedIn logo linking to a profile (mentor and team cards); "" when there is no link
  function linkedinButton(url, who) {
    if (!url) return "";
    return '<a class="mentor-linkedin" ' + linkAttrs(url) +
      ' aria-label="' + esc(T.mentorLabels.linkedin + ": " + who) + '">' + LINKEDIN_ICON + "</a>";
  }

  /* ========================================================================
     1. Header
     ======================================================================== */
  function renderHeader() {
    var header = document.getElementById("site-header");
    if (!header) return;

    var links = PAGES.map(function (page) {
      var isCurrent = page.id === CURRENT_PAGE || (page.alsoCurrent || []).indexOf(CURRENT_PAGE) !== -1;
      var current = isCurrent ? ' aria-current="page"' : "";
      return '<li><a href="' + pageUrl(page.file) + '"' + current + ">" + esc(T.nav[page.label || page.id]) + "</a></li>";
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

    var placeholder = assetUrl(DATA.placeholderPhoto);
    var mentors = DATA.mentors || [];

    function card(m) {
      return (
        '<li class="mentor-card">' +
          '<div class="mentor-photo">' +
            '<img src="' + esc(assetUrl(m.photo) || placeholder) + '" alt="" width="400" height="300" loading="lazy" decoding="async"' +
              (m.photoPosition ? ' style="object-position: ' + esc(m.photoPosition) + '"' : "") + ">" +
          "</div>" +
          '<div class="mentor-body">' +
            '<div class="mentor-text">' +
              (m.field ? '<p class="mentor-field">' + esc(pick(m.field)) + "</p>" : "") +
              '<p class="mentor-role">' + esc(pick(m.role)) + "</p>" +
              (m.location ? '<p class="mentor-location">' + esc(pick(m.location)) + "</p>" : "") +
            "</div>" +
            linkedinButton(m.linkedin, pick(m.role)) +
          "</div>" +
        "</li>"
      );
    }

    // The last card invites visitors to join, and links to the "Join Beyond" section
    var more =
      '<li class="mentor-more">' +
        '<a class="mentor-more-link" href="#join">' +
          '<span class="mentor-more-title">' + esc(T.membersRow.moreTitle) + "</span>" +
          '<span class="mentor-more-cta">' + esc(T.membersRow.moreLink) +
            ' <span class="btn-arrow" aria-hidden="true"></span></span>' +
        "</a>" +
      "</li>";

    grid.innerHTML = mentors.map(card).join("") + more;

    // Missing photo file: show the placeholder instead
    grid.querySelectorAll(".mentor-photo img").forEach(function (img) {
      img.addEventListener("error", function onError() {
        img.removeEventListener("error", onError);
        img.src = placeholder;
      });
    });

    setupCarousel(grid);
  }

  /* ------------------------------------------------------------------------
     Members row: it stays still and scrolls sideways with the arrows on its
     left and right (or a swipe / the trackpad). Each arrow moves by as many
     cards as fit on screen, and disappears at its end of the row.
     ------------------------------------------------------------------------ */
  function setupCarousel(track) {
    var viewport = track.parentNode;
    var row = viewport.parentNode;
    var prev = row.querySelector('[data-carousel="prev"]');
    var next = row.querySelector('[data-carousel="next"]');

    if (prev && next) {
      prev.setAttribute("aria-label", T.membersRow.previous);
      next.setAttribute("aria-label", T.membersRow.next);

      // A card sticking out past the margin by less than this still counts as in view
      var TOLERANCE = 16;

      // Width of the cards that fit on screen, so one click shows the next "page"
      var pageWidth = function () {
        var style = getComputedStyle(viewport);
        var visible = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        var first = track.firstElementChild;
        var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
        var step = (first ? first.getBoundingClientRect().width : 250) + gap;
        // n cards fit when n cards plus the n - 1 gaps between them fit
        return Math.max(1, Math.floor((visible + TOLERANCE + gap) / step)) * step;
      };

      var update = function () {
        // Cards sticking out past the page margins are faded (see .is-outside in styles.css)
        var box = viewport.getBoundingClientRect();
        var style = getComputedStyle(viewport);
        var inner = {
          left: box.left + parseFloat(style.paddingLeft) - TOLERANCE,
          right: box.right - parseFloat(style.paddingRight) + TOLERANCE
        };
        Array.prototype.forEach.call(track.children, function (item) {
          var r = item.getBoundingClientRect();
          item.classList.toggle("is-outside", r.left < inner.left || r.right > inner.right);
        });

        var max = viewport.scrollWidth - viewport.clientWidth;
        // An arrow disappears at its end of the row (and both when everything fits)
        prev.disabled = viewport.scrollLeft <= 1;
        next.disabled = viewport.scrollLeft >= max - 1;
      };

      prev.addEventListener("click", function () { viewport.scrollBy({ left: -pageWidth() }); });
      next.addEventListener("click", function () { viewport.scrollBy({ left: pageWidth() }); });

      var queued = false;
      var queueUpdate = function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () { queued = false; update(); });
      };
      viewport.addEventListener("scroll", queueUpdate, { passive: true });
      window.addEventListener("resize", queueUpdate);
      update();
    }

    // Photos are blue by default; a click or tap shows the original colours
    // (tap again to go back to blue). Hover does the same with CSS on computers.
    track.addEventListener("click", function (event) {
      if (event.target.closest("a")) return; // the LinkedIn link just opens the profile
      var card = event.target.closest(".mentor-card");
      if (card) card.classList.toggle("is-color");
    });
  }

  /* ========================================================================
     2. The Team (About): the members directory card, with the LinkedIn logo
     ======================================================================== */
  function renderFounders() {
    var wrap = document.getElementById("founders");
    if (!wrap) return;

    var placeholder = assetUrl(DATA.placeholderPhoto);

    wrap.innerHTML = (DATA.founders || []).map(function (f) {
      var name = pick(f.name);
      var work = pick(f.position);
      var place = [pick(f.city), pick(f.country)].filter(Boolean).join(", ");

      return (
        '<li class="mentor-card member-card">' +
          '<div class="mentor-photo">' +
            '<img src="' + esc(assetUrl(f.photo) || placeholder) + '" alt="' + esc(T.portraitOf.replace("{name}", name)) +
            '" width="300" height="400" loading="lazy" decoding="async"' +
              (f.photoPosition ? ' style="object-position: ' + esc(f.photoPosition) + '"' : "") + ">" +
          "</div>" +
          '<div class="mentor-body">' +
            '<div class="mentor-text">' +
              (f.role ? '<p class="member-badge">' + esc(pick(f.role)) + "</p>" : "") +
              '<h3 class="member-name">' + esc(name) + "</h3>" +
              (work ? '<p class="mentor-role">' + esc(work) + "</p>" : "") +
              (place ? '<p class="mentor-location">' + esc(place) + "</p>" : "") +
            "</div>" +
            linkedinButton(f.linkedin, name) +
          "</div>" +
        "</li>"
      );
    }).join("");

    // If a photo path is wrong or the file is missing, show the placeholder instead
    wrap.querySelectorAll(".mentor-photo img").forEach(function (img) {
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
    linkLegal();
  }

  // Links marked data-legal="privacy" / "terms" get their address from "legal" in content.js
  function linkLegal() {
    document.querySelectorAll("a[data-legal]").forEach(function (link) {
      var item = (DATA.legal || []).filter(function (l) { return l.id === link.getAttribute("data-legal"); })[0];
      if (item && item.url && item.url !== "#") link.href = assetUrl(item.url);
    });
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
    } else if (v.typeMismatch && field.type === "url") {
      message = T.form.url;
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

  // Where applications go: the "beyond-apply" Edge Function in Supabase.
  // The address comes from js/config.js (written while publishing).
  function applyEndpoint() {
    var conn = window.BEYOND_CONFIG || {};
    if (!conn.supabaseUrl || !conn.supabaseAnonKey) return null;
    return {
      url: conn.supabaseUrl.replace(/\/+$/, "") + "/functions/v1/beyond-apply",
      key: conn.supabaseAnonKey
    };
  }

  // Cloudflare Turnstile ("are you a person?"), loaded only on pages with a form
  var turnstileReady = null;
  function loadTurnstile() {
    if (!turnstileReady) {
      turnstileReady = new Promise(function (resolve, reject) {
        window.beyondTurnstileLoaded = function () { resolve(window.turnstile); };
        var script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=beyondTurnstileLoaded";
        script.async = true;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    return turnstileReady;
  }

  // The answers as { name: value }: tick boxes become true / false
  function formValues(form) {
    var values = {};
    Array.prototype.forEach.call(form.elements, function (field) {
      if (!field.name || field.closest(".hp") || field.disabled) return;
      if (field.type === "checkbox") values[field.name] = field.checked;
      else if (field.type !== "submit" && field.type !== "button") values[field.name] = field.value.trim();
    });
    return values;
  }

  function setupForm(form) {
    var key = form.getAttribute("data-form");
    var endpoint = applyEndpoint();
    var thanks = document.getElementById(form.getAttribute("data-thanks"));
    var status = form.querySelector(".form-status");
    var submit = form.querySelector('[type="submit"]');
    var captchaBox = form.querySelector(".form-captcha");
    var siteKey = (DATA.applications && DATA.applications.turnstileSiteKey) || "";
    var captchaId = null;

    form.noValidate = true; // we show our own, friendlier messages

    if (endpoint && siteKey && captchaBox) {
      loadTurnstile().then(function (turnstile) {
        captchaBox.hidden = false;
        captchaId = turnstile.render(captchaBox, { sitekey: siteKey, theme: "light" });
      }, function () {
        console.error("Beyond: the spam check could not be loaded.");
      });
    }

    function showStatus(message) {
      if (!status) return;
      status.textContent = message.replace("{email}", DATA.contact.email);
      status.hidden = false;
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

      // 3. The "are you a person?" check must be done
      var captchaToken = captchaId !== null && window.turnstile ? window.turnstile.getResponse(captchaId) : "";
      if (captchaId !== null && !captchaToken) {
        showStatus(T.form.captchaMissing);
        return;
      }

      // 4. Send
      var originalLabel = submit.textContent;
      submit.disabled = true;
      submit.textContent = T.form.sending;
      function reset() {
        submit.disabled = false;
        submit.textContent = originalLabel;
      }

      if (!endpoint) {                       // js/config.js missing: nothing to send to
        console.error("Beyond: js/config.js is missing, so the form can't be sent.");
        reset();
        showStatus(T.form.error);
        return;
      }

      fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: endpoint.key,
          Authorization: "Bearer " + endpoint.key
        },
        body: JSON.stringify({
          role: key,
          fields: formValues(form),
          honeypot: trap ? trap.value : "",
          turnstileToken: captchaToken
        })
      })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (data) {
            if (response.ok) {
              reset();
              showThanks();
              return;
            }
            var messages = { duplicate: T.form.duplicate, rate_limited: T.form.tooMany, captcha: T.form.captcha, invalid: T.form.invalid };
            throw { message: messages[data.error] || T.form.error, status: response.status };
          });
        })
        .catch(function (error) {
          // A refusal the visitor can act on (already applied, too many, check the answers)
          // is not an error of the site; only log real failures
          if (!error || !error.status || error.status >= 500) console.error("Beyond: form could not be sent.", error);
          reset();
          if (captchaId !== null && window.turnstile) window.turnstile.reset(captchaId);
          showStatus((error && typeof error.message === "string" && error.status) ? error.message : T.form.error);
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
