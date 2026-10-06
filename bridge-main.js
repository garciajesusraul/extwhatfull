/* PESTAÑAS 0210-1436-MUSE - puente MAIN para wa-js (si se agrega wppconnect-wa.js después) */
(function () {
  try {
    if (window.__wbp_bridge) return;
    window.__wbp_bridge = true;
    window.addEventListener('message', async function (e) {
      try {
        if (!e.data || e.data.ra !== 'req' || e.source !== window) return;
        var id = e.data.id, op = e.data.op, jid = e.data.jid;
        var res = null, err = 'no-wpp';
        try {
          if (window.WPP && window.WPP.chat) {
            if (window.WPP.webpack && window.WPP.webpack.onReady) {
              try { await window.WPP.webpack.onReady(window.WPP.webpack); } catch (x) {}
            }
            if (op === 'open') {
              try { await window.WPP.chat.archive(jid, false); } catch (x) {}
              res = await window.WPP.chat.openChatBottom(jid);
            } else if (op === 'archive') {
              res = await window.WPP.chat.archive(jid, true);
            } else if (op === 'active') {
              try { res = window.WPP.chat.getActiveChat()?.id?._serialized || null; } catch (x) { res = null; }
            }
            err = null;
          }
        } catch (x) { err = String(x); }
        window.postMessage({ ra: 'res', id: id, res: res, err: err }, '*');
      } catch (x) {}
    });
  } catch (x) {}
})();
