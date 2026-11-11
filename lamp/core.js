/**
 * 大安寺植福點燈系統 — 核心邏輯（前台展示模式與 Google Apps Script 共用同一份）
 * 在 Apps Script 中請貼成「Core.gs」；在網頁中以 <script src="core.js"> 載入。
 * 本檔不直接碰試算表或瀏覽器，存取資料一律透過 env（環境介面）。
 */
var LampCore = (function () {

  /* ================= 命卦與生肖 ================= */
  var TRI = ['乾', '兌', '離', '震', '巽', '坎', '艮', '坤'];          // 先天八卦序
  var TRI_IMG = { 乾: '天', 兌: '澤', 離: '火', 震: '雷', 巽: '風', 坎: '水', 艮: '山', 坤: '地' };
  var GUA = {
    '乾乾': '乾為天', '坤坤': '坤為地', '坎坎': '坎為水', '離離': '離為火', '震震': '震為雷', '艮艮': '艮為山', '巽巽': '巽為風', '兌兌': '兌為澤',
    '乾兌': '天澤履', '乾離': '天火同人', '乾震': '天雷無妄', '乾巽': '天風姤', '乾坎': '天水訟', '乾艮': '天山遯', '乾坤': '天地否',
    '兌乾': '澤天夬', '兌離': '澤火革', '兌震': '澤雷隨', '兌巽': '澤風大過', '兌坎': '澤水困', '兌艮': '澤山咸', '兌坤': '澤地萃',
    '離乾': '火天大有', '離兌': '火澤睽', '離震': '火雷噬嗑', '離巽': '火風鼎', '離坎': '火水未濟', '離艮': '火山旅', '離坤': '火地晉',
    '震乾': '雷天大壯', '震兌': '雷澤歸妹', '震離': '雷火豐', '震巽': '雷風恒', '震坎': '雷水解', '震艮': '雷山小過', '震坤': '雷地豫',
    '巽乾': '風天小畜', '巽兌': '風澤中孚', '巽離': '風火家人', '巽震': '風雷益', '巽坎': '風水渙', '巽艮': '風山漸', '巽坤': '風地觀',
    '坎乾': '水天需', '坎兌': '水澤節', '坎離': '水火既濟', '坎震': '水雷屯', '坎巽': '水風井', '坎艮': '水山蹇', '坎坤': '水地比',
    '艮乾': '山天大畜', '艮兌': '山澤損', '艮離': '山火賁', '艮震': '山雷頤', '艮巽': '山風蠱', '艮坎': '山水蒙', '艮坤': '山地剝',
    '坤乾': '地天泰', '坤兌': '地澤臨', '坤離': '地火明夷', '坤震': '地雷復', '坤巽': '地風升', '坤坎': '地水師', '坤艮': '地山謙'
  };
  var ZODIAC = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬'];
  var BRANCH = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

  /** 命卦：下卦依農曆月（1、9月乾…8月坤），上卦依農曆日除以 8 的餘數 */
  function gua(m, d, leap, leapRule) {
    m = Number(m); d = Number(d);
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    if (leap) {
      if (leapRule === 'next' || (leapRule === 'split' && d >= 16)) m = m === 12 ? 1 : m + 1;
    }
    var lower = TRI[(m - 1) % 8], upper = TRI[(d - 1) % 8];
    return GUA[upper + lower];
  }
  /** 生肖：依農曆出生年（民國年） */
  function zodiac(rocYear) {
    var y = Number(rocYear);
    if (!(y >= 1 && y <= 200)) return '';
    var i = (y - 1) % 12;
    return ZODIAC[i];
  }
  function branchOfZodiac(z) { var i = ZODIAC.indexOf(z); return i < 0 ? '' : BRANCH[i]; }

  /** 是否建議點太歲燈；回傳 {zodiac, gua, reasons:[...]} */
  function advise(person, settings) {
    var z = zodiac(person.birthY), g = gua(person.birthM, person.birthD, person.leap, settings.leapRule);
    var reasons = [];
    var zr = settings.zodiacRules || {};
    if (z && zr[z]) reasons.push('屬' + z + '，' + zr[z]);
    var gr = settings.guaRules || {};
    if (g && gr[g]) reasons.push('命卦「' + g + '」，' + gr[g]);
    return { zodiac: z, gua: g, reasons: reasons };
  }

  /* ================= 資料表定義 ================= */
  var ORDER_COLS = [
    ['id', '點燈單號'], ['year', '年度'], ['createdAt', '登記時間'], ['status', '單據狀態'], ['source', '登記方式'],
    ['contactName', '聯絡人'], ['phone', '聯絡電話'], ['zip', '郵遞區號'], ['address', '地址'], ['total', '應繳金額'],
    ['payStatus', '繳費狀態'], ['payMethod', '繳費方式'], ['payDate', '轉帳日期'], ['payAmount', '回報金額'],
    ['payLast5', '帳號後五碼'], ['payProof', '轉帳截圖'], ['payReportedAt', '回報時間'], ['payCheckedAt', '核對時間'],
    ['userNote', '信眾備註'], ['adminNote', '管理備註'], ['updatedAt', '更新時間']
  ];
  var ITEM_COLS = [
    ['id', '明細編號'], ['orderId', '點燈單號'], ['year', '年度'], ['lamp', '燈種'], ['price', '金額'],
    ['name', '姓名'], ['gender', '性別'], ['birthY', '農曆生年(民國)'], ['birthM', '農曆生月'], ['birthD', '農曆生日'],
    ['leap', '閏月'], ['zodiac', '生肖'], ['gua', '命卦'], ['advice', '太歲提示'], ['wish', '祈求事項'],
    ['takeBack', '燈取回'], ['male', '全戶男(丁)'], ['female', '全戶女(口)'], ['family', '本戶眷屬姓名'],
    ['address', '地址'], ['note', '備註']
  ];
  var PAY = { WAIT: '待繳費', REPORTED: '已回報', CASH: '現場繳現金', OK: '已核對' };

  var DEFAULT_SETTINGS = {
    orgName: '禪機山唯心聖教仙佛寺 台北道場大安寺',
    year: '116', ganzhi: '丁未',
    title: '丁未年（116）植福點燈',
    status: '開放登記',
    regDeadline: '',
    payNote: '請於登記後 7 天內完成轉帳，並回報帳號後五碼。',
    bankName: '', bankCode: '', bankBranch: '', bankAccount: '', bankHolder: '',
    contactPhone: '02-2683-7265', contactMobile: '0918-851-597', lineUrl: '',
    privacy: '所填資料僅供大安寺辦理點燈、法會疏文與聯繫使用，不會提供給其他單位。',
    leapRule: 'same',
    lamps: [
      { code: 'guangming', name: '光明燈', price: 2000, unit: '戶', quota: '', enabled: true, desc: '一戶一盞，闔家光明平安（一人獨居也可點一盞）' },
      { code: 'taisui', name: '太歲燈', price: 1000, unit: '人', quota: '', enabled: true, desc: '今年犯太歲或命卦需點燈者，祈求流年平順' },
      { code: 'xiaozai', name: '消災祈福燈', price: 2000, unit: '人', quota: 95, enabled: true, desc: '消災解厄、祈福納吉（限量）' }
    ],
    wishes: ['闔家平安', '身體健康', '事業順利', '學業進步', '消災解厄', '財運亨通', '出入平安', '婚姻美滿'],
    zodiacRules: { '羊': '丁未年合（坐）太歲，須點燈', '牛': '丁未年沖太歲，須點燈' },
    guaRules: (function () {
      var r = {}, set = function (names, why) { names.split(' ').forEach(function (n) { r[n] = why; }); };
      set('兌為澤 風澤中孚 火雷噬嗑 雷地豫 風地觀', '本命世爻未土坐太歲，需誦經及點燈');
      set('雷澤歸妹 山澤損 風火家人 地火明夷 天風姤 地風升', '本命世爻丑土沖太歲，需誦經及點燈');
      set('天火同人 水火既濟 地雷復 地山謙', '命卦忌神丑土沖太歲尅世爻，需誦經及點燈');
      set('風天小畜 澤火革 澤風大過 火風鼎 坎為水 山地剝', '命卦忌神未土逢值尅世爻，需誦經及點燈');
      set('天澤履 火澤睽 雷火豐 雷風恒 山風蠱 坤為地', '本命元神丑土（元神破），需誦經及點燈');
      return r;
    })()
  };
  var JSON_KEYS = ['lamps', 'wishes', 'zodiacRules', 'guaRules'];
  var PUBLIC_SETTING_KEYS = ['orgName', 'year', 'ganzhi', 'title', 'status', 'regDeadline', 'payNote', 'bankName', 'bankCode', 'bankBranch',
    'bankAccount', 'bankHolder', 'contactPhone', 'contactMobile', 'lineUrl', 'privacy', 'leapRule', 'lamps', 'wishes', 'zodiacRules', 'guaRules'];

  /* ================= 工具 ================= */
  function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function digits(v) { return str(v).replace(/\D/g, ''); }
  function num(v) { var n = Number(String(v || '').replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function lampOf(s, code) { return (s.lamps || []).filter(function (l) { return l.code === code; })[0]; }
  function lampByName(s, name) { return (s.lamps || []).filter(function (l) { return l.name === name || l.code === name; })[0]; }
  function curYear(s) { return str(s.year); }
  function activeOrders(db, year) { return db.orders.filter(function (o) { return o.year === year && o.status !== '取消'; }); }

  function used(db, year, code) {
    var ok = {};
    activeOrders(db, year).forEach(function (o) { ok[o.id] = 1; });
    return db.items.filter(function (it) { return it.lamp === code && ok[it.orderId]; }).length;
  }
  function lampsWithStock(db, s) {
    var y = curYear(s);
    return (s.lamps || []).map(function (l) {
      var c = clone(l), q = num(l.quota);
      c.used = used(db, y, l.code);
      c.left = q > 0 ? Math.max(0, q - c.used) : null;
      return c;
    });
  }
  function isOpen(s, env) {
    if (s.status !== '開放登記') return false;
    if (s.regDeadline && env.today() > s.regDeadline) return false;
    return true;
  }
  function itemsOf(db, orderId) { return db.items.filter(function (it) { return it.orderId === orderId; }); }
  function summary(db, o, s) {
    var its = itemsOf(db, o.id), cnt = {};
    its.forEach(function (it) { cnt[it.lamp] = (cnt[it.lamp] || 0) + 1; });
    return (s.lamps || []).filter(function (l) { return cnt[l.code]; }).map(function (l) { return l.name + ' ' + cnt[l.code]; }).join('、');
  }
  function publicSettings(s) { var o = {}; PUBLIC_SETTING_KEYS.forEach(function (k) { o[k] = s[k]; }); return o; }
  function nextOrderId(db, year) {
    var max = 0;
    db.orders.forEach(function (o) { if (o.year === year) max = Math.max(max, num(String(o.id).split('-').pop())); });
    return year + '-' + ('000' + (max + 1)).slice(-4);
  }
  function nextItemId(db, orderId, n) { return orderId + '-' + ('0' + n).slice(-2); }
  function matchContact(o, name, phone) {
    var p = digits(phone);
    return p.length >= 8 && digits(o.phone) === p && (!name || str(o.contactName) === str(name));
  }

  /** 檢查並整理一張單的明細，回傳 {items, total} 或 {error} */
  function buildItems(input, s, orderId, year, address) {
    var out = [], total = 0, n = 0;
    var list = Array.isArray(input) ? input : [];
    for (var i = 0; i < list.length; i++) {
      var x = list[i] || {}, lamp = lampOf(s, x.lamp);
      if (!lamp) return { error: '燈種「' + str(x.lamp) + '」不存在' };
      if (!str(x.name)) return { error: lamp.name + '請填寫姓名' };
      var adv = advise(x, s);
      n++;
      var it = {
        id: nextItemId(null, orderId, n), orderId: orderId, year: year, lamp: lamp.code, price: String(num(lamp.price)),
        name: str(x.name), gender: str(x.gender), birthY: digits(x.birthY), birthM: digits(x.birthM), birthD: digits(x.birthD),
        leap: x.leap === true || x.leap === '是' ? '是' : '', zodiac: adv.zodiac, gua: adv.gua, advice: adv.reasons.join('；'),
        wish: str(x.wish), takeBack: lamp.code === 'xiaozai' ? (str(x.takeBack) || '不取回') : '',
        male: lamp.unit === '戶' ? String(num(x.male) || '') : '', female: lamp.unit === '戶' ? String(num(x.female) || '') : '',
        family: lamp.unit === '戶' ? str(x.family) : '', address: str(x.address) || address, note: str(x.note)
      };
      total += num(lamp.price);
      out.push(it);
    }
    return { items: out, total: total };
  }

  function checkQuota(db, s, year, newItems, excludeOrderId) {
    var add = {};
    newItems.forEach(function (it) { add[it.lamp] = (add[it.lamp] || 0) + 1; });
    for (var code in add) {
      var l = lampOf(s, code), q = num(l && l.quota);
      if (!q) continue;
      var u = used(db, year, code);
      if (excludeOrderId) u -= itemsOf(db, excludeOrderId).filter(function (it) { return it.lamp === code; }).length;
      if (u + add[code] > q) {
        var left = Math.max(0, q - u);
        return l.name + '名額只剩 ' + left + ' 盞，請減少數量或改點其他燈';
      }
    }
    return '';
  }

  /* ================= 主程式 ================= */
  function handle(req, db, env) {
    var s = db.settings, a = req.action, y = curYear(s);
    var isStaff = req.token ? env.checkToken(req.token) : false;

    /* ---------- 公開 ---------- */
    if (a === 'init') {
      return { ok: true, settings: publicSettings(s), lamps: lampsWithStock(db, s), open: isOpen(s, env), today: env.today(), staff: isStaff };
    }

    if (a === 'lookupPrev') {
      // 用 聯絡人姓名＋手機 找「去年（或以前最近一年）」的點燈單，帶回明細
      var name = str(req.name), phone = req.phone;
      if (!name || digits(phone).length < 8) return { ok: false, msg: '請填寫姓名和電話' };
      var mine = db.orders.filter(function (o) { return o.status !== '取消' && matchContact(o, name, phone); });
      var thisYear = mine.filter(function (o) { return o.year === y; }).map(function (o) { return { id: o.id, total: o.total, payStatus: o.payStatus, summary: summary(db, o, s) }; });
      var prev = mine.filter(function (o) { return num(o.year) < num(y); }).sort(function (p, q) { return num(q.year) - num(p.year) || (q.id > p.id ? 1 : -1); });
      if (!prev.length) return { ok: true, found: false, thisYear: thisYear };
      var py = prev[0].year, orders = prev.filter(function (o) { return o.year === py; });
      var its = [];
      orders.forEach(function (o) { itemsOf(db, o.id).forEach(function (it) { its.push(it); }); });
      return {
        ok: true, found: true, year: py, thisYear: thisYear, address: orders[0].address, zip: orders[0].zip,
        items: its.map(function (it) {
          return { lamp: it.lamp, name: it.name, gender: it.gender, birthY: it.birthY, birthM: it.birthM, birthD: it.birthD, leap: it.leap === '是',
            wish: it.wish, takeBack: it.takeBack, male: it.male, female: it.female, family: it.family };
        })
      };
    }

    if (a === 'submit') {
      if (!isStaff && !isOpen(s, env)) return { ok: false, msg: '目前沒有開放線上登記，請來電洽詢' };
      var o = req.order || {};
      if (!str(o.contactName)) return { ok: false, msg: '請填寫聯絡人姓名' };
      if (digits(o.phone).length < 8) return { ok: false, msg: '請填寫正確的聯絡電話' };
      var year = isStaff && req.year ? str(req.year) : y;
      var id = nextOrderId(db, year);
      var b = buildItems(req.items, s, id, year, str(o.address));
      if (b.error) return { ok: false, msg: b.error };
      if (!b.items.length) return { ok: false, msg: '請至少選一盞燈' };
      if (year === y) { var qe = checkQuota(db, s, year, b.items); if (qe) return { ok: false, msg: qe }; }
      var t = env.now();
      db.orders.push({
        id: id, year: year, createdAt: t, status: '有效', source: isStaff ? (req.source || '後台代登') : '線上登記',
        contactName: str(o.contactName), phone: str(o.phone), zip: digits(o.zip), address: str(o.address), total: String(b.total),
        payStatus: PAY.WAIT, payMethod: '', payDate: '', payAmount: '', payLast5: '', payProof: '', payReportedAt: '', payCheckedAt: '',
        userNote: str(o.userNote), adminNote: str(o.adminNote), updatedAt: t
      });
      b.items.forEach(function (it) { db.items.push(it); });
      db.dirty.orders = db.dirty.items = true;
      return { ok: true, id: id, total: b.total };
    }

    if (a === 'query') {
      var ph = req.phone, list;
      if (digits(ph).length < 8) return { ok: false, msg: '請輸入登記時留的電話' };
      if (str(req.id)) list = db.orders.filter(function (o) { return o.id === str(req.id).toUpperCase() && digits(o.phone) === digits(ph); });
      else list = db.orders.filter(function (o) { return matchContact(o, req.name, ph); });
      list = list.filter(function (o) { return o.status !== '取消'; }).sort(function (p, q) { return p.id < q.id ? 1 : -1; });
      if (!list.length) return { ok: false, msg: '查不到資料，請確認單號（或姓名）和電話是否正確' };
      return {
        ok: true, orders: list.slice(0, 10).map(function (o) {
          var c = clone(o); delete c.adminNote; c.hasProof = !!o.payProof; delete c.payProof;
          c.items = itemsOf(db, o.id).map(function (it) { return { lamp: it.lamp, name: it.name, wish: it.wish, price: it.price, takeBack: it.takeBack, male: it.male, female: it.female, family: it.family }; });
          return c;
        })
      };
    }

    if (a === 'report') {
      var od = db.orders.filter(function (o) { return o.id === str(req.id) && digits(o.phone) === digits(req.phone); })[0];
      if (!od) return { ok: false, msg: '查不到這張點燈單' };
      if (od.payStatus === PAY.OK) return { ok: false, msg: '這張單已經核對完成，不需要再回報' };
      if (req.method === '現金') {
        od.payMethod = '現場繳現金'; od.payStatus = PAY.CASH;
      } else {
        if (!/^\d{5}$/.test(digits(req.last5))) return { ok: false, msg: '帳號後五碼請填 5 個數字' };
        od.payMethod = req.method === '代轉' ? '家人代轉' : '轉帳';
        od.payDate = str(req.date); od.payAmount = String(num(req.amount) || num(od.total)); od.payLast5 = digits(req.last5);
        if (req.proof) od.payProof = env.saveFile(req.proof, od.id + '_轉帳');
        od.payStatus = PAY.REPORTED;
      }
      od.payReportedAt = od.updatedAt = env.now();
      db.dirty.orders = true;
      return { ok: true, payStatus: od.payStatus };
    }

    if (a === 'login') {
      var tk = env.login(req.password);
      return tk ? { ok: true, token: tk } : { ok: false, msg: env.loginMsg() || '密碼不正確' };
    }

    /* ---------- 後台 ---------- */
    if (!isStaff) return { ok: false, auth: false, msg: '登入逾時，請重新登入' };

    switch (a) {
      case 'adminData': {
        var yy = str(req.year) || y;
        var ords = db.orders.filter(function (o) { return o.year === yy; });
        var ids = {}; ords.forEach(function (o) { ids[o.id] = 1; });
        var years = {}; db.orders.forEach(function (o) { years[o.year] = 1; }); years[y] = 1;
        return {
          ok: true, settings: s, lamps: lampsWithStock(db, s), year: yy,
          years: Object.keys(years).sort().reverse(),
          orders: ords, items: db.items.filter(function (it) { return ids[it.orderId]; })
        };
      }
      case 'saveOrder': {
        var or = db.orders.filter(function (o) { return o.id === req.id; })[0];
        if (!or) return { ok: false, msg: '找不到點燈單' };
        var f = req.fields || {};
        ['status', 'contactName', 'phone', 'zip', 'address', 'payStatus', 'payMethod', 'payDate', 'payAmount', 'payLast5', 'userNote', 'adminNote']
          .forEach(function (k) { if (f[k] !== undefined) or[k] = str(f[k]); });
        if (f.payStatus === PAY.OK && !or.payCheckedAt) or.payCheckedAt = env.now();
        if (f.payStatus && f.payStatus !== PAY.OK) or.payCheckedAt = '';
        if (req.items) {
          var bi = buildItems(req.items, s, or.id, or.year, or.address);
          if (bi.error) return { ok: false, msg: bi.error };
          if (or.year === y && or.status !== '取消') { var q2 = checkQuota(db, s, or.year, bi.items, or.id); if (q2) return { ok: false, msg: q2 }; }
          db.items = db.items.filter(function (it) { return it.orderId !== or.id; }).concat(bi.items);
          or.total = String(bi.total);
          db.dirty.items = true;
        }
        or.updatedAt = env.now();
        db.dirty.orders = true;
        return { ok: true };
      }
      case 'checkPay': {
        var t2 = env.now(), n2 = 0;
        (req.ids || []).forEach(function (id) {
          var x = db.orders.filter(function (o) { return o.id === id; })[0];
          if (x) { x.payStatus = PAY.OK; x.payCheckedAt = t2; x.updatedAt = t2; n2++; }
        });
        db.dirty.orders = true;
        return { ok: true, count: n2 };
      }
      case 'deleteOrder':
        db.orders = db.orders.filter(function (o) { return o.id !== req.id; });
        db.items = db.items.filter(function (it) { return it.orderId !== req.id; });
        db.dirty.orders = db.dirty.items = true;
        return { ok: true };
      case 'getFile': return env.getFile(req.fileId);
      case 'saveSettings': {
        var ns = req.settings || {};
        Object.keys(DEFAULT_SETTINGS).forEach(function (k) { if (ns[k] !== undefined) s[k] = ns[k]; });
        db.dirty.settings = true;
        return { ok: true };
      }
      case 'changePassword': return env.changePassword(req.oldPw, req.newPw);
      case 'logout': env.logout(req.token); return { ok: true };
      case 'importRows': return importRows(req.rows || [], db, s, env, !!req.dryRun);
    }
    return { ok: false, msg: '未知的操作' };
  }

  /* ================= Excel 匯入 ================= */
  // rows：Excel「點燈名單」工作表每一列（已轉成物件，鍵為中文欄名）
  var IMPORT_HEAD = ['年度', '單號', '聯絡人', '聯絡電話', '地址', '燈種', '姓名', '性別', '農曆生年(民國)', '農曆生月', '農曆生日', '閏月',
    '祈求事項', '全戶男(丁)', '全戶女(口)', '本戶眷屬姓名', '消災燈取回', '繳費狀態', '備註'];

  function importRows(rows, db, s, env, dryRun) {
    var groups = {}, order = [], errs = [];
    rows.forEach(function (r, i) {
      var line = i + 2;   // Excel 列號（第 1 列是標題）
      var get = function (k) { return str(r[k]); };
      if (!get('姓名') && !get('燈種')) return;           // 空白列
      var year = digits(get('年度')), key = get('單號') || ('#' + line);
      var lamp = lampByName(s, get('燈種'));
      if (!year) errs.push('第 ' + line + ' 列：沒有填年度');
      if (!lamp) errs.push('第 ' + line + ' 列：燈種「' + get('燈種') + '」不認得');
      if (!get('姓名')) errs.push('第 ' + line + ' 列：沒有姓名');
      var gk = year + '|' + key;
      if (!groups[gk]) { groups[gk] = { year: year, contactName: get('聯絡人') || get('姓名'), phone: get('聯絡電話'), address: get('地址'), pay: get('繳費狀態'), items: [] }; order.push(gk); }
      var g = groups[gk];
      if (!g.phone && get('聯絡電話')) g.phone = get('聯絡電話');
      if (!g.address && get('地址')) g.address = get('地址');
      g.items.push({ lamp: lamp ? lamp.code : '', name: get('姓名'), gender: get('性別'), birthY: get('農曆生年(民國)'), birthM: get('農曆生月'),
        birthD: get('農曆生日'), leap: get('閏月') === '是', wish: get('祈求事項'), male: get('全戶男(丁)'), female: get('全戶女(口)'),
        family: get('本戶眷屬姓名'), takeBack: get('消災燈取回'), note: get('備註') });
    });
    if (errs.length) return { ok: false, msg: '有 ' + errs.length + ' 個地方要修正', errors: errs.slice(0, 50) };
    if (dryRun) return { ok: true, dryRun: true, orders: order.length, items: order.reduce(function (n, k) { return n + groups[k].items.length; }, 0) };
    var t = env.now(), made = 0;
    order.forEach(function (gk) {
      var g = groups[gk], id = nextOrderId(db, g.year);
      var b = buildItems(g.items, s, id, g.year, g.address);
      if (b.error) return;
      db.orders.push({ id: id, year: g.year, createdAt: t, status: '有效', source: 'Excel匯入', contactName: g.contactName, phone: g.phone, zip: '',
        address: g.address, total: String(b.total), payStatus: g.pay || PAY.OK, payMethod: '', payDate: '', payAmount: '', payLast5: '', payProof: '',
        payReportedAt: '', payCheckedAt: '', userNote: '', adminNote: '', updatedAt: t });
      b.items.forEach(function (it) { db.items.push(it); });
      made++;
    });
    db.dirty.orders = db.dirty.items = true;
    return { ok: true, orders: made };
  }

  /* ================= 設定讀寫輔助 ================= */
  function parseSettings(kv) {
    var s = clone(DEFAULT_SETTINGS);
    Object.keys(kv || {}).forEach(function (k) {
      if (!(k in DEFAULT_SETTINGS)) return;
      var v = kv[k];
      if (JSON_KEYS.indexOf(k) >= 0 && typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return; } }
      s[k] = v;
    });
    return s;
  }
  function settingsToKv(s) {
    var kv = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) { kv[k] = JSON_KEYS.indexOf(k) >= 0 ? JSON.stringify(s[k]) : str(s[k]); });
    return kv;
  }

  return {
    handle: handle, gua: gua, zodiac: zodiac, advise: advise, branchOfZodiac: branchOfZodiac,
    TRI: TRI, TRI_IMG: TRI_IMG, GUA: GUA, ZODIAC: ZODIAC, ORDER_COLS: ORDER_COLS, ITEM_COLS: ITEM_COLS, PAY: PAY,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS, IMPORT_HEAD: IMPORT_HEAD, parseSettings: parseSettings, settingsToKv: settingsToKv
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LampCore;
if (typeof window !== 'undefined') window.LampCore = LampCore;
