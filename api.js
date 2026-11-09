/* 前後台共用：呼叫 Google Apps Script；未設定網址時改用展示模式（瀏覽器內存） */
(function () {
  const cfg = window.APP_CONFIG || {};
  const isDemo = !cfg.API_URL;

  async function call(action, payload) {
    const body = Object.assign({ action }, payload || {});
    if (isDemo) return Demo.call(body);
    const res = await fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('網路連線問題（' + res.status + '）');
    return res.json();
  }

  /* ---------------- 展示模式 ---------------- */
  const KEY = 'daansi_demo_db_v1';
  const Demo = {
    mem: null,
    load() {
      if (this.mem) return this.mem;
      try { this.mem = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
      if (!this.mem) this.mem = this.seed();
      return this.mem;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.mem)); } catch (e) { } },
    seed() {
      return {
        pw: 'daan1234',
        settings: {
          orgName: '禪機山唯心聖教仙佛寺 台北道場大安寺', schoolName: '易經大學',
          contactPhone: '02-2683-7265', contactMobile: '0918-851-597', lineUrl: '',
          privacy: '本表所填個人資料僅供大安寺易經大學學籍管理、上課聯繫使用，不會提供給其他單位。'
        },
        classes: [{
          code: 'C36', name: '易經風水學初級卅六班',
          intro: '115年12月11日（星期五）晚上 7:00～8:30',
          start: '115年12月18日（星期五）晚上 7:00～10:00',
          period: '115年12月 至 117年8月，共 21 個月',
          place: '台北道場大安寺 第二講堂', address: '新北市樹林區大安路524號10樓',
          phone: '02-2683-7265　0918-851-597', quota: '', status: '開放報名', sort: '36', note: '', createdAt: now()
        }],
        regs: [], pays: [], photos: {}
      };
    },
    async call(b) {
      await new Promise(r => setTimeout(r, 250));
      const db = this.load();
      const out = this.route(db, b);
      this.save();
      return JSON.parse(JSON.stringify(out));
    },
    route(db, b) {
      const a = b.action;
      const pub = c => {
        const n = db.regs.filter(r => r.classCode === c.code && r.status !== '取消').length;
        return Object.assign({}, c, { full: !!(c.quota && n >= Number(c.quota)) });
      };
      if (a === 'init') {
        const open = db.classes.filter(c => c.status === '開放報名').map(pub).sort((x, y) => (y.sort || 0) - (x.sort || 0));
        const one = b.classCode ? db.classes.find(c => c.code.toLowerCase() === String(b.classCode).toLowerCase()) : null;
        return { ok: true, settings: db.settings, classes: open, cls: one ? pub(one) : null };
      }
      if (a === 'login') return b.password === db.pw ? { ok: true, token: 'demo' } : { ok: false, msg: '密碼不正確（展示模式密碼：daan1234）' };
      if (a === 'register' || a === 'adminRegister') {
        const isAdmin = a === 'adminRegister', d = b.data || {};
        const cls = db.classes.find(c => c.code === b.classCode);
        if (!cls) return { ok: false, msg: '找不到這個班別' };
        if (!isAdmin && cls.status !== '開放報名') return { ok: false, msg: '這一班目前沒有開放報名，請來電洽詢' };
        const list = db.regs.filter(r => r.classCode === cls.code);
        const norm = s => String(s || '').replace(/\D/g, '');
        const dup = list.find(r => r.status !== '取消' && r.name === d.name &&
          ((d.mobile && norm(r.mobile) === norm(d.mobile)) || (d.homeTel && norm(r.homeTel) === norm(d.homeTel))));
        if (dup && !isAdmin) return { ok: true, dup: true, id: dup.id, msg: '您已經報名過這一班了，不需要再報名' };
        const seq = list.reduce((m, r) => Math.max(m, Number(r.id.split('-').pop()) || 0), 0) + 1;
        const id = cls.code + '-' + String(seq).padStart(3, '0');
        let photoId = '';
        if (b.photo) { photoId = 'ph_' + id; db.photos[photoId] = b.photo; }
        const fam = (d.family || []).filter(f => f && (f.name || f.tel));
        db.regs.push(Object.assign({}, d, {
          id, classCode: cls.code, className: cls.name, createdAt: now(), status: isAdmin ? (d.status || '已報名') : '已報名',
          seat: d.seat || '', source: isAdmin ? '後台登錄' : '線上報名', idNo: String(d.idNo || '').toUpperCase(),
          family: fam, photoId, adminNote: d.adminNote || '', updatedAt: now()
        }));
        return { ok: true, id, className: cls.name };
      }
      if (b.token !== 'demo') return { ok: false, auth: false, msg: '請重新登入' };
      switch (a) {
        case 'adminData': return { ok: true, settings: db.settings, classes: db.classes, regs: db.regs, pays: db.pays };
        case 'updateReg': {
          const r = db.regs.find(x => x.id === b.id); if (!r) return { ok: false, msg: '找不到資料' };
          Object.assign(r, b.fields, { updatedAt: now() });
          if (b.fields.classCode) { const c = db.classes.find(x => x.code === b.fields.classCode); if (c) r.className = c.name; }
          return { ok: true };
        }
        case 'deleteReg': db.regs = db.regs.filter(x => x.id !== b.id); db.pays = db.pays.filter(p => p.regId !== b.id); return { ok: true };
        case 'autoSeat': {
          const act = db.regs.filter(r => r.classCode === b.classCode && r.status !== '取消');
          let max = act.reduce((m, r) => Math.max(m, Number(r.seat) || 0), 0), n = 0;
          act.forEach(r => { if (!r.seat) { r.seat = String(++max); n++; } });
          return { ok: true, count: n };
        }
        case 'saveClass': {
          const c = b.cls;
          if (!c.code || !/^[A-Za-z0-9_-]+$/.test(c.code)) return { ok: false, msg: '班別代碼只能用英文字母、數字' };
          const ex = db.classes.find(x => x.code === c.code);
          if (b.isNew) { if (ex) return { ok: false, msg: '班別代碼「' + c.code + '」已經有了，請換一個' }; db.classes.push(Object.assign({}, c, { createdAt: now() })); }
          else { Object.assign(ex, c); db.regs.forEach(r => { if (r.classCode === c.code) r.className = c.name; }); }
          return { ok: true };
        }
        case 'deleteClass':
          if (db.regs.some(r => r.classCode === b.code)) return { ok: false, msg: '這一班已經有學員報名，不能刪除（可改成「截止報名」）' };
          db.classes = db.classes.filter(c => c.code !== b.code); return { ok: true };
        case 'addPayment': { const pid = 'P' + Date.now(); db.pays.push(Object.assign({}, b.pay, { pid, createdAt: now() })); return { ok: true, pid }; }
        case 'deletePayment': db.pays = db.pays.filter(p => p.pid !== b.pid); return { ok: true };
        case 'getPhoto': return db.photos[b.photoId] ? { ok: true, dataUrl: db.photos[b.photoId] } : { ok: false };
        case 'saveSettings': Object.assign(db.settings, b.settings); return { ok: true };
        case 'changePassword':
          if (b.oldPw !== db.pw) return { ok: false, msg: '舊密碼不正確' };
          if (!b.newPw || b.newPw.length < 6) return { ok: false, msg: '新密碼至少 6 個字' };
          db.pw = b.newPw; return { ok: true };
        case 'logout': return { ok: true };
      }
      return { ok: false, msg: '未知的操作' };
    }
  };

  function now() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  window.API = { call, isDemo };
})();
