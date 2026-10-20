/* ==========================================================================
   BEYOND — members.js
   --------------------------------------------------------------------------
   The members area: sign-in and the directory (members.html), and editing
   your own card (my-card.html). The data lives in Supabase (free plan);
   the rules that protect it are in supabase/schema.sql.
   The Supabase address and key come from js/config.js (kept out of GitHub,
   see js/config.example.js); the max lines are in js/content.js → members.

   BUILT TO STAY WELL INSIDE THE FREE PLAN
   - The directory is ONE request, kept in this browser for 10 minutes.
     The Refresh button gets a fresh copy, at most once every 30 seconds.
   - Photos are small (400 × 400 JPEG, resized in the browser before upload)
     and only load when they scroll into view.
   - Photo links last 7 days and are remembered, so a returning member's
     browser reuses the photos it already downloaded.
   - Sign-in links: at most one request per minute from this browser
     (Supabase also has its own limits).
   - Saving a card: at most once every 3 seconds and 30 times an hour
     (the database enforces this too).
   ========================================================================== */

(function () {
  "use strict";

  var DATA = window.BEYOND;
  var UI = window.BEYOND_UI;
  if (!DATA || !UI) return;

  var PAGE = document.body.getAttribute("data-page");   // "members" or "my-card"
  var CFG = DATA.members || {};
  var T = UI.strings.members;
  var esc = UI.esc;
  var MAX = { studies: CFG.maxStudies || 3, experience: CFG.maxExperience || 3 };

  var DIRECTORY_TTL = 10 * 60 * 1000;        // keep the directory for 10 minutes
  var REFRESH_GAP = 30 * 1000;               // manual refresh at most every 30 seconds
  var PHOTO_LINK_SECONDS = 7 * 24 * 3600;    // photo links last 7 days
  var PHOTO_RENEW = 24 * 3600 * 1000;        // renew links with less than a day left
  var SIGNIN_GAP = 60 * 1000;                // one sign-in email per minute
  var SAVE_GAP = 3 * 1000;                   // same as the database rule
  var PHOTO_SIZE = 400;
  var PHOTO_QUALITY = 0.82;
  var PHOTO_MAX_BYTES = 15 * 1024 * 1024;    // largest original photo we accept

  // Names in the shared Supabase project (see supabase/schema.sql)
  var TABLE = "beyond_profiles";
  var BUCKET = "beyond-avatars";
  var COLUMNS = "id, role, status, is_listed, first_name, last_name, city, country, " +
                "position, company, studies, experience, photo_path";
  var PLACEHOLDER = UI.assetUrl(DATA.placeholderPhoto);
  var MEMBERS_URL = UI.pageUrl("members.html");

  // Demo mode until js/config.js gives the Supabase address and key
  var CONN = window.BEYOND_CONFIG || {};
  var DEMO = !CONN.supabaseUrl || !CONN.supabaseAnonKey;
  var db = null;
  if (!DEMO && window.supabase) {
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
  var SIGNIN_KEY = "beyond.signin.next";
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

  function signOut(uid) {
    store.drop(PHOTOS_KEY);
    if (uid) store.drop(directoryKey(uid));
    var done = function () { location.href = MEMBERS_URL; };
    if (db) db.auth.signOut().then(done, done); else done();
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
     1. Directory (members.html)
     ======================================================================== */
  function setupDirectoryPage() {
    var loading = $("members-loading");
    var signin = $("members-signin");
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
      show(signin, false);
      if (!force) show(loading, true);
      fetchRows(user, force)
        .then(function (rows) {
          var me = rows.filter(function (r) { return r.id === user.id; })[0];
          if (!me || me.status !== "approved") { showInactive(user.id); return null; }
          if (!me.first_name) {                    // first visit: fill in your card first
            location.replace(UI.pageUrl("my-card.html") + "?welcome=1");
            return null;
          }
          state.rows = prepare(rows.filter(function (r) {
            return r.status === "approved" && r.is_listed && r.first_name;
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

    // --- Sign-in form ---
    function setupSignIn() {
      var form = $("signin-form");
      var input = $("signin-email");
      var status = $("signin-status");
      var button = form.querySelector('[type="submit"]');
      var timer = null;

      function secondsLeft() {
        return Math.max(0, Math.ceil(((store.get(SIGNIN_KEY) || 0) - Date.now()) / 1000));
      }

      // While waiting, the button shows a countdown
      function tick() {
        clearTimeout(timer);
        var s = secondsLeft();
        button.disabled = s > 0;
        button.textContent = s > 0 ? T.sendLink + " (" + s + ")" : T.sendLink;
        if (s > 0) timer = setTimeout(tick, 1000);
      }
      tick();

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!UI.validateField(input)) { input.focus(); return; }
        if (secondsLeft() > 0) { say(status, T.signInWait.replace("{s}", secondsLeft())); return; }

        store.set(SIGNIN_KEY, Date.now() + SIGNIN_GAP);
        button.disabled = true;
        db.auth.signInWithOtp({
          email: input.value.trim().toLowerCase(),
          options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname }
        })
          .then(function (res) {
            var error = res.error;
            if (error && error.status === 429) {
              say(status, T.signInTooMany, true);
            } else if (error && (!error.status || error.status >= 500)) {
              store.drop(SIGNIN_KEY);
              say(status, withEmail(T.signInError), true);
            } else {
              // Same message whether or not the email is a member, so nobody can check who is
              say(status, T.signInSent);
            }
            tick();
          })
          .catch(function () {
            store.drop(SIGNIN_KEY);
            say(status, withEmail(T.signInError), true);
            tick();
          });
      });
    }

    // --- Start ---
    if (DEMO) {
      say($("members-demo"), T.demoNote);
      directory.querySelector("[data-signout]").hidden = true;
      directory.querySelector("[data-refresh]").hidden = true;
      state.rows = prepare(demoRows());
      show(loading, false);
      show(directory, true);
      render();
      return;
    }
    if (!db) {
      show(loading, false);
      say(notice, T.loadError, true);
      return;
    }

    setupSignIn();
    watchSession(open, function () {
      show(loading, false);
      show(directory, false);
      show(signin, true);
      if (LINK_ERROR) say($("signin-status"), T.linkExpired, true);
    });
  }

  // Sample cards for demo mode, built from the Home page mentors
  function demoRows() {
    var rows = (DATA.mentors || []).map(function (m, i) {
      var place = UI.pick(m.location).split(", ");
      return {
        id: "demo-mentor-" + i, role: "mentor", status: "approved", is_listed: true,
        first_name: "Sample", last_name: "Mentor " + (i + 1),
        city: place[0] || "", country: place.slice(1).join(", "),
        position: UI.pick(m.role), company: "",
        studies: [UI.pick(m.studied)], experience: [UI.pick(m.experience)], photo_path: null
      };
    });
    rows.push(
      {
        id: "demo-mentee-1", role: "mentee", status: "approved", is_listed: true,
        first_name: "Sample", last_name: "Mentee 1", city: "Milan", country: "Italy",
        position: "MSc student in Biomedical Engineering", company: "Politecnico di Milano",
        studies: ["Politecnico di Milano, BSc Biomedical Engineering"],
        experience: ["Research assistant in a bioengineering lab"], photo_path: null
      },
      {
        id: "demo-mentee-2", role: "mentee", status: "approved", is_listed: true,
        first_name: "Sample", last_name: "Mentee 2", city: "Bologna", country: "Italy",
        position: "BSc student in Physics", company: "Università di Bologna",
        studies: ["Università di Bologna, BSc Physics (2nd year)"], experience: [], photo_path: null
      }
    );
    return rows;
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
      if (DEMO) { say(status, T.demoSave); return; }
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

    if (DEMO) {
      say($("members-demo"), T.demoNote);
      $("card-signout").hidden = true;
      profile = demoRows()[0];
      fill(profile);
      show(loading, false);
      show(editor, true);
      return;
    }
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
      location.replace(MEMBERS_URL);              // not signed in: go to the sign-in page
    });
  }

  /* ------------------------------------------------------------------------
     Start the right page
     ------------------------------------------------------------------------ */
  if (PAGE === "members") setupDirectoryPage();
  if (PAGE === "my-card") setupCardPage();
})();
