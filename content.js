/* Pestañas WhatsApp Business v2.0 - categorías, archiva solo, historial H, oscuro */
(function () {
  'use strict';
  if (window.__wbp_loaded2) return;
  window.__wbp_loaded2 = true;

  var TABS_KEY = 'wbp_tabs_v2';
  var OLD_KEY = 'wbp_tabs_v1';
  var HIST_KEY = 'wbp_hist_v1';
  var COLLAPSE_KEY = 'wbp_collapsed_v1';
  var BAR_ID = 'wbp-tabs-bar';
  var CATS = ['URG', 'TUR', 'ASES', 'PNDT', 'PRESU', 'CONF-T', 'OTROS', 'CAMP'];

  var tabs = [];
  var hist = [];
  var collapsed = false;
  var currentChat = '';
  var lastOpenedTabId = null;
  var barEl = null;
  var openCat = null;
  var busyArchive = false;
  var histDaysShown = 2;

  function q(sel, root) { try { return (root || document).querySelector(sel); } catch (e) { return null; } }
  function qa(sel, root) { try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; } }
  function qm(list, root) {
    if (typeof list === 'string') return q(list, root);
    for (var i = 0; i < list.length; i++) { var el = q(list[i], root); if (el) return el; }
    return null;
  }

  var SEL = {
    headerTitle: [
      'header span[data-testid="conversation-info-header-chat-title"]',
      '#main header span[data-testid="conversation-info-header-chat-title"]',
      '#main header span[title]', 'header span[title]'
    ],
    chatRow: ['div[data-testid="cell-frame-container"]', 'div[role="listitem"]', 'div[role="row"]'],
    rowTitle: ['[data-testid="cell-frame-title"] span[title]', 'span[data-testid="cell-frame-title"]', '[data-testid="cell-frame-title"] span', 'span[title]', 'span[dir="auto"]', 'span._ao3e'],
    searchBox: ['[data-testid="chat-list-search"]', '#side div[contenteditable="true"]', 'div[contenteditable="true"][data-tab="3"]']
  };

  // Plan Claudio: identidad por DNI (jid/tel/nombre normalizado), no por nodo.
  var hiddenKeys = new Set();
  var selLevel = { row: 0, name: 0 };
  var domNotice = false;
  function norm(s) {
    try { return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
    catch (e) { return (s || '').toLowerCase().trim(); }
  }
  function digits(s) { try { return (s || '').replace(/\D/g, ''); } catch (e) { return ''; } }
  function tabKeys(t) {
    var k = [];
    if (t.jid) k.push(t.jid);
    if (t.phone && digits(t.phone).length >= 6) k.push(digits(t.phone));
    if (t.original) k.push(norm(t.original));
    return k;
  }
  function rebuildHiddenKeys() {
    hiddenKeys = new Set();
    tabs.forEach(function (t) { tabKeys(t).forEach(function (k) { if (k) hiddenKeys.add(k); }); });
  }
  function isSearchActive() {
    try {
      var s = qm(SEL.searchBox);
      if (!s) return false;
      var tx = (s.textContent || s.value || '').trim();
      if (tx && tx.length > 0 && tx.toLowerCase().indexOf('buscar') !== 0) return true;
      // Si hay texto distinto al placeholder, no ocultar
      return false;
    } catch (e) { return false; }
  }
  var applyRaf = 0;
  function applyHidden() {
    applyRaf = 0;
    try {
      if (isSearchActive()) {
        // No ocultar en búsqueda, o no verías resultados (Claudio)
        qa('[data-ra-hidden]').forEach(function (r) { try { r.removeAttribute('data-ra-hidden'); r.style.translate = ''; } catch (e) {} });
        return;
      }
      var rows = getChatRows();
      rows.sort(function (a, b) {
        try { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; } catch (e) { return 0; }
      });
      var shift = 0;
      rows.forEach(function (r) {
        var n = getRowName(r);
        var hide = false;
        if (n) {
          var nn = norm(n);
          var dd = digits(n);
          if (hiddenKeys.has(nn)) hide = true;
          else if (dd && dd.length >= 6 && hiddenKeys.has(dd)) hide = true;
          else {
            // match por teléfono guardado aunque el nombre sea distinto
            for (var i = 0; i < tabs.length; i++) {
              var tp = digits(tabs[i].phone || '');
              if (tp && dd === tp) { hide = true; break; }
            }
          }
        }
        // row jid directo si lo tiene
        if (!hide) {
          try {
            var html = r.outerHTML || '';
            var m = html.match(/(\d{7,15})@c\.us/) || html.match(/(\d{7,15})@lid/);
            if (m && hiddenKeys.has(m[1])) hide = true;
          } catch (e) {}
        }
        try {
          if (hide) r.setAttribute('data-ra-hidden', '1');
          else r.removeAttribute('data-ra-hidden');
          if (!hide && shift) r.style.translate = '0 ' + (-shift) + 'px';
          else if (!hide) r.style.translate = '';
          if (hide) { try { shift += r.offsetHeight || 72; } catch (e) { shift += 72; } }
        } catch (e) {}
      });
    } catch (e) {}
  }
  function scheduleApply() { if (!applyRaf) applyRaf = requestAnimationFrame(function () { applyHidden(); }); }
  // Puente a MAIN (wa-js si existe, si no usa DOM)
  function callBridge(op, jid) {
    return new Promise(function (resolve) {
      try {
        var id = 'r' + Date.now() + Math.floor(Math.random() * 99999);
        var done = false;
        function h(e) {
          try {
            if (!e.data || e.data.ra !== 'res' || e.data.id !== id) return;
            if (!done) { done = true; try { window.removeEventListener('message', h); } catch (x) {} resolve(e.data); }
          } catch (x) {}
        }
        window.addEventListener('message', h);
        window.postMessage({ ra: 'req', id: id, op: op, jid: jid }, '*');
        setTimeout(function () { if (!done) { done = true; try { window.removeEventListener('message', h); } catch (x) {} resolve({ err: 'timeout' }); } }, 2500);
      } catch (x) { resolve({ err: 'fail' }); }
    });
  }

  var ARCHIVE_KW = ['archivar', 'archive', 'arquivar', 'archiver', 'archivieren'];
  var UNARCHIVE_KW = ['desarchivar', 'unarchive', 'desarquivar', 'désarchiver'];

  function getCurrentChatName() {
    try {
      var t = qm(SEL.headerTitle);
      if (!t) return '';
      var n = (t.getAttribute('title') || t.textContent || '').trim();
      if (!n || n.length > 60) return '';
      return n;
    } catch (e) { return ''; }
  }
  function getRowName(row) {
    try {
      for (var i = 0; i < SEL.rowTitle.length; i++) {
        var el = null; try { el = row.querySelector(SEL.rowTitle[i]); } catch (e) {}
        if (el) {
          var v = (el.getAttribute('title') || el.textContent || '').trim();
          if (v) {
            if (i > selLevel.name) { selLevel.name = i; maybeDomNotice(); }
            return v;
          }
        }
      }
      return '';
    } catch (e) { return ''; }
  }
  function maybeDomNotice() {
    try {
      if (domNotice) return;
      if (selLevel.name >= SEL.rowTitle.length - 1 || selLevel.row >= SEL.chatRow.length - 1) {
        domNotice = true;
        var b = document.getElementById(BAR_ID);
        if (b) {
          var d = document.createElement('div');
          d.textContent = 'DOM cambió';
          d.title = 'WhatsApp cambió, aviso discreto';
          d.style.cssText = 'font-size:10px;color:#8696a0;text-align:center;';
          b.appendChild(d);
        }
      }
    } catch (e) {}
  }
  function getChatRows() {
    try {
      var rows = [];
      // Buscar en todo el documento, no solo #pane-side.
      // Así agarra resultados del buscador y carpeta Archivados.
      SEL.chatRow.forEach(function (s) {
        try {
          var a = qa('#pane-side ' + s);
          var b = qa(s);
          rows = rows.concat(a.length ? a : b);
        } catch (e) {}
      });
      var seen = new Set(); var out = [];
      rows.forEach(function (r) { if (!seen.has(r)) { seen.add(r); out.push(r); } });
      return out;
    } catch (e) { return []; }
  }
  function findRowByName(target) {
    try {
      var rows = getChatRows();
      var low = (target || '').toLowerCase().trim(); var part = null;
      for (var i = 0; i < rows.length; i++) {
        var n = getRowName(rows[i]); if (!n) continue;
        if (n === target) return rows[i];
        if (!part && low && n.toLowerCase().indexOf(low) !== -1) part = rows[i];
      }
      return part;
    } catch (e) { return null; }
  }
  function realClick(el) {
    try {
      var inner = el;
      try {
        // Clic en el div interno, no en el listitem (Claudio Plan B)
        var cand = el.querySelector('div[role="button"], div[data-testid*="cell"], span[title]');
        if (cand) inner = cand;
      } catch (e) {}
      try { inner.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (t) {
        try { inner.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })); } catch (e) {}
      });
      return true;
    } catch (e) { return false; }
  }
  function guessPhone(name) {
    try {
      var row = findRowByName(name);
      if (!row) return '';
      var html = row.outerHTML || '';
      var m = html.match(/(\d{7,15})@c\.us/);
      if (m) return m[1];
      m = html.match(/(\d{7,15})@g\.us/);
      if (m) return '';
      var did = row.getAttribute('data-id') || '';
      m = did.match(/(\d{7,15})/);
      if (m) return m[1];
      return '';
    } catch (e) { return ''; }
  }

  // --- archivar / desarchivar con tu método (clic derecho) ---
  function waitMenuAndClick(keywords) {
    return new Promise(function (resolve, reject) {
      var MAX = 2200; var start = Date.now();
      function find() {
        var cands = qa('[role="menuitem"], [data-testid*="menu-item"], li[class*="menu"], div[class*="menu-item"]');
        for (var i = 0; i < cands.length; i++) {
          var tx = (cands[i].textContent || '').trim().toLowerCase();
          for (var k = 0; k < keywords.length; k++) {
            if (tx.indexOf(keywords[k]) !== -1) { try { cands[i].click(); } catch (e) {} resolve(true); return true; }
          }
        }
        return false;
      }
      if (find()) return;
      var obs = new MutationObserver(function () {
        if (Date.now() - start > MAX) { try { obs.disconnect(); } catch (e) {} reject(new Error('timeout')); return; }
        if (find()) { try { obs.disconnect(); } catch (e) {} }
      });
      try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
      setTimeout(function () { try { obs.disconnect(); } catch (e) {} reject(new Error('timeout')); }, MAX);
    });
  }
  function contextMenuOnRow(row) {
    try {
      var r = row.getBoundingClientRect();
      var cx = r.left + r.width * 0.4, cy = r.top + r.height * 0.5;
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
      return true;
    } catch (e) { return false; }
  }
  function closeAnyMenu() {
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.body.click(); } catch (e) {}
  }
  async function archiveRow(row) {
    try {
      if (!row) return false;
      contextMenuOnRow(row);
      await waitMenuAndClick(ARCHIVE_KW);
      setTimeout(closeAnyMenu, 200);
      return true;
    } catch (e) { setTimeout(closeAnyMenu, 200); return false; }
  }
  async function unarchiveRow(row) {
    try {
      if (!row) return false;
      contextMenuOnRow(row);
      await waitMenuAndClick(UNARCHIVE_KW);
      setTimeout(closeAnyMenu, 200);
      return true;
    } catch (e) { setTimeout(closeAnyMenu, 200); return false; }
  }
  function archiveByName(name) {
    try {
      var row = findRowByName(name);
      if (!row) return Promise.resolve(false);
      return archiveRow(row);
    } catch (e) { return Promise.resolve(false); }
  }
  function unarchiveByName(name) {
    try {
      var row = findRowByName(name);
      if (!row) return Promise.resolve(false);
      return unarchiveRow(row);
    } catch (e) { return Promise.resolve(false); }
  }

  // --- guardar v2 por DNI ---
  var saveT = null;
  function saveTabs() {
    try {
      rebuildHiddenKeys();
      scheduleApply();
      clearTimeout(saveT);
      saveT = setTimeout(function () { try { chrome.storage.local.set({ [TABS_KEY]: { v: 2, tabs: tabs } }); } catch (e) {} }, 500);
    } catch (e) {}
  }
  function saveHist() { try { chrome.storage.local.set({ [HIST_KEY]: hist }); } catch (e) {} }
  function pruneHist() {
    try {
      var lim = Date.now() - 60 * 24 * 3600 * 1000;
      var before = hist.length;
      hist = hist.filter(function (h) { return (h.closedAt || 0) >= lim; });
      if (hist.length !== before) saveHist();
    } catch (e) {}
  }
  function loadAll(done) {
    try {
      chrome.storage.local.get([TABS_KEY, OLD_KEY, HIST_KEY, COLLAPSE_KEY], function (res) {
        try {
          var v = res && res[TABS_KEY];
          if (v && v.v === 2 && Array.isArray(v.tabs)) tabs = v.tabs;
          else if (Array.isArray(v)) tabs = v;
          else {
            var old = res && res[OLD_KEY];
            if (Array.isArray(old) && old.length) {
              tabs = old.map(function (o, i) {
                return { id: 'm' + Date.now() + i, original: o.original || o.name || '', custom: o.custom || o.original || '', category: '', phone: '', created: o.created || Date.now() };
              });
              try { chrome.storage.local.set({ [TABS_KEY]: tabs }); } catch (e) {}
            } else tabs = [];
          }
          // asegurar id y campos + jid
          tabs.forEach(function (t, i) {
            if (!t.id) t.id = 't' + Date.now() + i;
            if (!t.custom) t.custom = t.original;
            if (typeof t.category === 'undefined') t.category = '';
            if (typeof t.phone === 'undefined') t.phone = '';
            if (!t.jid) t.jid = digits(t.phone || '') || norm(t.original);
            if (!t.pinnedAt) t.pinnedAt = t.created || Date.now();
          });
          rebuildHiddenKeys();
          // nombres (2) para repetidos
          fixDuplicateLabels();
          var h = res && res[HIST_KEY];
          hist = Array.isArray(h) ? h : [];
          pruneHist();
          collapsed = !!(res && res[COLLAPSE_KEY]);
        } catch (e) {}
        done();
      });
    } catch (e) { done(); }
  }
  function fixDuplicateLabels() {
    try {
      var seen = {};
      tabs.forEach(function (t) {
        var base = (t.custom || t.original || 'Chat').replace(/\s\(\d+\)$/, '');
        t._base = base;
      });
      var counts = {};
      tabs.forEach(function (t) {
        var b = t._base;
        counts[b] = (counts[b] || 0) + 1;
      });
      var used = {};
      tabs.forEach(function (t) {
        var b = t._base;
        if ((counts[b] || 0) <= 1) { t.display = b; return; }
        used[b] = (used[b] || 0) + 1;
        t.display = used[b] === 1 ? b : b + ' (' + used[b] + ')';
      });
    } catch (e) {}
  }

  function dotColor(count) {
    // pastel, salvo +10 rojo fuerte titila
    if (count <= 0) return { hex: '#374045', blink: false };
    if (count <= 2) return { hex: '#b9e6c3', blink: false };
    if (count <= 5) return { hex: '#ffd8a8', blink: false };
    if (count <= 10) return { hex: '#ffb3ae', blink: false };
    return { hex: '#ff3b30', blink: true };
  }

  // --- abrir / cambiar ---
  function clearSearch() {
    try {
      var s = qm(SEL.searchBox); if (!s) return;
      s.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, '');
      try { s.blur(); } catch (e) {}
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    } catch (e) {}
  }
  function typeInSearch(text) {
    try {
      var s = qm(SEL.searchBox);
      if (!s) return null;
      try { s.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, text); }
      catch (e) { try { s.textContent = text; s.dispatchEvent(new InputEvent('input', { bubbles: true })); } catch (e2) {} }
      return s;
    } catch (e) { return null; }
  }
  function pressEnter() {
    try {
      var s = qm(SEL.searchBox);
      var t = s || document.activeElement || document.body;
      ['keydown', 'keypress', 'keyup'].forEach(function (ty) {
        try { t.dispatchEvent(new KeyboardEvent(ty, { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })); } catch (e) {}
      });
    } catch (e) {}
  }
  // --- abrir por DNI (Claudio): puente wa-js primero, Plan B DOM después. Sin archivar solo. ---
  function openByJid(tab, cb) {
    try {
      var jid = tab.jid || digits(tab.phone || '');
      if (!jid) { if (cb) cb({ err: 'no-jid' }); return; }
      // Si es solo dígitos, probar como @c.us y @lid
      var tries = [];
      if (jid.indexOf('@') !== -1) tries.push(jid);
      else { tries.push(jid + '@c.us'); tries.push(jid + '@lid'); }
      (function next(i) {
        if (i >= tries.length) { if (cb) cb({ err: 'no-wpp' }); return; }
        callBridge('open', tries[i]).then(function (r) {
          if (r && !r.err) { if (cb) cb({ ok: true }); }
          else next(i + 1);
        });
      })(0);
    } catch (e) { if (cb) cb({ err: 'fail' }); }
  }
  function searchAndOpenPlanB(target, phone, cb) {
    try {
      if (typeof phone === 'function') { cb = phone; phone = ''; }
      var tnorm = norm(target);
      var tdig = digits(phone || target);
      // 1) directo (incluye escondidos: los buscamos igual aunque estén ocultos)
      var hit = findRowByName(target);
      if (hit) { realClick(hit); setTimeout(clearSearch, 400); if (cb) cb(hit); return; }
      if (!typeInSearch(target)) { if (cb) cb(null); return; }
      var start = Date.now();
      var obs = new MutationObserver(function () {
        try {
          var h = findRowByNorm(tnorm, tdig);
          if (h) { try { obs.disconnect(); } catch (e) {} realClick(h); setTimeout(clearSearch, 500); if (cb) cb(h); return; }
          if (Date.now() - start > 3000) {
            try { obs.disconnect(); } catch (e) {}
            // Enter como último recurso
            pressEnter();
            setTimeout(function () {
              clearSearch();
              var cur = getCurrentChatName();
              if (cur && (norm(cur) === tnorm || (tdig && digits(cur) === tdig))) { if (cb) cb(true); }
              else if (cb) cb(null);
            }, 800);
          }
        } catch (e) {}
      });
      try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
      setTimeout(function () {
        try {
          var h2 = findRowByNorm(tnorm, tdig);
          if (h2) { try { obs.disconnect(); } catch (e) {} realClick(h2); setTimeout(clearSearch, 500); if (cb) cb(h2); }
        } catch (e) {}
      }, 1400);
    } catch (e) { if (cb) cb(null); }
  }
  function findRowByNorm(tnorm, tdig) {
    try {
      var rows = getChatRows();
      var part = null;
      for (var i = 0; i < rows.length; i++) {
        var n = getRowName(rows[i]); if (!n) continue;
        if (norm(n) === tnorm) return rows[i];
        if (tdig && digits(n) === tdig) return rows[i];
        if (!part && tnorm && norm(n).indexOf(tnorm.slice(0, 8)) !== -1) part = rows[i];
      }
      // también por jid en HTML
      if (!part && tdig) {
        for (var j = 0; j < rows.length; j++) {
          try { if ((rows[j].outerHTML || '').indexOf(tdig) !== -1) { part = rows[j]; break; } } catch (e) {}
        }
      }
      return part;
    } catch (e) { return null; }
  }

  function openTab(tab) {
    try {
      if (!tab) return;
      // 1) wa-js por DNI si existe
      openByJid(tab, function (r) {
        if (r && r.ok) { lastOpenedTabId = tab.id; scheduleApply(); render(); return; }
        // 2) Plan B DOM
        searchAndOpenPlanB(tab.original, tab.phone || '', function (row) {
          if (!row) {
            try {
              var t = document.createElement('div');
              t.textContent = 'No abrí "' + tab.original + '". Prueba buscarlo arriba en WhatsApp.';
              t.style.cssText = 'position:fixed;bottom:20px;left:90px;background:#202c33;color:#fff;padding:10px 14px;border-radius:8px;z-index:10006;font-size:13px;';
              document.body.appendChild(t);
              setTimeout(function () { try { t.remove(); } catch (e) {} }, 3500);
            } catch (e) {}
            return;
          }
          // Ya no archivamos/desarchivamos solo. Solo escondemos.
          lastOpenedTabId = tab.id;
          scheduleApply(); render();
        });
      });
    } catch (e) {}
  }

  function onChatChanged(newName) {
    try {
      if (newName === currentChat) return;
      currentChat = newName;
      // Ya no se archiva al salir. Solo se esconde visual y se sigue el título.
      if (newName) {
        var newTab = null;
        for (var i = 0; i < tabs.length; i++) if (tabs[i].original === newName) newTab = tabs[i];
        if (newTab) lastOpenedTabId = newTab.id;
      }
      // título arriba de Chrome
      try {
        var found = null;
        for (var j = 0; j < tabs.length; j++) if (tabs[j].original === newName) found = tabs[j];
        var want = found ? ((found.display || found.custom) + ' | WhatsApp') : (newName ? (newName + ' – WhatsApp') : document.title);
        if (newName && document.title !== want) document.title = want;
      } catch (e) {}
      render();
    } catch (e) {}
  }

  // --- barra vertical izquierda que TAPA zona roja 80% ---
  function setCollapsed(v) {
    try {
      collapsed = !!v;
      if (collapsed) document.body.classList.add('wbp-min');
      else document.body.classList.remove('wbp-min');
      try { chrome.storage.local.set({ [COLLAPSE_KEY]: collapsed }); } catch (e) {}
    } catch (e) {}
  }
  function showCtxMenu(x, y, tabId) {
    try {
      closeCtxMenu();
      var m = document.createElement('div');
      m.className = 'wbp-ctx'; m.id = 'wbp-ctx';
      m.style.left = x + 'px'; m.style.top = y + 'px';
      m.innerHTML = '<button data-a="edit">Editar</button><button data-a="del">Borrar</button>';
      document.body.appendChild(m);
      m.querySelector('[data-a="edit"]').addEventListener('click', function () { closeCtxMenu(); openEditor(tabId); });
      m.querySelector('[data-a="del"]').addEventListener('click', function () { closeCtxMenu(); closeTab(tabId); });
      setTimeout(function () {
        document.addEventListener('click', closeCtxMenu, { once: true });
      }, 50);
    } catch (e) {}
  }
  function closeCtxMenu() { try { var m = document.getElementById('wbp-ctx'); if (m && m.parentNode) m.parentNode.removeChild(m); } catch (e) {} }
  function ensureBar() {
    try {
      barEl = document.getElementById(BAR_ID);
      if (barEl) return barEl;
      barEl = document.createElement('div');
      barEl.id = BAR_ID;
      // Arriba: H y luego + . Abajo: minimizar.
      barEl.innerHTML = '<div class="wbp-top"><button id="wbp-histbtn" title="Historial">H</button><button id="wbp-add" title="Fijar chat abierto">+</button></div>' +
        '<div id="wbp-cats"></div><div id="wbp-loose"></div>' +
        '<div class="wbp-bottom"><button id="wbp-min" title="Esconder para ver WhatsApp">&lt;&lt;</button></div>';
      document.body.appendChild(barEl);
      var rs = document.createElement('button');
      rs.id = 'wbp-restore'; rs.textContent = '>>'; rs.title = 'Ver pestañas';
      document.body.appendChild(rs);
      rs.addEventListener('click', function () { setCollapsed(false); });
      document.body.classList.add('wbp-has-bar');
      if (collapsed) document.body.classList.add('wbp-min');
      q('#wbp-add', barEl).addEventListener('click', pinCurrent);
      q('#wbp-histbtn', barEl).addEventListener('click', openHistory);
      q('#wbp-min', barEl).addEventListener('click', function () { setCollapsed(true); });
      return barEl;
    } catch (e) { return null; }
  }

  function tabById(id) { for (var i = 0; i < tabs.length; i++) if (tabs[i].id === id) return tabs[i]; return null; }

  function render() {
    try {
      ensureBar();
      fixDuplicateLabels();
      var catsEl = document.getElementById('wbp-cats');
      var looseEl = document.getElementById('wbp-loose');
      if (!catsEl || !looseEl) return;
      catsEl.innerHTML = ''; looseEl.innerHTML = '';
      // categorías una abajo de otra, solo con chats, en orden
      CATS.forEach(function (cat) {
        var list = tabs.filter(function (t) { return t.category === cat; });
        if (!list.length) return;
        var b = document.createElement('button');
        b.className = 'wbp-cat' + (openCat === cat ? ' wbp-open' : '');
        var dc = dotColor(list.length);
        b.innerHTML = '';
        var nm = document.createElement('span'); nm.textContent = cat; b.appendChild(nm);
        var dot = document.createElement('span'); dot.className = 'wbp-dot' + (dc.blink ? ' blink' : '');
        dot.style.background = dc.hex; dot.title = list.length + ' chats'; b.appendChild(dot);
        b.addEventListener('click', function (ev) { ev.stopPropagation(); openCat = (openCat === cat ? null : cat); render(); });
        // botón derecho también en categoría: no hace nada, solo chats tienen menú
        catsEl.appendChild(b);
        if (openCat === cat) {
          var sub = document.createElement('div'); sub.className = 'wbp-sublist';
          list.forEach(function (t) { sub.appendChild(buildItem(t)); });
          catsEl.appendChild(sub);
        }
      });
      // sueltos abajo, fondo #242B42, sin puntito
      var loose = tabs.filter(function (t) { return !t.category; });
      if (!loose.length && !tabs.length) {
        var e = document.createElement('span'); e.className = 'wbp-empty';
        e.textContent = 'Toca +';
        looseEl.appendChild(e);
      }
      loose.forEach(function (t) {
        var d = document.createElement('div');
        d.className = 'wbp-loose-tab' + (t.original === currentChat ? ' wbp-active' : '');
        d.textContent = t.display || t.custom;
        d.title = (t.original || '') + (t.phone ? '\nTel: ' + t.phone : '') + '\nClic derecho: Editar o Borrar';
        d.addEventListener('click', function () { openTab(t); });
        d.addEventListener('contextmenu', function (ev) { ev.preventDefault(); ev.stopPropagation(); showCtxMenu(ev.clientX, ev.clientY, t.id); });
        looseEl.appendChild(d);
      });
    } catch (e) {}
  }

  function buildItem(t) {
    var d = document.createElement('div');
    d.className = 'wbp-item' + (t.original === currentChat ? ' wbp-active' : '');
    d.textContent = t.display || t.custom;
    d.title = (t.original || '') + (t.phone ? '\nTel: ' + t.phone : '') + '\nClic derecho: Editar o Borrar';
    d.addEventListener('click', function () { openTab(t); });
    d.addEventListener('contextmenu', function (ev) { ev.preventDefault(); ev.stopPropagation(); showCtxMenu(ev.clientX, ev.clientY, t.id); });
    return d;
  }

  function pinCurrent() {
    try {
      var name = getCurrentChatName();
      if (!name) { alert('Abre primero un chat y toca + FIJAR.'); return; }
      for (var i = 0; i < tabs.length; i++) if (tabs[i].original === name) { alert('Ese chat ya está fijado.'); return; }
      var phone = guessPhone(name);
      openPinModal(name, phone);
    } catch (e) {}
  }

  var editorEl = null;
  function closeEditor() { try { if (editorEl && editorEl.parentNode) editorEl.parentNode.removeChild(editorEl); } catch (e) {} editorEl = null; }
  function catOptions(sel) {
    var h = '<option value="">Sin categoría</option>';
    CATS.forEach(function (c) { h += '<option value="' + c + '"' + (sel === c ? ' selected' : '') + '>' + c + '</option>'; });
    return h;
  }
  function openPinModal(name, phone) {
    try {
      closeEditor();
      editorEl = document.createElement('div'); editorEl.className = 'wbp-editor';
      editorEl.innerHTML = '<div class="wbp-card"><h3>Fijar chat</h3><p class="wbp-sub">Chat: <b></b></p>' +
        '<label>Nombre que tú ves<input id="wbp-f-name" maxlength="40"></label>' +
        '<label>Categoría<select id="wbp-f-cat"></select></label>' +
        '<label>Teléfono (para historial)<input id="wbp-f-phone" maxlength="20" placeholder="Ej: 549..."></label>' +
        '<div class="wbp-btns"><button id="wbp-ok">Fijar y archivar</button><button id="wbp-no">Cerrar</button></div></div>';
      document.body.appendChild(editorEl);
      editorEl.querySelector('.wbp-sub b').textContent = name;
      var inN = editorEl.querySelector('#wbp-f-name'); inN.value = name;
      editorEl.querySelector('#wbp-f-cat').innerHTML = catOptions('');
      var inP = editorEl.querySelector('#wbp-f-phone'); inP.value = phone || '';
      if (!phone) { inP.placeholder = 'No lo encontré, escríbelo si quieres'; }
      editorEl.querySelector('#wbp-no').addEventListener('click', closeEditor);
      editorEl.addEventListener('click', function (ev) { if (ev.target === editorEl) closeEditor(); });
      editorEl.querySelector('#wbp-ok').addEventListener('click', function () {
        var custom = (inN.value || '').trim() || name;
        var cat = editorEl.querySelector('#wbp-f-cat').value || '';
        var ph = (inP.value || '').trim();
        var tab = { id: 't' + Date.now() + Math.floor(Math.random() * 9999), original: name, custom: custom, category: cat, phone: ph, jid: digits(ph) || norm(name), pinnedAt: Date.now(), created: Date.now() };
        tabs.push(tab); saveTabs(); render(); closeEditor();
        // Ya no se archiva al fijar. Solo se esconde (Claudio).
        if (cat) openCat = cat; render();
      });
      setTimeout(function () { try { inN.focus(); inN.select(); } catch (e) {} }, 50);
    } catch (e) {}
  }
  function openEditor(id) {
    try {
      var t = tabById(id); if (!t) return;
      closeEditor();
      editorEl = document.createElement('div'); editorEl.className = 'wbp-editor';
      editorEl.innerHTML = '<div class="wbp-card"><h3>Cambiar pestaña</h3><p class="wbp-sub">Chat: <b></b></p>' +
        '<label>Nombre<input id="wbp-f-name" maxlength="40"></label>' +
        '<label>Categoría<select id="wbp-f-cat"></select></label>' +
        '<label>Teléfono<input id="wbp-f-phone" maxlength="20"></label>' +
        '<div class="wbp-btns"><button id="wbp-ok">Guardar</button><button id="wbp-no">Cerrar</button></div></div>';
      document.body.appendChild(editorEl);
      editorEl.querySelector('.wbp-sub b').textContent = t.original;
      var inN = editorEl.querySelector('#wbp-f-name'); inN.value = t.custom || t.original;
      editorEl.querySelector('#wbp-f-cat').innerHTML = catOptions(t.category || '');
      var inP = editorEl.querySelector('#wbp-f-phone'); inP.value = t.phone || '';
      editorEl.querySelector('#wbp-no').addEventListener('click', closeEditor);
      editorEl.addEventListener('click', function (ev) { if (ev.target === editorEl) closeEditor(); });
      editorEl.querySelector('#wbp-ok').addEventListener('click', function () {
        t.custom = (inN.value || '').trim() || t.original;
        t.category = editorEl.querySelector('#wbp-f-cat').value || '';
        t.phone = (inP.value || '').trim();
        t.jid = digits(t.phone) || norm(t.original);
        saveTabs(); render(); closeEditor();
      });
      setTimeout(function () { try { inN.focus(); inN.select(); } catch (e) {} }, 50);
    } catch (e) {}
  }

  function closeTab(id) {
    try {
      var idx = -1, t = null;
      for (var i = 0; i < tabs.length; i++) if (tabs[i].id === id) { idx = i; t = tabs[i]; break; }
      if (idx < 0) return;
      // historial: nombre, hora, día, categoría, teléfono + jid. No se modifica después.
      hist.unshift({ hid: 'h' + Date.now() + idx, custom: t.custom || t.original, original: t.original, phone: t.phone || '', category: t.category || '', jid: t.jid || '', closedAt: Date.now() });
      pruneHist(); saveHist();
      var wasOpen = (t.original === currentChat);
      tabs.splice(idx, 1); saveTabs(); render();
      if (lastOpenedTabId === id) lastOpenedTabId = null;
      // queda archivado (terminé)
      if (t.original) setTimeout(function () { archiveByName(t.original); }, 400);
      if (wasOpen) { /* queda en archivados */ }
    } catch (e) {}
  }

  // --- historial H ---
  var histEl = null;
  function closeHistory() { try { if (histEl && histEl.parentNode) histEl.parentNode.removeChild(histEl); } catch (e) {} histEl = null; }
  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function dayLabel(ts) {
    try {
      var d = new Date(ts);
      var days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      var months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      return days[d.getDay()] + ', ' + d.getDate() + ' de ' + months[d.getMonth()] + ' de ' + d.getFullYear();
    } catch (e) { return ''; }
  }
  function timeLabel(ts) { try { var d = new Date(ts); var h = ('0' + d.getHours()).slice(-2); var m = ('0' + d.getMinutes()).slice(-2); return h + ':' + m; } catch (e) { return ''; } }
  function openHistory() {
    try {
      closeHistory(); histDaysShown = 2;
      histEl = document.createElement('div'); histEl.className = 'wbp-hist';
      histEl.innerHTML = '<div class="wbp-hist-card"><h3>Historial de pestañas cerradas</h3>' +
        '<input id="wbp-hsearch" placeholder="Buscar por nombre, teléfono o categoría... Ej: pedro">' +
        '<div class="wbp-hist-list" id="wbp-hlist"></div>' +
        '<button class="wbp-hmore" id="wbp-hmore">Ver más (7 días)</button>' +
        '<button class="wbp-hclose" id="wbp-hclose">Cerrar</button></div>';
      document.body.appendChild(histEl);
      var inp = histEl.querySelector('#wbp-hsearch');
      inp.addEventListener('input', renderHistList);
      histEl.querySelector('#wbp-hmore').addEventListener('click', function () { histDaysShown += 7; renderHistList(); });
      histEl.querySelector('#wbp-hclose').addEventListener('click', closeHistory);
      histEl.addEventListener('click', function (ev) { if (ev.target === histEl) closeHistory(); });
      renderHistList();
      setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
    } catch (e) {}
  }
  function renderHistList() {
    try {
      var listEl = document.getElementById('wbp-hlist'); if (!listEl) return;
      var qtxt = '';
      try { qtxt = (document.getElementById('wbp-hsearch').value || '').toLowerCase().trim(); } catch (e) {}
      var lim = Date.now() - histDaysShown * 24 * 3600 * 1000;
      var items = hist.filter(function (h) { return (h.closedAt || 0) >= lim; });
      if (qtxt) {
        items = items.filter(function (h) {
          return ((h.custom || '') + ' ' + (h.original || '') + ' ' + (h.phone || '') + ' ' + (h.category || '')).toLowerCase().indexOf(qtxt) !== -1;
        });
      }
      // agrupar por día
      var groups = {};
      items.forEach(function (h) { var k = dayKey(h.closedAt); if (!groups[k]) groups[k] = { ts: h.closedAt, arr: [] }; groups[k].arr.push(h); });
      var keys = Object.keys(groups).sort(function (a, b) { return groups[b].ts - groups[a].ts; });
      listEl.innerHTML = '';
      if (!keys.length) { listEl.textContent = 'No hay nada. Prueba con otra palabra o Ver más.'; return; }
      keys.forEach(function (k) {
        var g = groups[k];
        var dh = document.createElement('div'); dh.className = 'wbp-day'; dh.textContent = dayLabel(g.ts); listEl.appendChild(dh);
        var sep = document.createElement('div'); sep.className = 'wbp-sep'; sep.textContent = '----------------'; listEl.appendChild(sep);
        g.arr.sort(function (a, b) { return b.closedAt - a.closedAt; }).forEach(function (h) {
          var row = document.createElement('div'); row.className = 'wbp-hrow';
          var tm = document.createElement('span'); tm.className = 'wbp-htime'; tm.textContent = timeLabel(h.closedAt); row.appendChild(tm);
          var nm = document.createElement('span'); nm.className = 'wbp-hname';
          nm.textContent = (h.custom || h.original) + (h.category ? ' [' + h.category + ']' : '') + (h.phone ? ' - ' + h.phone : '');
          nm.title = 'Chat: ' + (h.original || '') + '\nTel: ' + (h.phone || '-');
          row.appendChild(nm);
          var fb = document.createElement('button'); fb.className = 'wbp-hfijar'; fb.textContent = 'Fijar';
          fb.title = 'Volver a fijar hoy (crea registro nuevo)';
          (function (hh) {
            fb.addEventListener('click', function (ev) {
              ev.stopPropagation();
              // crear nuevo hoy, no tocar lo viejo
              var nt = { id: 't' + Date.now() + Math.floor(Math.random() * 9999), original: hh.original, custom: hh.custom, category: hh.category || '', phone: hh.phone || '', created: Date.now() };
              // evitar duplicado original
              for (var i = 0; i < tabs.length; i++) if (tabs[i].original === nt.original) { alert('Ese chat ya está fijado.'); return; }
              tabs.push(nt); saveTabs(); render(); closeHistory();
              setTimeout(function () { archiveByName(nt.original); }, 400);
            });
          })(h);
          row.appendChild(fb);
          listEl.appendChild(row);
        });
      });
    } catch (e) {}
  }

  // --- inicio ---
  function pollTitle() {
    try { var n = getCurrentChatName(); if (n !== currentChat) onChatChanged(n); } catch (e) {}
  }
  function hookHideObserver() {
    try {
      var target = document.querySelector('#pane-side') || document.body;
      var raf = 0;
      new MutationObserver(function () {
        try { pollTitle(); } catch (e) {}
        if (!raf) raf = requestAnimationFrame(function () { raf = 0; applyHidden(); });
      }).observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    } catch (e) {}
  }
  function init() {
    loadAll(function () {
      ensureBar(); render(); setCollapsed(collapsed); scheduleApply(); hookHideObserver();
      try {
        if (chrome.storage && chrome.storage.onChanged) {
          chrome.storage.onChanged.addListener(function (ch, area) {
            try {
              if (ch && ch[TABS_KEY]) {
                var v = ch[TABS_KEY].newValue;
                if (v && v.v === 2 && Array.isArray(v.tabs)) tabs = v.tabs;
                else if (Array.isArray(v)) tabs = v;
                rebuildHiddenKeys(); render(); scheduleApply();
              }
            } catch (e) {}
          });
        }
      } catch (e) {}
      setInterval(function () {
        try {
          if (!document.getElementById(BAR_ID)) {
            try { var r = document.getElementById('wbp-restore'); if (r && r.parentNode) r.parentNode.removeChild(r); } catch (e) {}
            barEl = null; ensureBar(); render(); setCollapsed(collapsed); scheduleApply(); hookHideObserver();
          }
          pollTitle();
        } catch (e) {}
      }, 1200);
      pollTitle();
      console.log('%c[PESTAÑAS 0210-1436-MUSE] listo ✔ esconder por DNI, abrir por DNI', 'color:#00a884');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
