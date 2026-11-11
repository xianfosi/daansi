/* 點燈系統：前後台共用連線。未設定 API 網址時＝展示模式（資料存在這台裝置的瀏覽器，邏輯與正式版相同） */
(function () {
  const cfg = window.LAMP_CONFIG || {};
  const isDemo = !cfg.API_URL;

  async function call(action, payload) {
    const body = Object.assign({ action }, payload || {});
    if (isDemo) return Demo.call(body);
    const res = await fetch(cfg.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('網路連線問題（' + res.status + '）');
    return res.json();
  }

  const KEY = 'daansi_lamp_demo_v1';
  const pad = n => String(n).padStart(2, '0');
  const Demo = {
    load() {
      let raw = null; try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
      raw = raw || { kv: {}, orders: [], items: [], files: {}, pw: 'daan1234' };
      this.raw = raw;
      return { settings: LampCore.parseSettings(raw.kv), orders: raw.orders, items: raw.items, dirty: {} };
    },
    save(db) {
      if (db.dirty.settings) this.raw.kv = LampCore.settingsToKv(db.settings);
      this.raw.orders = db.orders; this.raw.items = db.items;
      try { localStorage.setItem(KEY, JSON.stringify(this.raw)); } catch (e) { }
    },
    async call(req) {
      await new Promise(r => setTimeout(r, 200));
      const db = this.load(), raw = this.raw;
      const env = {
        now: () => { const d = new Date(); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; },
        today: () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
        checkToken: t => t === 'demo',
        login: pw => pw === raw.pw ? 'demo' : null,
        loginMsg: () => '密碼不正確（展示模式密碼：daan1234）',
        logout: () => { },
        changePassword: (o, n) => { if (o !== raw.pw) return { ok: false, msg: '舊密碼不正確' }; if (!n || n.length < 6) return { ok: false, msg: '新密碼至少 6 個字' }; raw.pw = n; return { ok: true }; },
        saveFile: (d) => { const id = 'f' + Date.now(); raw.files[id] = d; return id; },
        getFile: id => raw.files[id] ? { ok: true, dataUrl: raw.files[id] } : { ok: false }
      };
      const out = LampCore.handle(req, db, env);
      this.save(db);
      return JSON.parse(JSON.stringify(out));
    }
  };

  window.API = { call, isDemo };
})();
