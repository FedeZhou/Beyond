/* ==========================================================================
   BEYOND — admin.js
   --------------------------------------------------------------------------
   The admin portal (admin.html). Only Beyond admins can use it: the
   database (supabase/002-applications.sql) shows applications, invites and
   the log only to them, and every change goes through the "beyond-admin"
   Edge Function, which checks again that the caller is an admin.
   Hiding this page is NOT what protects the data.

   Three tabs:
     Applications  review, accept (emails the join link) or reject
     Members       everyone accepted: role, suspend / reactivate, remove
     Activity      the last 100 admin actions
   Both lists can be exported to CSV (also the monthly backup, see README).

   The admin texts are in English only, so they are here and not in content.js.
   ========================================================================== */

(function () {
  "use strict";

  var DATA = window.BEYOND;
  var UI = window.BEYOND_UI;
  if (!DATA || !UI) return;

  var esc = UI.esc;
  var LOGIN_URL = UI.pageUrl("login.html");

  // The questions of the two forms, in order, with the label to show.
  // Same names as in the forms and in supabase/functions/_shared/application.ts.
  var QUESTIONS = {
    mentor: [
      ["company", "Company"], ["position", "Role"], ["field", "Field"], ["field_other", "Field (other)"],
      ["highest_degree", "Highest degree and university"], ["linkedin", "LinkedIn"],
      ["motivation", "Why do you want to become a mentor?"]
    ],
    mentee: [
      ["school", "School or university"], ["programme", "Degree programme"], ["gpa", "GPA"],
      ["field", "Field of interest"], ["field_other", "Field of interest (more)"],
      ["goals", "Aspirations and goals"], ["achievement", "Proudest achievement"]
    ]
  };

  var TEXT = {
    mentor: "Mentor", mentee: "Mentee", admin: "Admin",
    pending: "Pending", accepted: "Accepted", rejected: "Rejected",
    loadError: "The portal could not be loaded. Please check your connection and try again.",
    working: "Working…",
    done: "Done.",
    accepted: "Accepted. The join link was emailed to {email}.",
    rejected: "Rejected.",
    rejectedEmailed: "Rejected. A polite email was sent to {email}.",
    resent: "A new join link was emailed to {email}.",
    deleted: "The application was deleted.",
    emailFailed: "Saved, but the email could not be sent: {error}. Try \"Resend join link\" later.",
    confirmDelete: "Delete this application for good? Use this for spam or duplicates.",
    confirmDeleteAccepted: "Delete this accepted application for good? If they have not joined yet, their join link stops working. If they already joined, they stay a member.",
    inviteReady: "Link ready for {email}. Copy it and send it to them yourself: they choose a password and fill in their card. It expires on {date}.",
    inviteCopied: "Link copied.",
    confirmRemove: "Remove {email} from Beyond? Their card, photo and invite are deleted. Their account stays (the other app may use it), and they can be invited again later.",
    confirmRole: "Change the role of {email} to {role}?",
    errors: {
      already_member: "This email is already a Beyond member. Change their role in the Members tab instead.",
      already_accepted: "This application was already accepted.",
      not_pending: "This application was already decided.",
      not_accepted: "This application is not accepted.",
      already_joined: "They have already joined: no new link is needed.",
      no_invite: "There is no invite for this application any more (the member was removed?).",
      invalid_email: "Please enter a valid email address.",
      invalid: "Please choose mentor or mentee.",
      self: "You can't do this to your own account.",
      not_admin: "Your session has expired or you are not an admin any more. Please sign in again.",
      not_found: "Not found. Refresh the page.",
      server: "Something went wrong on the server. Please try again."
    }
  };

  // The Supabase address and key come from js/config.js (written while publishing)
  var CONN = window.BEYOND_CONFIG || {};
  var db = null;
  if (CONN.supabaseUrl && CONN.supabaseAnonKey && window.supabase) {
    db = window.supabase.createClient(CONN.supabaseUrl, CONN.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  /* ------------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------------ */
  function $(id) { return document.getElementById(id); }
  function show(el, visible) { if (el) el.hidden = !visible; }

  function say(el, message, isError) {
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("is-error", !!isError);
    el.hidden = !message;
  }

  function fill(text, values) {
    return text.replace(/\{(\w+)\}/g, function (all, key) { return values[key] != null ? values[key] : all; });
  }

  // Lower case, without accents: "Zürich" is found by typing "zurich"
  function fold(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function when(value, withTime) {
    if (!value) return "";
    var options = withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" };
    try { return new Date(value).toLocaleString("en-GB", options); } catch (e) { return String(value); }
  }

  function fullName(row) {
    return ((row.first_name || "") + " " + (row.last_name || "")).trim();
  }

  // Calls the beyond-admin Edge Function as the signed-in admin. Resolves with { status, data }.
  function callAdmin(body) {
    return db.functions.invoke("beyond-admin", { body: body }).then(function (res) {
      if (!res.error) return { status: 200, data: res.data || {} };
      var reply = res.error.context;
      if (reply && typeof reply.json === "function") {
        return reply.json().then(
          function (data) { return { status: reply.status, data: data || {} }; },
          function () { return { status: reply.status, data: {} }; });
      }
      return { status: 0, data: { error: "server" } };
    }, function () { return { status: 0, data: { error: "server" } }; });
  }

  function errorText(res) {
    return TEXT.errors[res.data && res.data.error] || TEXT.errors.server;
  }

  function signOut() {
    try {
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf("beyond.") === 0) localStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
    var done = function () { location.href = LOGIN_URL; };
    if (db) db.auth.signOut().then(done, done); else done();
  }

  /* ------------------------------------------------------------------------
     CSV export (semicolons, so Excel opens it in columns in Italy too)
     ------------------------------------------------------------------------ */
  function downloadCsv(name, columns, rows) {
    function cell(value) {
      if (value == null) value = "";
      if (Array.isArray(value)) value = value.join(" | ");
      value = String(value);
      if (/^[=+\-@]/.test(value)) value = "'" + value;        // never let a spreadsheet run it as a formula
      return '"' + value.replace(/"/g, '""') + '"';
    }
    var lines = [columns.map(function (c) { return cell(c[1]); }).join(";")];
    rows.forEach(function (row) {
      lines.push(columns.map(function (c) { return cell(typeof c[0] === "function" ? c[0](row) : row[c[0]]); }).join(";"));
    });
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
  }

  /* ========================================================================
     The portal
     ======================================================================== */
  var state = {
    me: null,
    apps: [], invites: {}, members: [], log: [],
    tab: "applications",
    status: "pending", role: "all", query: "",
    memberQuery: "",
    selected: null,
    loadedAt: 0
  };

  var app = $("admin-app");
  var notice = $("members-notice");

  // --- Loading ---
  function load() {
    return Promise.all([
      db.from("beyond_applications").select("*").order("created_at", { ascending: false }).limit(2000),
      db.from("beyond_invites").select("email, role, application_id, sent_at, expires_at, claimed_at, created_at"),
      db.rpc("beyond_admin_list_members"),
      db.from("beyond_audit_log").select("*").order("at", { ascending: false }).limit(100)
    ]).then(function (results) {
      results.forEach(function (res) { if (res.error) throw res.error; });
      state.apps = results[0].data.map(function (a) {
        a.searchText = fold([a.first_name, a.last_name, a.email, a.city, a.country]
          .concat(Object.keys(a.answers || {}).map(function (k) { return a.answers[k]; })).join(" "));
        return a;
      });
      state.invites = {};
      results[1].data.forEach(function (i) { if (i.application_id) state.invites[i.application_id] = i; });
      state.members = results[2].data;
      state.log = results[3].data;
      state.loadedAt = Date.now();
    });
  }

  function reload() {
    return load().then(renderAll).catch(function (error) {
      console.error("Beyond: the admin portal could not be loaded.", error);
      say(notice, TEXT.loadError, true);
    });
  }

  function renderAll() {
    renderApplications();
    renderMembers();
    renderLog();
    var pending = state.apps.filter(function (a) { return a.status === "pending"; }).length;
    app.querySelector('[data-tab-count="applications"]').textContent = pending || "";
    app.querySelector('[data-tab-count="members"]').textContent = state.members.length || "";
  }

  // --- Tabs ---
  function openTab(name) {
    state.tab = name;
    app.querySelectorAll("[data-tab]").forEach(function (t) {
      t.setAttribute("aria-pressed", String(t.getAttribute("data-tab") === name));
    });
    ["applications", "members", "activity"].forEach(function (n) { show($("tab-" + n), n === name); });
  }
  app.querySelectorAll("[data-tab]").forEach(function (tab) {
    tab.addEventListener("click", function () { openTab(tab.getAttribute("data-tab")); });
  });

  /* ------------------------------------------------------------------------
     Applications
     ------------------------------------------------------------------------ */
  var appRows = $("app-rows");
  var detail = $("app-detail");

  function statusPill(status) {
    return '<span class="admin-pill admin-pill--' + esc(status) + '">' + esc(TEXT[status] || status) + "</span>";
  }

  function renderApplications() {
    var words = fold(state.query).split(/\s+/).filter(Boolean);
    var counts = { pending: 0, accepted: 0, rejected: 0, all: 0 };
    var shown = state.apps.filter(function (a) {
      if (state.role !== "all" && a.role !== state.role) return false;
      if (!words.every(function (w) { return a.searchText.indexOf(w) !== -1; })) return false;
      counts[a.status]++;
      counts.all++;
      return state.status === "all" || a.status === state.status;
    });
    app.querySelectorAll("[data-status-count]").forEach(function (el) {
      el.textContent = counts[el.getAttribute("data-status-count")];
    });

    appRows.innerHTML = shown.map(function (a) {
      var selected = a.id === state.selected ? ' aria-current="true"' : "";
      return (
        '<tr class="admin-row" data-id="' + esc(a.id) + '"' + selected + ">" +
          '<td><button class="admin-row-link" type="button" data-open="' + esc(a.id) + '">' + esc(fullName(a)) + "</button>" +
            '<span class="admin-sub">' + esc(a.email) + "</span></td>" +
          "<td>" + esc(TEXT[a.role]) + "</td>" +
          "<td>" + esc([a.city, a.country].filter(Boolean).join(", ")) + "</td>" +
          "<td>" + esc(when(a.created_at)) + "</td>" +
          "<td>" + statusPill(a.status) + "</td>" +
        "</tr>"
      );
    }).join("");
    show($("app-empty"), !shown.length);

    if (state.selected) renderDetail();
  }

  function answerValue(key, value) {
    if (key === "linkedin" && /^https?:\/\//i.test(value)) {
      return '<a href="' + esc(value) + '" target="_blank" rel="noopener noreferrer">' + esc(value) + "</a>";
    }
    return esc(value);
  }

  function renderDetail() {
    var a = state.apps.filter(function (x) { return x.id === state.selected; })[0];
    if (!a) { closeDetail(); return; }
    // Keep a note being written when the panel is drawn again (e.g. while searching)
    var oldNote = $("decision-note");
    var draft = oldNote && detail.getAttribute("data-for") === a.id ? oldNote.value : "";
    var answers = a.answers || {};
    var known = (QUESTIONS[a.role] || []).map(function (q) { return q[0]; });
    var rows = (QUESTIONS[a.role] || []).concat(
      Object.keys(answers).filter(function (k) { return known.indexOf(k) === -1; }).map(function (k) { return [k, k]; })
    ).filter(function (q) { return answers[q[0]]; });

    var invite = state.invites[a.id];
    var facts = [
      ["Confirmation to " + a.email, a.confirmation_sent_at ? "Sent " + when(a.confirmation_sent_at, true) : "Not sent"],
      ["Notification to the admin", a.admin_notified_at ? "Sent " + when(a.admin_notified_at, true) : "Not sent"]
    ];
    if (a.last_email_error) facts.push(["Last email problem", a.last_email_error]);
    if (a.reviewed_at) facts.push([TEXT[a.status] || "Decided", when(a.reviewed_at, true)]);
    if (a.decision_note) facts.push(["Note", a.decision_note]);
    if (invite) {
      facts.push(["Join link", invite.claimed_at ? "Used " + when(invite.claimed_at, true)
        : invite.sent_at ? "Sent " + when(invite.sent_at, true) + ", expires " + when(invite.expires_at) : "Not sent yet"]);
    }

    var actions = "";
    if (a.status === "pending") {
      actions =
        '<div class="field">' +
          '<label for="decision-note">Personal note <span class="field-hint">Optional. Included in the email you send.</span></label>' +
          '<textarea class="input" id="decision-note" rows="3" maxlength="2000"></textarea>' +
        "</div>" +
        '<div class="checkbox">' +
          '<input id="reject-notify" type="checkbox" checked>' +
          '<label for="reject-notify">When rejecting, email them a polite reply</label>' +
        "</div>" +
        '<div class="admin-buttons">' +
          '<button class="btn btn-primary" type="button" data-action="accept">Accept</button>' +
          '<button class="btn btn-outline" type="button" data-action="reject">Reject</button>' +
        "</div>";
    } else if (a.status === "accepted" && invite && !invite.claimed_at) {
      actions = '<div class="admin-buttons"><button class="btn btn-outline" type="button" data-action="resend-invite">Resend join link</button></div>';
    }
    {
      actions += '<p class="admin-danger-line"><button class="members-link admin-danger" type="button" data-action="delete-application">Delete application</button></p>';
    }

    detail.innerHTML =
      '<button class="members-link admin-back" type="button" data-close>&larr; Back to the list</button>' +
      '<p class="member-badge member-badge--' + esc(a.role) + '">' + esc(TEXT[a.role]) + "</p>" +
      '<h2 class="admin-detail-name">' + esc(fullName(a)) + "</h2>" +
      '<p class="admin-meta"><a href="mailto:' + esc(a.email) + '">' + esc(a.email) + "</a> · " +
        esc([a.city, a.country].filter(Boolean).join(", ")) + " · applied " + esc(when(a.created_at, true)) + "</p>" +
      "<p>" + statusPill(a.status) + "</p>" +
      '<dl class="admin-answers">' + rows.map(function (q) {
        return "<div><dt>" + esc(q[1]) + "</dt><dd>" + answerValue(q[0], answers[q[0]]) + "</dd></div>";
      }).join("") + "</dl>" +
      '<h3 class="admin-h3">History</h3>' +
      '<dl class="admin-facts">' + facts.map(function (f) {
        return "<div><dt>" + esc(f[0]) + "</dt><dd>" + esc(f[1]) + "</dd></div>";
      }).join("") + "</dl>" +
      (actions ? '<h3 class="admin-h3">Decision</h3><div class="admin-actions">' + actions + "</div>" : "") +
      '<p class="members-notice" id="detail-status" role="status" hidden></p>';
    detail.setAttribute("data-for", a.id);
    if (draft && $("decision-note")) $("decision-note").value = draft;
    show(detail, true);
  }

  function openDetail(id, focus) {
    state.selected = id;
    history.replaceState(null, "", location.pathname + location.search + "#application=" + id);
    renderApplications();
    if (focus) {
      detail.focus();
      if (window.matchMedia("(max-width: 1099px)").matches) detail.scrollIntoView({ block: "start" });
    }
  }

  function closeDetail() {
    var id = state.selected;
    state.selected = null;
    show(detail, false);
    history.replaceState(null, "", location.pathname + location.search);
    renderApplications();
    var button = id && appRows.querySelector('[data-open="' + id + '"]');
    if (button) button.focus();
  }

  appRows.addEventListener("click", function (event) {
    var row = event.target.closest("[data-id]");
    if (row) openDetail(row.getAttribute("data-id"), true);
  });

  detail.addEventListener("click", function (event) {
    if (event.target.closest("[data-close]")) { closeDetail(); return; }
    var button = event.target.closest("[data-action]");
    if (button) runAction(button.getAttribute("data-action"), button);
  });

  function runAction(action, button) {
    var a = state.apps.filter(function (x) { return x.id === state.selected; })[0];
    if (!a) return;
    var status = $("detail-status");
    var noteEl = $("decision-note");
    var notify = $("reject-notify");
    var body = { action: action, id: a.id };
    if (action === "accept" || action === "reject") body.message = noteEl ? noteEl.value.trim() : "";
    if (action === "reject") body.notify = !!(notify && notify.checked);
    if (action === "delete-application" && !window.confirm(a.status === "accepted" ? TEXT.confirmDeleteAccepted : TEXT.confirmDelete)) return;

    var buttons = detail.querySelectorAll("button[data-action]");
    buttons.forEach(function (b) { b.disabled = true; });
    var label = button.textContent;
    button.textContent = TEXT.working;

    callAdmin(body).then(function (res) {
      buttons.forEach(function (b) { b.disabled = false; });
      button.textContent = label;
      if (res.status !== 200) { say(status, errorText(res), true); return; }

      var message = action === "accept" ? TEXT.accepted
        : action === "reject" ? (body.notify ? TEXT.rejectedEmailed : TEXT.rejected)
        : action === "resend-invite" ? TEXT.resent : TEXT.deleted;
      var emailError = res.data.emailError;
      return reload().then(function () {
        if (action === "delete-application") { closeDetail(); say(notice, TEXT.deleted); return; }
        say($("detail-status"), emailError ? fill(TEXT.emailFailed, { error: emailError }) : fill(message, { email: a.email }), !!emailError);
      });
    });
  }

  // Filters
  app.querySelectorAll("[data-status]").forEach(function (tab) {
    tab.addEventListener("click", function () {
      state.status = tab.getAttribute("data-status");
      app.querySelectorAll("[data-status]").forEach(function (t) { t.setAttribute("aria-pressed", String(t === tab)); });
      renderApplications();
    });
  });
  $("app-role").addEventListener("change", function () { state.role = this.value; renderApplications(); });
  var typing = null;
  $("app-search").addEventListener("input", function () {
    var input = this;
    clearTimeout(typing);
    typing = setTimeout(function () { state.query = input.value; renderApplications(); }, 120);
  });

  /* ------------------------------------------------------------------------
     Members
     ------------------------------------------------------------------------ */
  /* ------------------------------------------------------------------------
     Invite link: for someone you want to bring in without the application form.
     Nothing is emailed: copy the link and send it yourself.
     ------------------------------------------------------------------------ */
  var inviteForm = $("invite-form");
  var inviteStatus = $("invite-status");
  var inviteResult = $("invite-result");
  var inviteLink = $("invite-link");

  inviteForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var email = $("invite-email").value.trim();
    var role = inviteForm.querySelector('input[name="invite-role"]:checked');
    show(inviteResult, false);
    if (!email || !role) { say(inviteStatus, TEXT.errors.invalid_email, true); return; }
    var button = inviteForm.querySelector('button[type="submit"]');
    button.disabled = true;
    say(inviteStatus, TEXT.working);
    callAdmin({ action: "create-invite", email: email, role: role.value }).then(function (res) {
      button.disabled = false;
      if (res.status !== 200) { say(inviteStatus, errorText(res), true); return; }
      inviteLink.value = res.data.link;
      show(inviteResult, true);
      say(inviteStatus, fill(TEXT.inviteReady, { email: email, date: when(res.data.expiresAt) }));
      reload();
    });
  });

  $("invite-copy").addEventListener("click", function () {
    inviteLink.select();
    var done = function () { say(inviteStatus, TEXT.inviteCopied); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inviteLink.value).then(done, function () { document.execCommand("copy"); done(); });
    else { document.execCommand("copy"); done(); }
  });

  var memberRows = $("member-rows");
  var memberStatus = $("member-status");

  function memberState(m) {
    if (!m.id) {
      if (m.invite_expires_at && new Date(m.invite_expires_at).getTime() < Date.now()) return ["expired", "Invite expired"];
      return ["invited", m.invite_sent_at ? "Invited " + when(m.invite_sent_at) : "Invited"];
    }
    if (m.status === "suspended") return ["suspended", "Suspended"];
    if (!m.onboarded_at) return ["joined", "Joined, card not saved"];
    return ["active", m.is_listed ? "Active" : "Active, hidden"];
  }

  function renderMembers() {
    var words = fold(state.memberQuery).split(/\s+/).filter(Boolean);
    var shown = state.members.filter(function (m) {
      var text = fold([m.first_name, m.last_name, m.email, m.city, m.country, m.position, m.company].join(" "));
      return words.every(function (w) { return text.indexOf(w) !== -1; });
    }).sort(function (x, y) {
      return fold(fullName(x) || x.email).localeCompare(fold(fullName(y) || y.email));
    });

    memberRows.innerHTML = shown.map(function (m) {
      var st = memberState(m);
      var isMe = state.me && m.id === state.me.id;
      var roles = ["mentor", "mentee", "admin"].map(function (r) {
        return '<option value="' + r + '"' + (m.role === r ? " selected" : "") + ">" + esc(TEXT[r]) + "</option>";
      }).join("");
      var buttons = [];
      if (m.id && !isMe) {
        buttons.push(m.status === "suspended"
          ? '<button class="members-link" type="button" data-member="reactivate">Reactivate</button>'
          : '<button class="members-link" type="button" data-member="suspend">Suspend</button>');
      }
      if (m.application_id) buttons.push('<button class="members-link" type="button" data-member="application">Application</button>');
      if (!isMe) buttons.push('<button class="members-link admin-danger" type="button" data-member="remove">Remove</button>');
      return (
        '<tr data-email="' + esc(m.email) + '" data-id="' + esc(m.id || "") + '" data-application="' + esc(m.application_id || "") + '">' +
          "<td>" + esc(fullName(m) || "(no card yet)") +
            (m.position || m.company ? '<span class="admin-sub">' + esc([m.position, m.company].filter(Boolean).join(" · ")) + "</span>" : "") + "</td>" +
          '<td><a href="mailto:' + esc(m.email) + '">' + esc(m.email) + "</a></td>" +
          '<td><label class="visually-hidden" for="role-' + esc(m.email) + '">Role of ' + esc(m.email) + "</label>" +
            '<select class="input admin-select admin-select--small" id="role-' + esc(m.email) + '" data-member="role"' +
            (m.id && !isMe ? "" : " disabled") + ">" + roles + "</select></td>" +
          '<td><span class="admin-pill admin-pill--' + st[0] + '">' + esc(st[1]) + "</span></td>" +
          "<td>" + (m.id ? (m.has_photo ? "Yes" : "No") : "") + "</td>" +
          '<td class="admin-row-actions">' + buttons.join("") + "</td>" +
        "</tr>"
      );
    }).join("");
    show($("member-empty"), !shown.length);
  }

  function memberAction(row, action, select) {
    var email = row.getAttribute("data-email");
    var id = row.getAttribute("data-id");
    var body;
    if (action === "application") {
      openTab("applications");
      state.status = "all";
      app.querySelectorAll("[data-status]").forEach(function (t) { t.setAttribute("aria-pressed", String(t.getAttribute("data-status") === "all")); });
      openDetail(row.getAttribute("data-application"), true);
      return;
    }
    if (action === "role") {
      if (!window.confirm(fill(TEXT.confirmRole, { email: email, role: TEXT[select.value] }))) { renderMembers(); return; }
      body = { action: "set-member", id: id, role: select.value };
    } else if (action === "suspend" || action === "reactivate") {
      body = { action: "set-member", id: id, status: action === "suspend" ? "suspended" : "approved" };
    } else if (action === "remove") {
      if (!window.confirm(fill(TEXT.confirmRemove, { email: email }))) return;
      body = { action: "remove-member", email: email };
    } else {
      return;
    }

    say(memberStatus, TEXT.working);
    callAdmin(body).then(function (res) {
      if (res.status !== 200) { say(memberStatus, errorText(res), true); renderMembers(); return; }
      return reload().then(function () { say(memberStatus, TEXT.done); });
    });
  }

  memberRows.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-member]");
    if (button) memberAction(button.closest("tr"), button.getAttribute("data-member"));
  });
  memberRows.addEventListener("change", function (event) {
    var select = event.target.closest('select[data-member="role"]');
    if (select) memberAction(select.closest("tr"), "role", select);
  });
  $("member-search").addEventListener("input", function () {
    var input = this;
    clearTimeout(typing);
    typing = setTimeout(function () { state.memberQuery = input.value; renderMembers(); }, 120);
  });

  /* ------------------------------------------------------------------------
     Activity
     ------------------------------------------------------------------------ */
  var ACTIONS = {
    "accept": "Accepted", "reject": "Rejected", "resend-invite": "Resent join link",
    "delete-application": "Deleted application", "create-invite": "Created invite link", "set-member": "Changed member", "remove-member": "Removed member"
  };

  function renderLog() {
    $("log-rows").innerHTML = state.log.map(function (entry) {
      var details = entry.details || {};
      var extra = [];
      if (details.role) extra.push("role: " + details.role);
      if (details.status) extra.push("status: " + details.status);
      if (details.emailError) extra.push("email failed");
      return (
        "<tr>" +
          "<td>" + esc(when(entry.at, true)) + "</td>" +
          "<td>" + esc(entry.actor_email || "") + "</td>" +
          "<td>" + esc(ACTIONS[entry.action] || entry.action) + (extra.length ? '<span class="admin-sub">' + esc(extra.join(", ")) + "</span>" : "") + "</td>" +
          "<td>" + esc(entry.target || "") + "</td>" +
        "</tr>"
      );
    }).join("");
    show($("log-empty"), !state.log.length);
  }

  /* ------------------------------------------------------------------------
     Export
     ------------------------------------------------------------------------ */
  app.querySelectorAll("[data-export]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (button.getAttribute("data-export") === "applications") {
        var keys = [];
        QUESTIONS.mentor.concat(QUESTIONS.mentee).forEach(function (q) { if (keys.indexOf(q[0]) === -1) keys.push(q[0]); });
        state.apps.forEach(function (a) { Object.keys(a.answers || {}).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); }); });
        downloadCsv("beyond-applications", [
          ["created_at", "Applied"], ["status", "Status"], ["role", "Role"],
          ["first_name", "Name"], ["last_name", "Surname"], ["email", "Email"], ["city", "City"], ["country", "Country"]
        ].concat(keys.map(function (k) {
          return [function (a) { return (a.answers || {})[k]; }, k];
        })).concat([
          ["reviewed_at", "Decided"], ["decision_note", "Note"], ["confirmation_sent_at", "Confirmation sent"],
          ["admin_notified_at", "Admin notified"], ["last_email_error", "Email problem"], ["id", "Id"]
        ]), state.apps);
      } else {
        downloadCsv("beyond-members", [
          ["first_name", "Name"], ["last_name", "Surname"], ["email", "Email"], ["role", "Role"],
          [function (m) { return memberState(m)[1]; }, "State"], ["city", "City"], ["country", "Country"],
          ["position", "Position"], ["company", "Company"], ["has_photo", "Photo"], ["is_listed", "Listed"],
          ["onboarded_at", "Card saved"], ["invited_at", "Invited"], ["claimed_at", "Joined"]
        ], state.members);
      }
    });
  });

  /* ------------------------------------------------------------------------
     Start
     ------------------------------------------------------------------------ */
  var loading = $("members-loading");

  function start() {
    loading.textContent = UI.strings.members.loading;
    show(loading, true);
    reload().then(function () {
      show(loading, false);
      show(app, true);
      var match = /#application=([0-9a-f-]{36})/i.exec(location.hash);
      if (match && state.apps.some(function (a) { return a.id === match[1]; })) {
        var a = state.apps.filter(function (x) { return x.id === match[1]; })[0];
        state.status = a.status;
        app.querySelectorAll("[data-status]").forEach(function (t) { t.setAttribute("aria-pressed", String(t.getAttribute("data-status") === a.status)); });
        openDetail(a.id, true);
      }
    });
  }

  app.querySelector("[data-refresh]").addEventListener("click", function () {
    if (Date.now() - state.loadedAt < 5000) return;
    say(notice, "");
    reload();
  });
  document.querySelectorAll("[data-signout]").forEach(function (b) { b.addEventListener("click", signOut); });

  if (!db) {
    show(loading, false);
    say(notice, TEXT.loadError, true);
    return;
  }

  var handled;
  db.auth.onAuthStateChange(function (event, session) {
    var user = session && session.user ? session.user : null;
    var uid = user ? user.id : null;
    if (uid === handled) return;          // e.g. a token refresh: nothing changed
    handled = uid;
    setTimeout(function () {
      if (!user) {                        // not logged in: log in, then come back here
        location.replace(LOGIN_URL + "?next=admin");
        return;
      }
      state.me = user;
      db.rpc("beyond_is_admin").then(function (res) {
        if (res.error || res.data !== true) {
          show(loading, false);
          show($("admin-denied"), true);
          return;
        }
        start();
      });
    }, 0);
  });

})();
