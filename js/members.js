/* ==========================================================================
   BEYOND — members.js
   --------------------------------------------------------------------------
   The members area: logging in (login.html), the directory (members.html),
   your profile, i.e. your card in the directory (my-card.html), the join link from the acceptance email
   (join.html) and choosing a new password (reset-password.html).
   The data lives in Supabase (free plan); the rules that protect it are in
   supabase/schema.sql and supabase/002-applications.sql, and the emails are
   sent by the Edge Functions in supabase/functions/.
   The Supabase address and key come from js/config.js (kept out of GitHub,
   see js/config.example.js); the max lines are in js/content.js → members.

   BUILT TO STAY WELL INSIDE THE FREE PLAN
   - The directory is ONE request, kept in this browser for 10 minutes.
     The Refresh button gets a fresh copy, at most once every 30 seconds.
   - Photos are small (400 × 400 JPEG, resized in the browser before upload)
     and only load when they scroll into view.
   - Photo links last 7 days and are remembered, so a returning member's
     browser reuses the photos it already downloaded.
   - "Forgot password" emails: at most one request per minute from this
     browser (the Edge Function has its own limits too).
   - Saving a card: at most once every 3 seconds and 30 times an hour
     (the database enforces this too).
   ========================================================================== */

(function () {
  "use strict";

  var DATA = window.BEYOND;
  var UI = window.BEYOND_UI;
  if (!DATA || !UI) return;

  var PAGE = document.body.getAttribute("data-page");   // "login", "members", "my-card", "join" or "reset"
  var CFG = DATA.members || {};
  var T = UI.strings.members;
  var esc = UI.esc;
  var MAX = { studies: CFG.maxStudies || 3, experience: CFG.maxExperience || 3 };

  var DIRECTORY_TTL = 10 * 60 * 1000;        // keep the directory for 10 minutes
  var REFRESH_GAP = 30 * 1000;               // manual refresh at most every 30 seconds
  var PHOTO_LINK_SECONDS = 7 * 24 * 3600;    // photo links last 7 days
  var PHOTO_RENEW = 24 * 3600 * 1000;        // renew links with less than a day left
  var RESET_GAP = 60 * 1000;                 // one "forgot password" email per minute
  var SAVE_GAP = 3 * 1000;                   // same as the database rule
  var MIN_PASSWORD = 10;                     // same as the beyond-join Edge Function
  var PHOTO_SIZE = 400;
  var PHOTO_QUALITY = 0.82;
  var PHOTO_MAX_BYTES = 15 * 1024 * 1024;    // largest original photo we accept

  // Names in the shared Supabase project (see supabase/schema.sql)
  var TABLE = "beyond_profiles";
  var BUCKET = "beyond-avatars";
  var COLUMNS = "id, role, status, is_listed, first_name, last_name, city, country, " +
                "position, company, studies, experience, photo_path, onboarded_at";
  var PLACEHOLDER = UI.assetUrl(DATA.placeholderPhoto);
  var LOGIN_URL = UI.pageUrl("login.html");
  var PROFILE_URL = UI.pageUrl("my-card.html");

  // The Supabase address and key come from js/config.js (written while publishing).
  // Without it the members pages say they can't load, instead of half-working.
  var CONN = window.BEYOND_CONFIG || {};
  var db = null;
  if (CONN.supabaseUrl && CONN.supabaseAnonKey && window.supabase) {
    db = window.supabase.createClient(CONN.supabaseUrl, CONN.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  // A sign-in link that has expired or was already used comes back with an error
  var LINK_ERROR = /error_code=|error_description=/.test(location.hash);

  /* ------------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------------ */
  function $(id) { return document.getElementById(id); }

  function show(el, visible) { if (el) el.hidden = !visible; }

  // Browser storage can be turned off or full: never let that break the page
  var store = {
    get: function (key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
    set: function (key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ } },
    drop: function (key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  };
  var PHOTOS_KEY = "beyond.photos.v1";
  var RESET_KEY = "beyond.reset.next";
  function directoryKey(uid) { return "beyond.directory.v1." + uid; }

  // Lower case, without accents: "Zürich" is found by typing "zurich"
  function fold(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function say(el, message, isError) {
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("is-error", !!isError);
    el.hidden = !message;
  }

  function withEmail(text) {
    return text.replace("{email}", DATA.contact.email);
  }

  // Removes the sign-in details Supabase adds to the address after a link is used
  function cleanAddress() {
    if (/access_token=|refresh_token=|error_code=|error_description=/.test(location.hash)) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  var leaving = false;                       // logging out: the logout decides where to go
  function signOut(uid) {
    leaving = true;
    store.drop(PHOTOS_KEY);
    if (uid) store.drop(directoryKey(uid));
    var done = function () { location.href = LOGIN_URL; };
    if (db) db.auth.signOut().then(done, done); else done();
  }

  // Calls a Beyond Edge Function (supabase/functions/). Resolves with
  // { status, data } whatever the answer, so callers can show the right message.
  function callFunction(name, body) {
    return db.functions.invoke(name, { body: body }).then(function (res) {
      if (!res.error) return { status: 200, data: res.data || {} };
      var reply = res.error.context;
      if (reply && typeof reply.json === "function") {
        return reply.json().then(
          function (data) { return { status: reply.status, data: data || {} }; },
          function () { return { status: reply.status, data: {} }; });
      }
      return { status: 0, data: {} };
    }, function () { return { status: 0, data: {} }; });
  }

  // Checks a new password and its repetition; shows the problem under the field
  function checkNewPassword(input, repeat) {
    var problem = input.value.length < MIN_PASSWORD ? T.passwordShort.replace("{min}", MIN_PASSWORD) : "";
    var mismatch = !problem && input.value !== repeat.value ? T.passwordMismatch : "";
    [[input, problem], [repeat, mismatch]].forEach(function (pair) {
      var errorEl = $(pair[0].id + "-error");
      if (pair[1]) pair[0].setAttribute("aria-invalid", "true"); else pair[0].removeAttribute("aria-invalid");
      say(errorEl, pair[1], true);
    });
    if (problem) { input.focus(); return false; }
    if (mismatch) { repeat.focus(); return false; }
    return true;
  }

  // Calls onUser(user) or onNoUser() once the session is known, and again on sign-in/out
  function watchSession(onUser, onNoUser) {
    var handled;
    db.auth.onAuthStateChange(function (event, session) {
      var user = session && session.user ? session.user : null;
      var uid = user ? user.id : null;
      if (uid === handled) return;          // e.g. a token refresh: nothing changed
      handled = uid;
      // Run after Supabase has finished its own work for this event
      setTimeout(function () {
        if (leaving) return;
        cleanAddress();
        if (user) onUser(user); else onNoUser();
      }, 0);
    });
  }

  /* ------------------------------------------------------------------------
     Photos: temporary links (7 days), remembered in this browser
     ------------------------------------------------------------------------ */
  function photoLinks(paths) {
    var cache = store.get(PHOTOS_KEY) || {};
    var now = Date.now();
    Object.keys(cache).forEach(function (p) { if (!cache[p] || cache[p].exp < now) delete cache[p]; });

    var missing = [];
    paths.forEach(function (p) {
      if (p && missing.indexOf(p) === -1 && (!cache[p] || cache[p].exp - now < PHOTO_RENEW)) missing.push(p);
    });
    if (!missing.length || !db) return Promise.resolve(cache);

    // One request for all missing links
    return db.storage.from(BUCKET).createSignedUrls(missing, PHOTO_LINK_SECONDS)
      .then(function (res) {
        (res.data || []).forEach(function (item) {
          if (item && item.signedUrl && !item.error) {
            cache[item.path] = { url: item.signedUrl, exp: now + PHOTO_LINK_SECONDS * 1000 };
          }
        });
        store.set(PHOTOS_KEY, cache);
        return cache;
      })
      .catch(function () { return cache; });
  }

  function photoUrl(links, path) {
    return (path && links[path] && links[path].url) || PLACEHOLDER;
  }

  // Missing or expired photo: show the placeholder instead
  function usePlaceholderOnError(container) {
    container.addEventListener("error", function (event) {
      var img = event.target;
      if (img.tagName === "IMG" && img.src !== PLACEHOLDER) img.src = PLACEHOLDER;
    }, true);
  }

  /* ------------------------------------------------------------------------
     Shown when the account exists but is not (or no longer) active
     ------------------------------------------------------------------------ */
  function showInactive(uid) {
    show($("members-loading"), false);
    var panel = $("members-inactive");
    if (!panel) return;
    $("members-inactive-text").textContent = withEmail(T.notActive);
    panel.querySelector("[data-signout]").addEventListener("click", function () { signOut(uid); });
    show(panel, true);
  }

  /* ========================================================================
     0. Login (login.html): email and password, or "Forgot your password?"
     After signing in you go to your profile (my-card.html), or back to the
     page that sent you here (?next=members or ?next=admin).
     ======================================================================== */
  function loginTarget() {
    var match = /[?&]next=(members|admin)(&|$)/.exec(location.search);
    return match ? UI.pageUrl(match[1] + ".html") : PROFILE_URL;
  }

  function setupLoginPage() {
    var loading = $("members-loading");
    loading.textContent = T.loading;
    var panel = $("members-signin");

    // --- Sign-in form ---
    function setupSignIn() {
      var form = $("signin-form");
      var email = $("signin-email");
      var password = $("signin-password");
      var status = $("signin-status");
      var button = form.querySelector('[type="submit"]');

      form.addEventListener("input", function (event) {
        if (event.target.getAttribute("aria-invalid") === "true") UI.validateField(event.target);
      });

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        say(status, "");
        var firstInvalid = [email, password].filter(function (f) { return !UI.validateField(f); })[0];
        if (firstInvalid) { firstInvalid.focus(); return; }

        button.disabled = true;
        button.textContent = T.signingIn;
        db.auth.signInWithPassword({ email: email.value.trim().toLowerCase(), password: password.value })
          .then(function (res) {
            var error = res.error;
            if (!error) return;                      // watchSession takes them to their profile
            if (error.status === 429) say(status, T.signInTooMany, true);
            else if (error.status === 400) say(status, T.signInWrong, true);
            else say(status, withEmail(T.signInError), true);
          })
          .catch(function () { say(status, withEmail(T.signInError), true); })
          .then(function () {
            button.disabled = false;
            button.textContent = T.signIn;
          });
      });
    }

    // --- Forgot password: the beyond-password-reset Edge Function emails a link ---
    function setupForgotPassword() {
      var signinPanel = $("signin-panel");
      var resetPanel = $("reset-panel");
      var form = $("reset-form");
      var input = $("reset-email");
      var status = $("reset-status");
      var button = form.querySelector('[type="submit"]');
      var timer = null;

      function switchTo(reset) {
        show(signinPanel, !reset);
        show(resetPanel, reset);
        if (reset) {
          if (!input.value) input.value = $("signin-email").value.trim();
          input.focus();
        } else {
          $("signin-email").focus();
        }
      }
      signinPanel.querySelector("[data-show-reset]").addEventListener("click", function () { switchTo(true); });
      resetPanel.querySelector("[data-show-signin]").addEventListener("click", function () { switchTo(false); });

      function secondsLeft() {
        return Math.max(0, Math.ceil(((store.get(RESET_KEY) || 0) - Date.now()) / 1000));
      }

      // While waiting, the button shows a countdown
      function tick() {
        clearTimeout(timer);
        var s = secondsLeft();
        button.disabled = s > 0;
        button.textContent = s > 0 ? T.resetSend + " (" + s + ")" : T.resetSend;
        if (s > 0) timer = setTimeout(tick, 1000);
      }
      tick();

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!UI.validateField(input)) { input.focus(); return; }
        if (secondsLeft() > 0) { say(status, T.resetWait.replace("{s}", secondsLeft())); return; }

        store.set(RESET_KEY, Date.now() + RESET_GAP);
        button.disabled = true;
        callFunction("beyond-password-reset", { email: input.value.trim().toLowerCase() })
          .then(function (res) {
            if (res.status === 429) {
              say(status, T.signInTooMany, true);
            } else if (res.status !== 200) {
              store.drop(RESET_KEY);
              say(status, withEmail(T.signInError), true);
            } else {
              // Same message whether or not the email is a member, so nobody can check who is
              say(status, T.resetSent);
            }
            tick();
          });
      });
    }

    // --- Start ---
    if (!db) {
      show(loading, false);
      say($("members-notice"), T.loadError, true);
      return;
    }

    watchSession(function () {
      location.replace(loginTarget());              // already signed in
    }, function () {
      show(loading, false);
      show(panel, true);
      if (LINK_ERROR) say($("signin-status"), T.linkExpired, true);
      $("signin-email").focus();
    });
    setupSignIn();
    setupForgotPassword();
  }

  /* ========================================================================
     1. Directory (members.html)
     ======================================================================== */
  function setupDirectoryPage() {
    var loading = $("members-loading");
    var directory = $("members-directory");
    var grid = $("member-grid");
    var search = $("members-search");
    var countEl = $("members-count");
    var emptyEl = $("members-empty");
    var notice = $("members-notice");
    var tabs = directory.querySelectorAll("[data-filter]");

    loading.textContent = T.loading;
    emptyEl.textContent = T.empty;

    var state = { rows: [], links: {}, filter: "all", query: "", user: null, fetchedAt: 0 };

    usePlaceholderOnError(grid);

    // --- Cards ---
    function lines(list) {
      return '<ul class="member-lines">' + list.map(function (line) { return "<li>" + esc(line) + "</li>"; }).join("") + "</ul>";
    }

    function fact(label, list) {
      return '<div class="mentor-fact"><dt>' + esc(label) + "</dt><dd>" + lines(list) + "</dd></div>";
    }

    function card(m) {
      var name = (m.first_name + " " + m.last_name).trim();
      var work = [m.position, m.company].filter(Boolean).join(" · ");
      var place = [m.city, m.country].filter(Boolean).join(", ");
      var badge = m.role === "mentor" ? T.mentor : m.role === "mentee" ? T.mentee : T.team;
      var facts = (m.studies && m.studies.length ? fact(T.studies, m.studies) : "") +
                  (m.experience && m.experience.length ? fact(T.experience, m.experience) : "");
      return (
        '<li class="mentor-card member-card">' +
          '<div class="mentor-photo">' +
            '<img src="' + esc(photoUrl(state.links, m.photo_path)) + '" alt="' + esc(UI.strings.portraitOf.replace("{name}", name)) +
            '" width="400" height="400" loading="lazy" decoding="async">' +
          "</div>" +
          '<div class="mentor-body">' +
            '<p class="member-badge member-badge--' + esc(m.role) + '">' + esc(badge) + "</p>" +
            '<h3 class="member-name">' + esc(name) + "</h3>" +
            (work ? '<p class="mentor-role">' + esc(work) + "</p>" : "") +
            (place ? '<p class="mentor-location">' + esc(place) + "</p>" : "") +
            (facts ? '<dl class="mentor-facts">' + facts + "</dl>" : "") +
          "</div>" +
        "</li>"
      );
    }

    // --- Filtering ---
    function prepare(rows) {
      rows.forEach(function (m) {
        m.studies = m.studies || [];
        m.experience = m.experience || [];
        m.searchText = fold([m.first_name, m.last_name, m.position, m.company, m.city, m.country]
          .concat(m.studies, m.experience).join(" "));
      });
      return rows;
    }

    function render() {
      var words = fold(state.query).split(/\s+/).filter(Boolean);
      var shown = state.rows.filter(function (m) {
        if (state.filter !== "all" && m.role !== state.filter) return false;
        return words.every(function (w) { return m.searchText.indexOf(w) !== -1; });
      });

      grid.innerHTML = shown.map(card).join("");
      countEl.textContent = shown.length === 1 ? T.countOne : T.count.replace("{n}", shown.length);
      show(emptyEl, !shown.length);

      var totals = { all: state.rows.length, mentor: 0, mentee: 0 };
      state.rows.forEach(function (m) { if (totals[m.role] !== undefined) totals[m.role]++; });
      directory.querySelectorAll("[data-count]").forEach(function (el) {
        el.textContent = totals[el.getAttribute("data-count")];
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        state.filter = tab.getAttribute("data-filter");
        tabs.forEach(function (t) { t.setAttribute("aria-pressed", String(t === tab)); });
        render();
      });
    });

    var typing = null;
    search.addEventListener("input", function () {
      clearTimeout(typing);
      typing = setTimeout(function () { state.query = search.value; render(); }, 120);
    });

    // --- Loading ---
    function fetchRows(user, force) {
      var key = directoryKey(user.id);
      var cached = store.get(key);
      if (!force && cached && Date.now() - cached.at < DIRECTORY_TTL) {
        state.fetchedAt = cached.at;
        return Promise.resolve(cached.rows);
      }
      // One request: Row Level Security returns only what this member may see
      return db.from(TABLE).select(COLUMNS)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })
        .then(function (res) {
          if (res.error) throw res.error;
          state.fetchedAt = Date.now();
          store.set(key, { at: state.fetchedAt, rows: res.data });
          return res.data;
        });
    }

    function open(user, force) {
      state.user = user;
      if (!force) show(loading, true);
      fetchRows(user, force)
        .then(function (rows) {
          var me = rows.filter(function (r) { return r.id === user.id; })[0];
          if (!me || me.status !== "approved") { showInactive(user.id); return null; }
          if (!me.onboarded_at) {                  // first visit: check and save your card first
            location.replace(PROFILE_URL + "?welcome=1");
            return null;
          }
          show(directory.querySelector("[data-admin-link]"), me.role === "admin");
          // Admins can read every card: the directory still shows only the finished, visible ones
          state.rows = prepare(rows.filter(function (r) {
            return r.status === "approved" && r.is_listed && r.onboarded_at;
          }));
          return photoLinks(state.rows.map(function (r) { return r.photo_path; }));
        })
        .then(function (links) {
          if (!links) return;
          state.links = links;
          show(loading, false);
          show(directory, true);
          render();
        })
        .catch(function (error) {
          console.error("Beyond: the directory could not be loaded.", error);
          show(loading, false);
          say(notice, T.loadError, true);
        });
    }

    directory.querySelector("[data-refresh]").addEventListener("click", function () {
      if (!state.user) return;
      if (Date.now() - state.fetchedAt < REFRESH_GAP) {
        say(notice, T.refreshWait);
        return;
      }
      say(notice, "");
      open(state.user, true);
    });

    directory.querySelector("[data-signout]").addEventListener("click", function () {
      signOut(state.user && state.user.id);
    });

    // --- Start ---
    if (!db) {
      show(loading, false);
      say(notice, T.loadError, true);
      return;
    }

    watchSession(open, function () {
      location.replace(LOGIN_URL + "?next=members");   // not signed in: log in first
    });
  }

  /* ========================================================================
     2. My card (my-card.html)
     ======================================================================== */
  function setupCardPage() {
    var loading = $("members-loading");
    loading.textContent = T.loading;
    var editor = $("card-editor");
    var form = $("card-form");
    var status = $("card-status");
    var saveButton = form.querySelector('[type="submit"]');
    var photoInput = $("photo");
    var preview = $("photo-preview");
    var removeButton = $("photo-remove");
    var photoError = $("photo-error");

    var FIELDS = ["first_name", "last_name", "city", "country", "position", "company"];
    var user = null;
    var profile = null;
    var pendingPhoto = null;     // resized photo waiting to be saved
    var removePhoto = false;
    var lastSave = 0;

    usePlaceholderOnError(preview.parentNode);

    // Studies and Experience: one input per allowed line
    function buildLines(listId, key, label) {
      var list = $(listId);
      var html = "";
      for (var i = 1; i <= MAX[key]; i++) {
        html += '<input class="input" type="text" maxlength="200" data-line="' + key + '" ' +
                'aria-label="' + esc(label + ", " + i) + '" aria-describedby="' + key + '-hint ' + key + '-error">';
      }
      list.innerHTML = html;
    }
    buildLines("studies-list", "studies", T.studies);
    buildLines("experience-list", "experience", T.experience);
    $("studies-max").textContent = MAX.studies;
    $("experience-max").textContent = MAX.experience;

    function lineInputs(key) {
      return Array.prototype.slice.call(form.querySelectorAll('[data-line="' + key + '"]'));
    }
    function lineValues(key) {
      return lineInputs(key).map(function (i) { return i.value.trim(); }).filter(Boolean);
    }

    function fill(p) {
      FIELDS.forEach(function (f) { form.elements[f].value = p[f] || ""; });
      ["studies", "experience"].forEach(function (key) {
        lineInputs(key).forEach(function (input, i) { input.value = (p[key] || [])[i] || ""; });
      });
      form.elements.is_listed.checked = p.is_listed !== false;
      show(removeButton, !!p.photo_path);
      if (p.photo_path) {
        photoLinks([p.photo_path]).then(function (links) {
          if (!pendingPhoto && !removePhoto) preview.src = photoUrl(links, p.photo_path);   // unless a new one was chosen meanwhile
        });
      }
    }

    // --- Photo: shrink to 400 × 400 JPEG in the browser before upload ---
    function resizePhoto(file) {
      return new Promise(function (resolve, reject) {
        if (!/^image\//.test(file.type)) return reject(T.photoType);
        if (file.size > PHOTO_MAX_BYTES) return reject(T.photoTooBig);
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          var side = Math.min(img.naturalWidth, img.naturalHeight);
          var canvas = document.createElement("canvas");
          canvas.width = canvas.height = PHOTO_SIZE;
          // Square crop from the centre
          canvas.getContext("2d").drawImage(img,
            (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
            0, 0, PHOTO_SIZE, PHOTO_SIZE);
          URL.revokeObjectURL(url);
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob); else reject(T.photoUnreadable);
          }, "image/jpeg", PHOTO_QUALITY);
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(T.photoUnreadable); };
        img.src = url;
      });
    }

    photoInput.addEventListener("change", function () {
      var file = photoInput.files && photoInput.files[0];
      say(photoError, "");
      if (!file) return;
      saveButton.disabled = true;               // so the card is never saved without the photo being ready
      resizePhoto(file)
        .then(function (blob) {
          pendingPhoto = blob;
          removePhoto = false;
          preview.src = URL.createObjectURL(blob);
          show(removeButton, true);
        })
        .catch(function (message) {
          photoInput.value = "";
          say(photoError, typeof message === "string" ? message : T.photoUnreadable, true);
        })
        .then(function () { saveButton.disabled = false; });
    });

    removeButton.addEventListener("click", function () {
      pendingPhoto = null;
      removePhoto = true;
      photoInput.value = "";
      preview.src = PLACEHOLDER;
      show(removeButton, false);
    });

    // --- Checks ---
    function validate() {
      var firstInvalid = null;
      form.querySelectorAll("[required]").forEach(function (field) {
        if (!UI.validateField(field) && !firstInvalid) firstInvalid = field;
      });
      var studiesError = $("studies-error");
      var noStudies = !lineValues("studies").length;
      say(studiesError, noStudies ? T.atLeastOne : "", true);
      lineInputs("studies").forEach(function (i) {
        if (noStudies) i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid");
      });
      if (noStudies && !firstInvalid) firstInvalid = lineInputs("studies")[0];
      return firstInvalid;
    }

    form.addEventListener("input", function (event) {
      if (event.target.getAttribute("aria-invalid") === "true") {
        if (event.target.getAttribute("data-line") === "studies") validate();
        else UI.validateField(event.target);
      }
    });

    function errorMessage(error) {
      var text = String((error && (error.message || error)) || "");
      if (text.indexOf("too many") !== -1) return T.saveTooMany;
      if (text.indexOf("rate_limited") !== -1) return T.saveWait;
      return T.saveError;
    }

    // --- Save: upload the new photo (if any), update the card, tidy up the old photo ---
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      say(status, "");
      var firstInvalid = validate();
      if (firstInvalid) { firstInvalid.focus(); return; }
      if (Date.now() - lastSave < SAVE_GAP) { say(status, T.saveWait, true); return; }

      var changes = {};
      FIELDS.forEach(function (f) { changes[f] = form.elements[f].value.trim(); });
      changes.studies = lineValues("studies");
      changes.experience = lineValues("experience");
      changes.is_listed = form.elements.is_listed.checked;

      var oldPath = profile.photo_path || null;
      var newPath = removePhoto ? null : oldPath;
      var uploaded = null;

      saveButton.disabled = true;
      saveButton.textContent = T.saving;
      lastSave = Date.now();

      var upload = Promise.resolve();
      if (pendingPhoto) {
        // A new file name each time, so browsers never show an old cached photo
        uploaded = user.id + "/avatar-" + Date.now() + ".jpg";
        upload = db.storage.from(BUCKET)
          .upload(uploaded, pendingPhoto, { contentType: "image/jpeg", cacheControl: "604800", upsert: false })
          .then(function (res) { if (res.error) throw res.error; newPath = uploaded; });
      }

      upload
        .then(function () {
          changes.photo_path = newPath;
          return db.from(TABLE).update(changes).eq("id", user.id);
        })
        .then(function (res) {
          if (res.error) throw res.error;
          if (oldPath && oldPath !== newPath) db.storage.from(BUCKET).remove([oldPath]);
          Object.keys(changes).forEach(function (k) { profile[k] = changes[k]; });
          pendingPhoto = null;
          removePhoto = false;
          photoInput.value = "";
          store.drop(directoryKey(user.id));       // the directory shows the new card next time
          say(status, T.saved);
          show($("card-done"), true);
        })
        .catch(function (error) {
          console.error("Beyond: the card could not be saved.", error);
          // Undo a photo upload whose card update failed
          if (uploaded && newPath === uploaded) db.storage.from(BUCKET).remove([uploaded]);
          say(status, errorMessage(error), true);
        })
        .then(function () {
          saveButton.disabled = false;
          saveButton.textContent = saveButton.getAttribute("data-label");
        });
    });
    saveButton.setAttribute("data-label", saveButton.textContent);

    $("card-signout").addEventListener("click", function () { signOut(user && user.id); });

    // --- Start ---
    if (/[?&]welcome=1/.test(location.search)) say($("card-welcome"), T.welcome);

    if (!db) {
      show(loading, false);
      say($("members-notice"), T.loadError, true);
      return;
    }

    watchSession(function (signedIn) {
      user = signedIn;
      db.from(TABLE).select(COLUMNS).eq("id", user.id).maybeSingle()
        .then(function (res) {
          if (res.error) throw res.error;
          if (!res.data || res.data.status !== "approved") { showInactive(user.id); return; }
          profile = res.data;
          fill(profile);
          show(loading, false);
          show(editor, true);
        })
        .catch(function (error) {
          console.error("Beyond: your card could not be loaded.", error);
          show(loading, false);
          say($("members-notice"), T.loadError, true);
        });
    }, function () {
      location.replace(LOGIN_URL);                // not signed in: log in first
    });
  }

  /* ========================================================================
     3. Join link from the acceptance email (join.html?token=…)
     The beyond-join Edge Function checks the link, then creates the account
     with the chosen password; the database pre-fills the card from the
     application. Then: sign in, and check the card on my-card.html.
     ======================================================================== */
  function setupJoinPage() {
    var loading = $("members-loading");
    loading.textContent = T.loading;
    var panel = $("join-panel");
    var form = $("join-form");
    var password = $("join-password");
    var repeat = $("join-password2");
    var status = $("join-status");
    var button = form.querySelector('[type="submit"]');
    var label = button.textContent;

    var match = /[?&]token=([A-Za-z0-9_-]+)/.exec(location.search);
    var token = match ? match[1] : "";
    var email = "";

    // The link is private: keep it out of the address bar (and the browser history)
    if (token) history.replaceState(null, "", location.pathname);

    function message(text, signOutFirst) {
      show(loading, false);
      show(panel, false);
      $("join-message-text").textContent = withEmail(text);
      show($("join-message"), true);
      // Someone else signed in on this browser? Sign them out so this person can sign in
      if (signOutFirst && db) db.auth.signOut();
    }

    function linkProblem(res) {
      var error = res.data && res.data.error;
      if (error === "used") return T.joinUsed;
      if (error === "expired") return T.joinExpired;
      if (error === "invalid_token") return T.joinInvalid;
      return T.joinError;
    }

    if (!db) { message(T.loadError); return; }
    if (!token) { message(T.joinInvalid); return; }

    callFunction("beyond-join", { action: "check", token: token }).then(function (res) {
      if (res.status !== 200) { message(linkProblem(res)); return; }
      email = res.data.email;
      if (res.data.accountExists) {
        // Nothing to choose: mark the link as used and send them to sign in
        callFunction("beyond-join", { action: "claim", token: token });
        message(T.joinExisting, true);
        return;
      }
      $("join-hello").textContent = res.data.firstName
        ? T.joinHello.replace("{name}", res.data.firstName) : T.joinHelloNoName;
      $("join-email").value = email;
      show(loading, false);
      show(panel, true);
      password.focus();
    });

    form.addEventListener("input", function (event) {
      if (event.target.getAttribute("aria-invalid") === "true") checkNewPassword(password, repeat);
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      say(status, "");
      if (!checkNewPassword(password, repeat)) return;

      button.disabled = true;
      button.textContent = T.joinSaving;
      callFunction("beyond-join", { action: "claim", token: token, password: password.value })
        .then(function (res) {
          if (res.status === 400 && res.data.error === "password") {
            say(status, res.data.message || T.passwordShort.replace("{min}", MIN_PASSWORD), true);
            return;
          }
          if (res.status !== 200) { say(status, linkProblem(res), true); return; }
          if (res.data.accountExists) { message(T.joinExisting, true); return; }
          return db.auth.signInWithPassword({ email: email, password: password.value }).then(function (signin) {
            if (signin.error) { message(T.joinUsed); return; }
            location.replace(PROFILE_URL + "?welcome=1");
          });
        })
        .catch(function () { say(status, withEmail(T.joinError), true); })
        .then(function () {
          button.disabled = false;
          button.textContent = label;
        });
    });
  }

  /* ========================================================================
     4. Choose a new password (reset-password.html)
     Reached from the "forgot password" email (Supabase signs the person in
     from the link), or from My card while signed in.
     ======================================================================== */
  function setupResetPage() {
    var loading = $("members-loading");
    loading.textContent = T.loading;
    var panel = $("password-panel");
    var form = $("password-form");
    var password = $("new-password");
    var repeat = $("new-password2");
    var status = $("password-status");
    var button = form.querySelector('[type="submit"]');
    var label = button.textContent;

    function message(text) {
      show(loading, false);
      show(panel, false);
      $("password-message-text").textContent = text;
      show($("password-message"), true);
    }

    form.addEventListener("input", function (event) {
      if (event.target.getAttribute("aria-invalid") === "true") checkNewPassword(password, repeat);
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      say(status, "");
      if (!checkNewPassword(password, repeat)) return;

      button.disabled = true;
      db.auth.updateUser({ password: password.value })
        .then(function (res) {
          if (res.error) throw res.error;
          form.reset();
          say(status, T.passwordSaved);
          show($("password-done"), true);
        })
        .catch(function (error) {
          console.error("Beyond: the password could not be saved.", error);
          say(status, (error && error.status === 422 && error.message) || T.passwordError, true);
        })
        .then(function () {
          button.disabled = false;
          button.textContent = label;
        });
    });

    if (!db) { message(T.loadError); return; }

    watchSession(function () {
      show(loading, false);
      show($("password-message"), false);
      show(panel, true);
      password.focus();
    }, function () {
      message(LINK_ERROR ? T.linkExpired : T.resetNoLink);
    });
  }

  /* ------------------------------------------------------------------------
     Start the right page
     ------------------------------------------------------------------------ */
  if (PAGE === "login") setupLoginPage();
  if (PAGE === "members") setupDirectoryPage();
  if (PAGE === "my-card") setupCardPage();
  if (PAGE === "join") setupJoinPage();
  if (PAGE === "reset") setupResetPage();
})();
