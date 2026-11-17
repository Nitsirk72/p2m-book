/* Passport to More Book. Plain JavaScript, no build step.
   People prep ships locked (data.enc.json) and opens with the passcode.
   Everything Kristin types stays on this phone (localStorage) until she backs it up. */
(function () {
  'use strict';
  var VERSION = '1.0.0';
  var K_CONTENT = 'book.content', K_PASS = 'book.pass', K_USER = 'book.user', K_STAMP = 'book.stamp';
  var app = document.getElementById('app');
  var nav = document.getElementById('nav');
  var content = null;
  var user = loadUser();
  var ui = { view: 'today', pid: null, ptab: 'prep', q: '', fStatus: 'all', fBucket: '', pitch: 1, adjust: -1, editPrep: false, showDone: false, addMet: true, picking: false };

  /* ---------- small helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nl(s) { return esc(s).replace(/\n/g, '<br>'); }
  function ymd(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addDays(s, n) { var p = s.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return ymd(d); }
  function dayName(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-US', { weekday: 'short' }); }
  function niceDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function loadUser() {
    var u = null;
    try { u = JSON.parse(localStorage.getItem(K_USER) || 'null'); } catch (e) {}
    u = u || {};
    u.notes = u.notes || {}; u.added = u.added || []; u.prep = u.prep || {}; u.picks = u.picks || {};
    return u;
  }
  var saveTimer = null;
  function save() { try { localStorage.setItem(K_USER, JSON.stringify(user)); } catch (e) { toast('Could not save. Storage may be full.'); } }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }
  function toast(msg) {
    var t = document.getElementById('toast'); t.textContent = msg; t.className = 'show';
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = ''; }, 2600);
  }
  function copy(text, okMsg) {
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta); toast(ok ? okMsg : 'Could not copy. Press and hold to copy by hand.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback); } else { fallback(); }
  }
  var HORN = '<svg class="horn" viewBox="0 0 52 26" aria-label="Local"><path d="M1 2c4 7 10 9 17 8 2-2 4-3 8-3s6 1 8 3c7 1 13-1 17-8-1 9-7 14-16 14l-2 6c-1 4-13 4-14 0l-2-6C8 16 2 11 1 2z"/></svg>';

  /* ---------- people ---------- */
  function allPeople() {
    var base = (content.people || []).map(function (p) {
      var o = user.prep[p.id];
      return o ? Object.assign({}, p, o) : p;
    });
    return base.concat(user.added);
  }
  function person(id) { var a = allPeople(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function note(id) { if (!user.notes[id]) user.notes[id] = { status: 'tomeet' }; return user.notes[id]; }
  function peek(id) { return user.notes[id] || { status: 'tomeet' }; }
  function bucket(k) { var b = content.buckets; for (var i = 0; i < b.length; i++) if (b[i].k === k) return b[i]; return { label: k, color: '#8A7F73' }; }
  function edge(p) { return p.buckets && p.buckets.length ? bucket(p.buckets[0]).color : '#8A7F73'; }
  function setStatus(id, s) {
    var n = note(id); n.status = s;
    if (s === 'met') { if (!n.metDate) n.metDate = ymd(); if (!n.due) n.due = addDays(n.metDate, 2); }
    if (s === 'done') { n.doneDate = ymd(); if (!n.metDate) n.metDate = ymd(); }
    save();
  }
  function statusTag(id) {
    var n = peek(id);
    if (n.status === 'met') return '<span class="st fu">Follow up</span>';
    if (n.status === 'done') return '<span class="st met">Done</span>';
    return '<span class="st no">To meet</span>';
  }
  function card(p) {
    var n = peek(p.id);
    return '<button class="card" data-act="open" data-id="' + esc(p.id) + '" style="border-left-color:' + edge(p) + '"><span class="cmain"><b>' + esc(p.name) + (n.local ? HORN : '') + '</b><span>' + esc(p.biz || '') + '</span></span>' + statusTag(p.id) + '</button>';
  }

  /* ---------- lock ---------- */
  function b64(s) { var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function unlock(pass) {
    pass = String(pass || '').trim().toLowerCase();
    return fetch('data.enc.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (enc) {
      return crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']).then(function (km) {
        return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(enc.salt), iterations: enc.iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      }).then(function (key) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
      }).then(function (buf) {
        var txt = new TextDecoder().decode(buf);
        content = JSON.parse(txt);
        localStorage.setItem(K_CONTENT, txt); localStorage.setItem(K_PASS, pass); localStorage.setItem(K_STAMP, enc.stamp || '');
        return true;
      });
    });
  }
  function renderLock(msg) {
    nav.hidden = true;
    app.innerHTML = '<div class="lock"><img src="icons/icon-192.png" alt="" width="96" height="96"><h1>Passport to More <i>Book</i></h1><p>Enter your passcode to open the Book on this phone. You only do this once.</p>' +
      '<input id="pass" type="password" autocomplete="off" autocapitalize="none" placeholder="Passcode" aria-label="Passcode">' +
      '<button class="btn d" data-act="unlock">Open the Book</button><p class="err" id="lockerr">' + esc(msg || '') + '</p></div>';
  }
  function boot() {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(K_CONTENT) || 'null'); } catch (e) {}
    if (cached) {
      content = cached; start();
      /* quietly pick up a newer people file when online */
      var pass = localStorage.getItem(K_PASS);
      if (pass) fetch('data.enc.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (enc) {
        if ((enc.stamp || '') !== (localStorage.getItem(K_STAMP) || '')) unlock(pass).then(function () { render(); }, function () {});
      }).catch(function () {});
    } else { renderLock(); }
  }
  function start() { nav.hidden = false; route(); }

  /* ---------- routing ---------- */
  function go(view, extra) { ui.view = view; if (extra) Object.assign(ui, extra); var h = view === 'person' ? '#/p/' + encodeURIComponent(ui.pid) : '#/' + view; if (location.hash !== h) { history.pushState(null, '', h); } render(); window.scrollTo(0, 0); }
  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    if (h.indexOf('p/') === 0) { ui.view = 'person'; ui.pid = decodeURIComponent(h.slice(2)); if (!person(ui.pid)) ui.view = 'people'; }
    else if (['today', 'people', 'follow', 'me', 'add'].indexOf(h) >= 0) ui.view = h;
    else ui.view = 'today';
    render();
  }
  window.addEventListener('popstate', function () { if (content) route(); });

  /* ---------- views ---------- */
  function render() {
    if (!content) return;
    var v = ui.view, html = '';
    if (v === 'today') html = vToday();
    else if (v === 'people') html = vPeople();
    else if (v === 'follow') html = vFollow();
    else if (v === 'me') html = vMe();
    else if (v === 'add') html = vAdd();
    else if (v === 'person') html = vPerson();
    app.innerHTML = html;
    var tab = v === 'person' || v === 'add' ? 'people' : v;
    Array.prototype.forEach.call(nav.querySelectorAll('button'), function (b) { b.className = b.getAttribute('data-go') === tab ? 'on' : ''; });
  }

  function vToday() {
    var t = ymd(), d = new Date();
    var metToday = allPeople().filter(function (p) { return peek(p.id).metDate === t; }).length;
    var picks = (user.picks[t] || []).map(person).filter(Boolean);
    var h = '<h1>' + d.toLocaleDateString('en-US', { weekday: 'long' }) + ', <i>' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '</i></h1>';
    h += '<p class="s">Goal: ' + esc(content.me.today.goal) + ' <b>' + metToday + ' so far today.</b></p>';
    h += '<button class="btn d big" data-act="add-met">+ I just met someone</button>';
    h += '<div class="sec">My three for today</div>';
    if (ui.picking) {
      var cand = allPeople().filter(function (p) { return peek(p.id).status === 'tomeet'; });
      var cur = user.picks[t] || [];
      h += '<p class="s">Tap to pick. Three is plenty.</p>' + cand.map(function (p) {
        var on = cur.indexOf(p.id) >= 0;
        return '<button class="card pick' + (on ? ' on' : '') + '" data-act="pick" data-id="' + esc(p.id) + '" style="border-left-color:' + edge(p) + '"><span class="cmain"><b>' + esc(p.name) + '</b><span>' + esc(p.biz || '') + '</span></span><span class="tick">' + (on ? '✓' : '') + '</span></button>';
      }).join('') + '<button class="btn o" data-act="pick-done">Done picking</button>';
    } else {
      h += picks.length ? picks.map(card).join('') : '<div class="box muted">Nobody picked yet. Choose them the night before, when it is quiet.</div>';
      h += '<button class="btn o" data-act="pick-start">' + (picks.length ? 'Change my three' : 'Pick my three') + '</button>';
    }
    var tb = content.me.table, mates = allPeople().filter(function (p) { return p.table; });
    if (tb && mates.length && t <= '2026-11-20') {
      h += '<div class="sec">' + esc(tb.title) + '</div><p class="s">' + esc(tb.note) + '</p>' + mates.map(card).join('');
      h += '<details class="acc"><summary>Three questions for the table</summary><div class="accb">' + tb.questions.map(function (q) { return '<p class="q">“' + esc(q) + '”</p>'; }).join('') + '</div></details>';
    }
    h += '<div class="sec">Break</div><div class="box">' + esc(content.me.today.breakNote) + '</div>';
    return h;
  }

  function matches(p) {
    var n = peek(p.id), q = ui.q.trim().toLowerCase();
    if (q && (p.name + ' ' + (p.biz || '')).toLowerCase().indexOf(q) < 0) return false;
    if (ui.fStatus === 'tomeet' && n.status !== 'tomeet') return false;
    if (ui.fStatus === 'met' && n.status === 'tomeet') return false;
    if (ui.fStatus === 'follow' && n.status !== 'met') return false;
    if (ui.fStatus === 'local' && !n.local) return false;
    if (ui.fBucket && (p.buckets || []).indexOf(ui.fBucket) < 0) return false;
    return true;
  }
  function vPeople() {
    var all = allPeople(), met = all.filter(function (p) { return peek(p.id).status !== 'tomeet'; }).length;
    var h = '<h1>The <i>Book</i></h1><p class="s">' + all.length + ' people · ' + met + ' met</p>';
    h += '<input id="q" class="search" type="search" placeholder="Search a name or business" value="' + esc(ui.q) + '" aria-label="Search">';
    var st = [['all', 'All'], ['tomeet', 'To meet'], ['met', 'Met'], ['follow', 'Follow up'], ['local', 'Local']];
    h += '<div class="chips">' + st.map(function (s) { return '<button class="chip' + (ui.fStatus === s[0] ? ' on' : '') + '" data-act="fstatus" data-v="' + s[0] + '">' + (s[0] === 'local' ? HORN : '') + s[1] + '</button>'; }).join('') + '</div>';
    h += '<div class="chips">' + content.buckets.map(function (b) { return '<button class="chip' + (ui.fBucket === b.k ? ' on' : '') + '" data-act="fbucket" data-v="' + b.k + '">' + esc(b.label) + '</button>'; }).join('') + '</div>';
    h += '<div id="plist">' + listHtml() + '</div><button class="fab" data-act="add-new" aria-label="Add someone">+</button>';
    return h;
  }
  function listHtml() {
    var list = allPeople().filter(matches);
    return list.length ? list.map(card).join('') : '<div class="box muted">Nobody matches. Clear a filter, or tap + to add them.</div>';
  }

  function vPerson() {
    var p = person(ui.pid); if (!p) return vPeople();
    var n = peek(p.id);
    var h = '<button class="back" data-act="back">‹ Back</button><h1 class="pname">' + esc(p.name) + (n.local ? HORN : '') + '</h1>';
    var bits = [p.biz, p.vip ? 'VIP' : '', p.event].filter(Boolean);
    h += '<p class="s">' + esc(bits.join(' · ')) + '</p>';
    h += '<div class="tags">' + (p.buckets || []).map(function (k) { var b = bucket(k); return '<span class="tag" style="color:' + b.color + ';border-color:' + b.color + '">' + esc(b.label) + '</span>'; }).join('') + (p.check ? '<span class="tag dash">Check first</span>' : '') + '</div>';
    h += '<div class="tabs"><button class="' + (ui.ptab === 'prep' ? 'on' : '') + '" data-act="ptab" data-v="prep">Prep</button><button class="' + (ui.ptab === 'notes' ? 'on' : '') + '" data-act="ptab" data-v="notes">Notes</button></div>';
    return h + (ui.ptab === 'prep' ? prepHtml(p) : notesHtml(p, note(p.id)));
  }
  function prepHtml(p) {
    var h = '';
    if (ui.editPrep) {
      h += '<label class="sec" for="e-why">Why they matter</label><textarea id="e-why" rows="4">' + esc(p.why || '') + '</textarea>';
      h += '<label class="sec" for="e-open">Open with</label><textarea id="e-open" rows="3">' + esc(p.open || '') + '</textarea>';
      h += '<label class="sec" for="e-ask">Ask about (one per line)</label><textarea id="e-ask" rows="4">' + esc((p.ask || []).join('\n')) + '</textarea>';
      h += '<label class="sec" for="e-small">My small ask</label><textarea id="e-small" rows="2">' + esc(p.small || '') + '</textarea>';
      return h + '<div class="two"><button class="btn d" data-act="prep-save">Save prep</button><button class="btn o" data-act="prep-cancel">Cancel</button></div>';
    }
    if (!p.why && !p.open) {
      h += '<div class="box muted">No prep yet. Tap <b>Copy for Claude</b>, paste it into your Claude app, then paste the answer back with <b>Edit prep</b>.</div>';
      h += '<button class="btn d" data-act="claude-prep">Copy for Claude</button>';
    } else {
      h += '<div class="sec">Why they matter</div><div class="box">' + nl(p.why) + '</div>';
      if (p.open) h += '<div class="sec">Open with</div><p class="q">“' + esc(p.open) + '”</p>';
      if (p.ask && p.ask.length) h += '<div class="sec">Ask about</div><div class="box"><ul>' + p.ask.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>';
      if (p.small) h += '<div class="sec">My small ask</div><p class="q">“' + esc(p.small) + '”</p>';
      if (p.src) h += '<div class="sec">Good to know</div><div class="box muted">' + esc(p.src) + '</div>';
    }
    var links = [['Website', p.web], ['LinkedIn', p.li], ['Instagram', p.ig]].filter(function (l) { return l[1]; });
    if (links.length) h += '<div class="two">' + links.map(function (l) { return '<a class="btn o" href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + l[0] + '</a>'; }).join('') + '</div>';
    return h + '<button class="link" data-act="prep-edit">Edit prep</button>';
  }
  function fld(id, label, val, rows, ph) {
    return '<label class="sec" for="n-' + id + '">' + label + '</label>' + (rows ? '<textarea id="n-' + id + '" data-f="' + id + '" rows="' + rows + '" placeholder="' + esc(ph || '') + '">' + esc(val || '') + '</textarea>' : '<input id="n-' + id + '" data-f="' + id + '" type="' + (id === 'due' ? 'date' : id === 'email' ? 'email' : id === 'phone' ? 'tel' : 'text') + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '">');
  }
  function notesHtml(p, n) {
    var st = [['tomeet', 'To meet'], ['met', 'Met'], ['done', 'Done']];
    var h = '<div class="chips">' + st.map(function (s) { return '<button class="chip' + (n.status === s[0] ? ' on' : '') + '" data-act="status" data-v="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>';
    h += '<p class="s">' + (n.status === 'met' ? 'Met ' + (n.metDate ? dayName(n.metDate) + ', ' + niceDate(n.metDate) : '') + '. Follow-up is on your list.' : n.status === 'done' ? 'Followed up. Nothing owed.' : 'Tap Met right after you talk.') + '</p>';
    h += '<div class="chips"><button class="chip' + (n.local ? ' on' : '') + '" data-act="toggle" data-v="local">' + HORN + 'Local to Austin</button><button class="chip' + (n.warm ? ' on' : '') + '" data-act="toggle" data-v="warm">Warm</button></div>';
    h += fld('real', 'One real thing they said', n.real, 2, 'This becomes the first line of your email');
    h += fld('said', 'What else they said', n.said, 3, 'Type, or use your keyboard mic');
    h += fld('helpThem', 'How I can help them', n.helpThem, 2);
    h += fld('helpMe', 'How they can help me', n.helpMe, 2);
    h += fld('next', 'Next step', n.next, 0, 'One thing');
    h += fld('due', 'Follow up by', n.due, 0);
    h += fld('email', 'Email', n.email, 0);
    h += fld('phone', 'Phone (only if they prefer it)', n.phone, 0);
    h += fld('transcript', 'Transcript (optional)', n.transcript, 3, 'Paste here. Ask before you record anyone.');
    var et = n.et == null ? (p.et || 0) : n.et;
    h += '<div class="sec">Email to send</div><div class="chips">' + ['1', '2', '3'].map(function (k) { return '<button class="chip' + (String(et) === k ? ' on' : '') + '" data-act="et" data-v="' + k + '">' + esc(content.me.emails[k].label) + '</button>'; }).join('') + '</div>';
    h += '<button class="btn d" data-act="copy-email">Copy my email</button>';
    if (n.email) h += '<button class="btn o" data-act="mail">Open in Mail</button>';
    h += '<button class="btn o" data-act="claude-notes">Copy for Claude</button><p class="s center">Copies their info and your notes. Paste into your Claude app, then paste the answer back here.</p>';
    if (String(p.id).indexOf('u-') === 0) h += '<button class="link danger" data-act="del">Remove this person</button>';
    return h;
  }

  function vFollow() {
    var t = ymd(), tm = addDays(t, 1);
    var owed = allPeople().filter(function (p) { return peek(p.id).status === 'met'; }).sort(function (a, b) { return (peek(a.id).due || '9') < (peek(b.id).due || '9') ? -1 : 1; });
    var done = allPeople().filter(function (p) { return peek(p.id).status === 'done'; });
    var h = '<h1>Follow <i>ups</i></h1><p class="s">' + owed.length + ' to send · ' + esc(content.me.emailRule.split('.')[0]) + '.</p>';
    if (!owed.length) h += '<div class="box muted">Nobody to follow up with yet. Mark someone <b>Met</b> and they show up here, due in 2 days.</div>';
    var groups = [['Overdue', function (d) { return d && d < t; }, '#B5482F'], ['Due today', function (d) { return d === t; }, '#C17A5B'], ['Due tomorrow', function (d) { return d === tm; }, '#1E4D35'], ['Later', function (d) { return !d || d > tm; }, '#8A7F73']];
    groups.forEach(function (g) {
      var rows = owed.filter(function (p) { return g[1](peek(p.id).due); });
      if (!rows.length) return;
      h += '<div class="grp" style="color:' + g[2] + '">' + g[0] + '</div>' + rows.map(function (p) {
        var n = peek(p.id), et = n.et == null ? (p.et || 0) : n.et, lab = et ? content.me.emails[String(et)].label + ' email' : 'Pick an email';
        var line = ['Met ' + (n.metDate ? dayName(n.metDate) : ''), lab, n.next ? '“' + n.next + '”' : '', n.due ? 'by ' + niceDate(n.due) : ''].filter(Boolean).join(' · ');
        return '<div class="fu"><b>' + esc(p.name) + (n.local ? HORN : '') + '</b><span>' + esc(line) + '</span><div class="r"><button class="mini d" data-act="f-email" data-id="' + esc(p.id) + '">Copy my email</button><button class="mini" data-act="f-notes" data-id="' + esc(p.id) + '">Open notes</button><button class="mini" data-act="f-done" data-id="' + esc(p.id) + '">Done</button></div></div>';
      }).join('');
    });
    if (done.length) {
      h += '<button class="grp tog" data-act="show-done">Done (' + done.length + ') ' + (ui.showDone ? '⌄' : '›') + '</button>';
      if (ui.showDone) h += done.map(card).join('');
    }
    return h + '<div class="box muted small">' + esc(content.me.emailRule) + '</div>';
  }

  function acc(title, body) { return '<details class="acc"><summary>' + esc(title) + '</summary><div class="accb">' + body + '</div></details>'; }
  function vMe() {
    var me = content.me, pt = me.pitches[ui.pitch];
    var h = '<h1>Because <i>nobody told us.</i></h1>';
    h += '<div class="sec">My pitch</div><div class="pt">' + me.pitches.map(function (p, i) { return '<button class="' + (i === ui.pitch ? 'on' : '') + '" data-act="pitch" data-v="' + i + '">' + esc(p.k) + '</button>'; }).join('') + '</div>';
    h += '<div class="box pitch">' + nl(pt.t) + '</div>';
    h += '<div class="sec">Adjust for who\'s listening</div><div class="chips">' + me.adjust.map(function (a, i) { return '<button class="chip' + (i === ui.adjust ? ' on' : '') + '" data-act="adjust" data-v="' + i + '">' + esc(a.k) + '</button>'; }).join('') + '</div>';
    if (ui.adjust >= 0) h += '<div class="box">' + nl(me.adjust[ui.adjust].t) + '</div>';
    h += '<div class="sec">One ask per person</div>' + me.asks.map(function (a) { return '<div class="box ask"><b>' + esc(a.k) + '</b>“' + esc(a.t) + '”</div>'; }).join('');
    h += '<div class="sec">My QR codes (tap to show full screen)</div><div class="qr">' + [['kit', 'Doctor Visit Kit', 'For women'], ['talk', 'The talk', 'For HR and buyers'], ['contact', 'My contact', 'For anyone']].map(function (q) { return '<button data-act="qr" data-v="' + q[0] + '"><img src="qr/' + q[0] + '.png" alt="" loading="lazy"><b>' + q[1] + '</b><span>' + q[2] + '</span></button>'; }).join('') + '</div>';
    h += '<div class="sec">Who I\'m looking for</div><div class="box">' + content.buckets.map(function (b) {
      var all = allPeople().filter(function (p) { return (p.buckets || []).indexOf(b.k) >= 0; }), m = all.filter(function (p) { return peek(p.id).status !== 'tomeet'; }).length;
      return '<div class="cnt"><span><i style="background:' + b.color + '"></i>' + esc(b.label) + '</span><span>' + m + ' of ' + all.length + ' met</span></div>';
    }).join('') + '</div>';
    h += '<div class="sec">More</div>' + me.more.map(function (m, i) { return acc(m.k, '<div class="pre">' + nl(m.t) + '</div><button class="mini" data-act="copy-more" data-v="' + i + '">Copy</button>'); }).join('');
    h += acc('My three follow-up emails', ['1', '2', '3'].map(function (k) { var e = me.emails[k]; return '<p class="sec">' + esc(e.label) + '</p><div class="pre">' + nl('Subject: ' + e.subject + '\n\n' + e.body + (e.note ? '\n\n' + e.note : '')).replace(/\{(\w+)\}/g, '[$1]') + '</div>'; }).join(''));
    h += '<div class="sec">Settings</div><label class="s" for="ev">Where I am now (used when I add someone)</label><input id="ev" type="text" value="' + esc(user.event || me.event) + '">';
    h += '<div class="two"><button class="btn o" data-act="backup">Download backup</button><button class="btn o" data-act="restore">Restore backup</button></div><input id="rfile" type="file" accept="application/json,.json" hidden>';
    h += '<p class="s">Your notes live on this phone only. Download a backup each night of the event.' + (user.lastBackup ? ' Last backup: ' + esc(niceDate(user.lastBackup)) + '.' : ' No backup yet.') + '</p>';
    h += '<button class="link" data-act="lock">Lock the Book on this phone</button><p class="s small">' + esc(me.disclaimer) + '</p><p class="s small">Version ' + VERSION + '</p>';
    return h;
  }

  function vAdd() {
    var ev = user.event || content.me.event;
    var h = '<button class="back" data-act="back">‹ Back</button><h1>' + (ui.addMet ? 'I just met <i>someone</i>' : 'Add <i>someone</i>') + '</h1>';
    h += '<label class="sec" for="a-name">Name</label><input id="a-name" type="text" autocomplete="off" placeholder="First and last"><div id="a-match"></div>';
    h += '<label class="sec" for="a-biz">Business or role</label><input id="a-biz" type="text" autocomplete="off">';
    h += '<label class="sec" for="a-ev">Where we met</label><input id="a-ev" type="text" value="' + esc(ev) + '">';
    h += '<div class="sec">What kind of person</div><div class="chips" id="a-b">' + content.buckets.map(function (b) { return '<button class="chip" data-act="a-bucket" data-v="' + b.k + '">' + esc(b.label) + '</button>'; }).join('') + '</div>';
    h += '<div class="chips"><button class="chip" id="a-local" data-act="a-flag">' + HORN + 'Local to Austin</button><button class="chip' + (ui.addMet ? ' on' : '') + '" id="a-met" data-act="a-flag">I have met them</button></div>';
    h += '<label class="sec" for="a-real">One real thing they said</label><textarea id="a-real" rows="2" placeholder="This becomes the first line of your email"></textarea>';
    h += '<label class="sec" for="a-email">Email</label><input id="a-email" type="email" autocomplete="off">';
    h += '<label class="sec" for="a-phone">Phone (only if they prefer it)</label><input id="a-phone" type="tel" autocomplete="off">';
    return h + '<button class="btn d big" data-act="a-save">Save</button>';
  }

  /* ---------- copy builders ---------- */
  function firstName(p) {
    var nm = p.name;
    if (/ and /.test(nm)) return nm.replace(/ (O'Hern|Wilson)\b/g, '');
    if (/^Dr\.? /.test(nm)) { var w = nm.replace(/,.*$/, '').split(' '); return 'Dr. ' + w[w.length - 1]; }
    return nm.replace(/,.*$/, '').split(' ')[0];
  }
  function emailFor(p) {
    var n = peek(p.id), et = n.et == null ? (p.et || 0) : n.et;
    if (!et) return null;
    var e = content.me.emails[String(et)], ev = p.event || content.me.event, short = ev.split(',')[0].trim(), full = ev.replace(/,\s*/, ' in ');
    var real = (n.real || '').trim(); if (real && !/[.!?]$/.test(real)) real += '.';
    var company = (p.biz || '').split('·')[0].trim() || 'your company';
    function fill(s) { return s.replace(/\{FIRST\}/g, firstName(p)).replace(/\{EVENT_SHORT\}/g, short).replace(/\{EVENT\}/g, full).replace(/\{REAL\}/g, real || '[One real thing from your conversation]').replace(/\{COMPANY\}/g, company); }
    return { subject: fill(e.subject), body: fill(e.body), hasReal: !!real, note: e.note || '' };
  }
  function copyEmail(p) {
    var e = emailFor(p);
    if (!e) { toast('Pick which email to send first.'); ui.pid = p.id; ui.ptab = 'notes'; go('person'); return; }
    copy('Subject: ' + e.subject + '\n\n' + e.body, e.hasReal ? 'Email copied. Attach the handout.' : 'Copied, but add the one real thing they said before you send.');
  }
  function claudeNotes(p) {
    var n = peek(p.id);
    var t = 'I met this person at an event. Help me tidy my notes.\n\nRules: 6th-grade reading level. Short. Use only what is written below. Do not invent facts. If something is missing, say "not captured."\n\n' +
      'PERSON\nName: ' + p.name + '\nBusiness: ' + (p.biz || '') + '\nWhere we met: ' + (p.event || '') + '\nType: ' + (p.buckets || []).map(function (k) { return bucket(k).label; }).join(', ') + '\n\n' +
      'WHAT I KNEW BEFORE\n' + (p.why || 'Nothing.') + '\n\n' +
      'MY NOTES\nOne real thing they said: ' + (n.real || '') + '\nWhat else they said: ' + (n.said || '') + '\nHow I can help them: ' + (n.helpThem || '') + '\nHow they can help me: ' + (n.helpMe || '') + '\nNext step: ' + (n.next || '') + '\n\n' +
      'TRANSCRIPT\n' + (n.transcript || 'None.') + '\n\n' +
      'GIVE ME BACK, with these exact headings, so I can paste each one into my notes:\n1. One real thing they said (one sentence, it opens my follow-up email)\n2. What else they said (3 bullets at most)\n3. How I can help them\n4. How they can help me\n5. Next step, with a date if one was said';
    copy(t, 'Copied. Paste it into your Claude app.');
  }
  function claudePrep(p) {
    var n = peek(p.id);
    var t = 'Help me get ready to talk with this person. Look them up if you can, and tell me what you could not confirm.\n\n' +
      'PERSON\nName: ' + p.name + '\nBusiness or role: ' + (p.biz || '') + '\nWhere we met or will meet: ' + (p.event || '') + '\nWhat I know: ' + [n.real, n.said].filter(Boolean).join(' ') + '\n\n' +
      'ABOUT ME\nI\'m Kristin, founder of Passport to More, a perimenopause education brand. I\'m a peer, not a doctor. I used to lead Digital Innovation at McDonald\'s USA. I give a talk for women at work called "Nobody Told Us: Perimenopause at Work."\n\n' +
      'MY WORDING RULES\nFirst person. Simple, non-medical language. Say "nobody told me." Never say I build alone or with AI. No prices, no manager training, no legal claims, no promised outcomes.\n\n' +
      'GIVE ME BACK, with these exact headings, at a 6th-grade reading level:\n1. Why they matter (2 sentences)\n2. Open with (one question I can ask them)\n3. Ask about (3 short items)\n4. My small ask (one, and never a sales pitch)';
    copy(t, 'Copied. Paste it into your Claude app.');
  }

  /* ---------- backup ---------- */
  function backup() {
    var data = JSON.stringify({ app: 'Passport to More Book', version: VERSION, exportedAt: new Date().toISOString(), user: user }, null, 2);
    var name = 'P2M_Book_backup_' + ymd() + '.json';
    user.lastBackup = ymd(); save();
    try {
      var file = new File([data], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(function () {}); render(); return; }
    } catch (e) {}
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); toast('Backup saved.'); render();
  }
  function restore(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result); if (!j.user || !j.user.notes) throw new Error('bad');
        if (!confirm('Replace the notes on this phone with the backup from ' + (j.exportedAt || '').slice(0, 10) + '?')) return;
        localStorage.setItem(K_USER, JSON.stringify(j.user)); user = loadUser(); toast('Backup restored.'); render();
      } catch (e) { toast('That file is not a Book backup.'); }
    };
    r.readAsText(file);
  }

  /* ---------- events ---------- */
  nav.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; ui.editPrep = false; ui.picking = false; go(b.getAttribute('data-go')); });

  document.addEventListener('click', function (e) {
    var qo = e.target.closest('#qrover'); if (qo) { qo.remove(); return; }
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.getAttribute('data-act'), v = el.getAttribute('data-v'), id = el.getAttribute('data-id'), p;
    switch (act) {
      case 'unlock':
        var val = document.getElementById('pass').value; el.disabled = true; el.textContent = 'Opening…';
        unlock(val).then(start, function () { renderLock('That passcode did not work. Check it and try again. You need to be online the first time.'); });
        break;
      case 'open': ui.pid = id; ui.ptab = 'prep'; ui.editPrep = false; go('person'); break;
      case 'back': ui.editPrep = false; if (history.length > 1) history.back(); else go('people'); break;
      case 'ptab': ui.ptab = v; ui.editPrep = false; render(); break;
      case 'fstatus': ui.fStatus = v; render(); break;
      case 'fbucket': ui.fBucket = ui.fBucket === v ? '' : v; render(); break;
      case 'status': setStatus(ui.pid, v); render(); toast(v === 'met' ? 'Marked Met. Follow-up due in 2 days.' : v === 'done' ? 'Marked Done.' : 'Back to To meet.'); break;
      case 'toggle': var n = note(ui.pid); n[v] = !n[v]; save(); render(); break;
      case 'et': note(ui.pid).et = +v; save(); render(); break;
      case 'copy-email': copyEmail(person(ui.pid)); break;
      case 'mail': p = person(ui.pid); var em = emailFor(p); if (!em) { toast('Pick which email to send first.'); break; } location.href = 'mailto:' + encodeURIComponent(peek(p.id).email) + '?subject=' + encodeURIComponent(em.subject) + '&body=' + encodeURIComponent(em.body); break;
      case 'claude-notes': claudeNotes(person(ui.pid)); break;
      case 'claude-prep': claudePrep(person(ui.pid)); break;
      case 'prep-edit': ui.editPrep = true; render(); break;
      case 'prep-cancel': ui.editPrep = false; render(); break;
      case 'prep-save':
        var o = { why: document.getElementById('e-why').value.trim(), open: document.getElementById('e-open').value.trim().replace(/^[“"]|[”"]$/g, ''), ask: document.getElementById('e-ask').value.split('\n').map(function (s) { return s.replace(/^[\s•\-\d.]+/, '').trim(); }).filter(Boolean), small: document.getElementById('e-small').value.trim().replace(/^[“"]|[”"]$/g, '') };
        var added = user.added.filter(function (x) { return x.id === ui.pid; })[0];
        if (added) Object.assign(added, o); else user.prep[ui.pid] = o;
        save(); ui.editPrep = false; render(); toast('Prep saved.'); break;
      case 'del': if (confirm('Remove this person and their notes from the Book?')) { user.added = user.added.filter(function (x) { return x.id !== ui.pid; }); delete user.notes[ui.pid]; save(); go('people'); } break;
      case 'f-email': copyEmail(person(id)); break;
      case 'f-notes': ui.pid = id; ui.ptab = 'notes'; go('person'); break;
      case 'f-done': setStatus(id, 'done'); render(); toast('Marked Done.'); break;
      case 'show-done': ui.showDone = !ui.showDone; render(); break;
      case 'pitch': ui.pitch = +v; render(); break;
      case 'adjust': ui.adjust = ui.adjust === +v ? -1 : +v; render(); break;
      case 'copy-more': copy(content.me.more[+v].t, 'Copied.'); break;
      case 'qr': var d = document.createElement('div'); d.id = 'qrover'; d.innerHTML = '<img src="qr/' + v + '.png" alt="QR code"><span>Tap anywhere to close. Turn your brightness up.</span>'; document.body.appendChild(d); break;
      case 'backup': backup(); break;
      case 'restore': document.getElementById('rfile').click(); break;
      case 'lock': if (confirm('Lock the Book? Your notes stay on this phone. You will need the passcode to open it again.')) { localStorage.removeItem(K_CONTENT); localStorage.removeItem(K_PASS); content = null; renderLock(); } break;
      case 'add-met': ui.addMet = true; go('add'); break;
      case 'add-new': ui.addMet = false; go('add'); break;
      case 'a-bucket': case 'a-flag': el.classList.toggle('on'); break;
      case 'a-open': ui.pid = id; ui.ptab = 'notes'; if (ui.addMet && peek(id).status === 'tomeet') setStatus(id, 'met'); history.replaceState(null, '', '#/p/' + encodeURIComponent(id)); ui.view = 'person'; render(); window.scrollTo(0, 0); break;
      case 'a-save':
        var name = document.getElementById('a-name').value.trim(); if (!name) { toast('Add a name first.'); break; }
        var nid = 'u-' + Date.now().toString(36);
        var bs = Array.prototype.map.call(document.querySelectorAll('#a-b .chip.on'), function (c) { return c.getAttribute('data-v'); });
        var evv = document.getElementById('a-ev').value.trim();
        user.added.push({ id: nid, name: name, biz: document.getElementById('a-biz').value.trim(), buckets: bs, why: '', open: '', ask: [], small: '', et: bs.indexOf('work') >= 0 ? 1 : bs.indexOf('peri') >= 0 ? 2 : bs.length ? 3 : 0, event: evv, addedAt: ymd() });
        var nn = note(nid); nn.local = document.getElementById('a-local').classList.contains('on');
        nn.real = document.getElementById('a-real').value.trim(); nn.email = document.getElementById('a-email').value.trim(); nn.phone = document.getElementById('a-phone').value.trim();
        if (document.getElementById('a-met').classList.contains('on')) setStatus(nid, 'met'); else save();
        ui.pid = nid; ui.ptab = 'notes'; history.replaceState(null, '', '#/p/' + nid); ui.view = 'person'; render(); window.scrollTo(0, 0); toast('Saved to the Book.'); break;
      case 'pick-start': ui.picking = true; render(); break;
      case 'pick-done': ui.picking = false; render(); break;
      case 'pick': var t = ymd(), arr = user.picks[t] || (user.picks[t] = []), ix = arr.indexOf(id); if (ix >= 0) arr.splice(ix, 1); else arr.push(id); save(); render(); break;
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q') { ui.q = t.value; var pl = document.getElementById('plist'); if (pl) pl.innerHTML = listHtml(); return; }
    if (t.id === 'ev') { user.event = t.value; saveSoon(); return; }
    if (t.id === 'a-name') {
      var q = t.value.trim().toLowerCase(), box = document.getElementById('a-match');
      var hits = q.length < 2 ? [] : allPeople().filter(function (p) { return p.name.toLowerCase().indexOf(q) >= 0; }).slice(0, 3);
      box.innerHTML = hits.length ? '<p class="s">Already in the Book:</p>' + hits.map(function (p) { return '<button class="card" data-act="a-open" data-id="' + esc(p.id) + '" style="border-left-color:' + edge(p) + '"><span class="cmain"><b>' + esc(p.name) + '</b><span>' + esc(p.biz || '') + '</span></span><span class="st no">Open</span></button>'; }).join('') : '';
      return;
    }
    var f = t.getAttribute && t.getAttribute('data-f');
    if (f && ui.view === 'person') { note(ui.pid)[f] = t.value; saveSoon(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'rfile' && e.target.files[0]) restore(e.target.files[0]);
    if (e.target.getAttribute && e.target.getAttribute('data-f') === 'email') { save(); render(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'pass') { var b = document.querySelector('[data-act="unlock"]'); if (b) b.click(); } });
  window.addEventListener('pagehide', save);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});
  boot();
})();
