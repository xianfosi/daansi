/* 大安寺後台：初級班報名、點燈（植福點燈／供養燈）共用的上方選單與一次登入
 * 兩個後台各自的 config.js 都要先載入：APP_CONFIG（初級班）、LAMP_CONFIG（點燈）
 */
(function () {
  const BASE = new URL('./', document.currentScript.src).href;      // …/daansi/
  const KEYS = { cls: 'daansi_admin_token', lamp: 'daansi_lamp_token' };
  const DEMO_PW = 'daan1234';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { } };

  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    return r.json();
  }
  async function loginOne(cfg, password) {
    if (!cfg || !cfg.API_URL) return password === DEMO_PW ? { ok: true, token: 'demo' } : { ok: false, msg: '密碼不正確' };
    try { return await post(cfg.API_URL, { action: 'login', password }); }
    catch (e) { return { ok: false, msg: '連線失敗' }; }
  }

  /** 一次登入兩個後台；回傳 { cls, lamp }：各自 {ok, token, msg} */
  async function loginAll(password) {
    const [cls, lamp] = await Promise.all([loginOne(window.APP_CONFIG, password), loginOne(window.LAMP_CONFIG, password)]);
    if (cls.ok) set(KEYS.cls, cls.token);
    if (lamp.ok) set(KEYS.lamp, lamp.token);
    return { cls, lamp };
  }
  function logoutAll() {
    [[window.APP_CONFIG, KEYS.cls], [window.LAMP_CONFIG, KEYS.lamp]].forEach(([cfg, k]) => {
      const t = get(k);
      if (t && cfg && cfg.API_URL) post(cfg.API_URL, { action: 'logout', token: t }).catch(() => { });
      set(k, null);
    });
  }

  const LINKS = [
    { id: 'cls', label: '初級班報名', href: BASE + 'admin.html' },
    { id: 'main', label: '植福點燈', href: BASE + 'lamp/admin.html?act=main' },
    { id: 'gongyang', label: '仙佛寺供養燈', href: BASE + 'lamp/admin.html?act=gongyang' }
  ];
  const CSS = `
  .hub{background:#3d0a3d;color:#f6e9f6;font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif}
  .hub .in{max-width:1200px;margin:0 auto;padding:0 16px;display:flex;align-items:center;gap:6px;min-height:52px;flex-wrap:wrap}
  .hub b{font-size:15px;letter-spacing:.08em;margin-right:10px;white-space:nowrap}
  .hub a{color:#f6e9f6;text-decoration:none;font-weight:700;font-size:15px;padding:8px 14px;border-radius:999px;white-space:nowrap}
  .hub a:hover{background:rgba(255,255,255,.12)}
  .hub a.on{background:#fbf3fb;color:#3d0a3d}
  .hub .sp{flex:1}
  .hub button{background:transparent;border:1.5px solid rgba(255,255,255,.45);color:#f6e9f6;border-radius:999px;padding:6px 14px;font:inherit;font-size:14px;font-weight:700;cursor:pointer}`;

  /** 在頁面最上方放「大安寺後台」選單；current = 'cls' | 'main' | 'gongyang' | 其他活動代碼 */
  function mountBar(current, onLogout) {
    if (!document.getElementById('hubCss')) { const st = document.createElement('style'); st.id = 'hubCss'; st.textContent = CSS; document.head.appendChild(st); }
    let bar = document.getElementById('hubBar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'hubBar'; bar.className = 'hub'; document.body.insertBefore(bar, document.body.firstChild); }
    bar.innerHTML = `<div class="in"><b>大安寺後台</b>${LINKS.map(l => `<a href="${l.href}" class="${l.id === current ? 'on' : ''}">${l.label}</a>`).join('')}<span class="sp"></span><button type="button" id="hubOut">登出</button></div>`;
    bar.querySelector('#hubOut').onclick = () => { logoutAll(); if (onLogout) onLogout(); };
  }
  function unmountBar() { const b = document.getElementById('hubBar'); if (b) b.remove(); }

  /** 登入結果的提醒文字（另一邊密碼不同時） */
  function note(res, mine) {
    const other = mine === 'cls' ? res.lamp : res.cls;
    if (other && !other.ok) return `已登入。另一個後台（${mine === 'cls' ? '點燈' : '初級班'}）的密碼不一樣，切換過去時要再輸入一次；建議到兩邊「設定」把密碼改成一樣。`;
    return '';
  }

  window.Hub = { loginAll, logoutAll, mountBar, unmountBar, note, KEYS };
})();
