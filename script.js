/* 高嶺のなでしこ 好き曲ソート — 動作(JavaScript)
   ・GoatCounterのコードは、下の GOATCOUNTER_CODE で設定します
   ・曲データは songs.json、デザインは style.css にあります */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const KEY = 'takaneko-sort-v2';

  /* ---------- アクセス解析(GoatCounter) ----------
     GoatCounterで登録したコード( https://【ここ】.goatcounter.com の部分 )を入れると有効になります。
     空のままなら、解析用のスクリプトは読み込まれず、何も送信されません。 */
  const GOATCOUNTER_CODE = 'shufflen';
  if (GOATCOUNTER_CODE) {
    const sc = document.createElement('script');
    sc.async = true;
    sc.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
    sc.src = 'https://gc.zgo.at/count.js';
    document.head.appendChild(sc);
    $('#analyticsNote').hidden = false;
  }
  // 画像を保存/コピーした直後に「次はXで投稿」と案内する
  const X_LABEL = '\u{1D54F} で投稿（テキストのみ）';
  function resetShareUi() {
    $('#nextStep').hidden = true;
    $('#x-share').textContent = X_LABEL;
  }
  function showNext(kind) {
    $('#nextStep').textContent = kind === 'save'
      ? '画像を保存しました。次は、下のボタンでXの投稿画面を開き、保存した画像を添付してください。'
      : '画像をコピーしました。次は、下のボタンでXの投稿画面を開き、投稿欄に貼り付けてください（パソコン: Ctrl+V / スマホ: 長押し→ペースト）。';
    $('#nextStep').hidden = false;
    $('#x-share').textContent = '\u{1D54F} で投稿画面を開く（文章つき）';
  }
  // 操作の回数を数える(path がイベント名になる。先頭に / は付けない)
  const track = (name, title) => {
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, title: title, event: true }); } catch (e) {}
  };
  const LEAGUE_SIZE = 10;     // 決勝リーグの対象(上位何曲を見直すか)
  const LEAGUE_MAX_PASS = 3;  // 見直しの最大周回数

  let items = [], itemById = new Map();
  let selected = new Set();
  let allTypes = [];            // songs.json の type の一覧(出てきた順)
  let filterMode = 'all';       // 'all'=すべて / 'types'=種類で絞り込み / 'custom'=手動で調整
  let activeTypes = new Set();  // 絞り込みに使っている種類
  let session = null;   // { order:[id], choices:['l'|'r'|'t'|'s'] }
  let sorter = null;

  /* ================= 並べ替えエンジン =================
     状態は「最初の並び + これまでの選択履歴」だけで毎回再現(replay)する。
     → 途中保存・再開・やり直しが同じ仕組みで安全に動く。
     phase: merge(マージソート) → verify(決勝リーグ) → done */
  function makeSorter(order) {
    return { phase: 'merge', lists: order.map(id => [id]), cur: null, ties: new Set(),
             done: 0, n: order.length, v: null, result: null, pair: null };
  }
  function mergeNext(s) {
    for (;;) {
      if (!s.cur) {
        if (s.lists.length <= 1) return null;
        s.cur = { a: s.lists.shift(), b: s.lists.shift(), i: 0, j: 0, out: [] };
      }
      const c = s.cur;
      if (c.i >= c.a.length || c.j >= c.b.length) {
        s.lists.push(c.out.concat(c.a.slice(c.i), c.b.slice(c.j)));
        s.cur = null; continue;
      }
      return [c.a[c.i], c.b[c.j]];
    }
  }
  function next(s) {
    if (s.phase === 'merge') {
      const p = mergeNext(s);
      if (p) { s.pair = p; return; }
      const list = s.lists[0] || [];
      if (list.length >= 3) {
        s.phase = 'verify';
        s.v = { list: list.slice(), i: 0, swapped: false, pass: 1, k: Math.min(LEAGUE_SIZE, list.length) };
      } else { s.phase = 'done'; s.result = list; s.pair = null; return; }
    }
    if (s.phase === 'verify') {
      s.pair = [s.v.list[s.v.i], s.v.list[s.v.i + 1]];
    }
  }
  function apply(s, ch) {
    if (s.phase === 'merge') {
      const c = s.cur;
      if (ch === 'l') c.out.push(c.a[c.i++]);
      else if (ch === 'r') c.out.push(c.b[c.j++]);
      else if (ch === 't') { s.ties.add(c.a[c.i] + '|' + c.b[c.j]); c.out.push(c.a[c.i++], c.b[c.j++]); }
      s.done++;
    } else if (s.phase === 'verify') {
      const v = s.v;
      if (ch === 's') { s.phase = 'done'; s.result = v.list; s.pair = null; return; }
      if (ch === 'r') { [v.list[v.i], v.list[v.i + 1]] = [v.list[v.i + 1], v.list[v.i]]; v.swapped = true; }
      else if (ch === 't') s.ties.add(v.list[v.i] + '|' + v.list[v.i + 1]);
      v.i++;
      if (v.i >= v.k - 1) {
        if (v.swapped && v.pass < LEAGUE_MAX_PASS) { v.pass++; v.i = 0; v.swapped = false; }
        else { s.phase = 'done'; s.result = v.list; s.pair = null; }
      }
    }
  }
  function replay(order, choices) {
    const s = makeSorter(order);
    next(s);
    for (const ch of choices) {
      if (s.phase === 'done' || !s.pair) break;
      apply(s, ch);
      if (s.phase !== 'done') next(s);
    }
    return s;
  }
  const estimate = n => Math.max(1, Math.round(n * Math.log2(n) - n + 1));

  /* ================= 保存 ================= */
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(session)); } catch (e) {} };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const clear = () => { try { localStorage.removeItem(KEY); } catch (e) {} };

  /* ================= 画面 ================= */
  const show = id => ['setup-area', 'sort-area', 'result-area'].forEach(x => $('#' + x).hidden = (x !== id));
  function setImg(img, url, onFail) {
    const fallback = url.includes('maxresdefault') ? url.replace('maxresdefault', 'hqdefault') : null;
    img.onerror = () => {
      img.onerror = null; img.onload = null;
      if (fallback) { img.onerror = () => { img.onerror = null; if (onFail) onFail(); }; img.src = fallback; }
      else if (onFail) onFail();
    };
    // maxresdefault が無い動画は、404でも幅120pxの代替画像が返ってくるため、幅でも判定する
    img.onload = () => { if (fallback && img.naturalWidth <= 120) { img.onload = null; img.src = fallback; } };
    img.src = url;
  }
  // サムネイル: 画像があれば画像、無い(または読み込めない)ときは曲名の代替表示
  function fillThumb(box, song, lazy) {
    box.replaceChildren();
    const showText = () => {
      box.replaceChildren();
      const ph = document.createElement('span');
      ph.className = 'ph'; ph.textContent = song.title;
      box.appendChild(ph);
    };
    if (!song.image) return showText();
    const img = document.createElement('img');
    img.alt = ''; if (lazy) img.loading = 'lazy';
    box.appendChild(img);
    setImg(img, song.image, showText);
  }
  function thumbNode(song, cls, lazy) {
    const box = document.createElement('div');
    box.className = 'thumb' + (cls ? ' ' + cls : '');
    fillThumb(box, song, lazy);
    return box;
  }

  /* ---------- 曲の絞り込み(種類) ---------- */
  const baseSongs = () => activeTypes.size ? items.filter(it => it.types.some(t => activeTypes.has(t))) : items;
  function applyFilter() {
    selected = new Set((filterMode === 'types' ? baseSongs() : items).map(i => i.id));
  }
  function chip(label, count, pressed, onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.setAttribute('aria-pressed', pressed);
    b.textContent = label;
    if (count != null) { const sm = document.createElement('small'); sm.textContent = count + '曲'; b.appendChild(sm); }
    b.onclick = onClick;
    return b;
  }
  function renderFilters() {
    // 種類で絞り込む(songs.json に type がある場合だけ表示)
    $('#typeFilter').hidden = allTypes.length === 0;
    if (allTypes.length) {
      const count = t => items.filter(it => it.types.includes(t)).length;
      $('#typeChips').replaceChildren(
        chip('すべて', items.length, filterMode === 'all', () => {
          filterMode = 'all'; activeTypes = new Set(); applyFilter(); renderSetup();
        }),
        ...allTypes.map(t => chip(t, count(t), filterMode === 'types' && activeTypes.has(t), () => {
          if (filterMode !== 'types') activeTypes = new Set();   // 最初のタップは「その種類のみ」にする
          activeTypes.has(t) ? activeTypes.delete(t) : activeTypes.add(t);
          filterMode = activeTypes.size ? 'types' : 'all';
          applyFilter(); renderSetup();
        }))
      );
    }
  }

  function renderSetup() {
    const saved = load();
    $('#resumeBox').hidden = !(saved && Array.isArray(saved.order) && saved.order.every(id => itemById.has(id)));
    const listEl = $('#songList'), listTop = listEl.scrollTop;
    listEl.replaceChildren(...items.map(it => {
      const row = document.createElement('div');
      row.className = 'song-row'; row.setAttribute('role', 'option'); row.tabIndex = 0;
      row.setAttribute('aria-checked', selected.has(it.id));
      const box = document.createElement('span'); box.className = 'box';
      const img = thumbNode(it, null, true);
      const t = document.createElement('span'); t.className = 't'; t.textContent = it.title;
      if (it.types.length) { const sm = document.createElement('small'); sm.textContent = it.types.join('・'); t.appendChild(sm); }
      row.append(box, img, t);
      const flip = () => { selected.has(it.id) ? selected.delete(it.id) : selected.add(it.id); filterMode = 'custom'; renderSetup(); };
      row.onclick = flip;
      row.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } };
      return row;
    }));
    $('#selCount').textContent = `選択中 ${selected.size}曲（${selected.size >= 2 ? `バトルは約${estimate(selected.size)}回＋決勝リーグ` : '2曲以上選んでください'}）`;
    $('#startBtn').disabled = selected.size < 2;
    renderFilters();
    show('setup-area');
    listEl.scrollTop = listTop;
  }

  function renderBattle() {
    if (sorter.phase === 'done') return renderResult();
    show('sort-area');
    const [l, r] = sorter.pair.map(id => itemById.get(id));
    $('#left-title').textContent = l.title;  fillThumb($('#left-img'), l);
    $('#right-title').textContent = r.title; fillThumb($('#right-img'), r);
    const verifying = sorter.phase === 'verify';
    $('#leagueTag').hidden = !verifying;
    $('#btnSkip').hidden = !verifying;
    if (verifying) {
      const v = sorter.v;
      $('#progress').style.width = '100%';
      $('#status').textContent = `決勝リーグ ${v.pass}周目：${v.i + 1} / ${v.k - 1}（並びが変わると再確認します）`;
    } else {
      const pct = Math.min(99, Math.floor(sorter.done / estimate(sorter.n) * 100));
      $('#progress').style.width = pct + '%';
      $('#status').textContent = `進捗: 約 ${pct}%`;
    }
    $('#btnUndo').disabled = session.choices.length === 0;
  }

  function choose(ch) {
    if (!sorter || sorter.phase === 'done' || !sorter.pair) return;
    session.choices.push(ch);
    apply(sorter, ch);
    if (sorter.phase !== 'done') next(sorter);
    save();
    renderBattle();
  }
  function undo() {
    if (!session || !session.choices.length) return;
    session.choices.pop();
    sorter = replay(session.order, session.choices);
    save();
    renderBattle();
  }

  function renderResult() {
    show('result-area');
    clear();
    resetShareUi();
    window.scrollTo(0, 0);
    track('sort-complete', 'ソート完了(結果表示)');
    const list = sorter.result;
    const body = $('#result-list');
    body.replaceChildren();
    const rows = [];
    let rank = 0;
    list.forEach((id, idx) => {
      const prev = list[idx - 1];
      const tied = prev !== undefined && (sorter.ties.has(prev + '|' + id) || sorter.ties.has(id + '|' + prev));
      if (!tied) rank = idx + 1;
      rows.push({ rank, song: itemById.get(id) });
    });
    rows.forEach(({ rank, song }) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      if (rank <= 3) td1.className = 'rank-' + rank;
      const badge = document.createElement('span'); badge.className = 'rank-badge'; badge.textContent = rank + '位';
      td1.appendChild(badge);
      const td2 = document.createElement('td');
      const wrap = document.createElement('div'); wrap.className = 'result-item';
      const img = thumbNode(song, 'result-thumb');
      const name = document.createElement('span'); name.className = 'result-title'; name.textContent = song.title;
      wrap.append(img, name); td2.appendChild(wrap);
      tr.append(td1, td2); body.appendChild(tr);
    });
    const top = rows.filter(r => r.rank <= 5).map(r => `${r.rank}位: ${r.song.title}`).join('\n');
    const text = `【高嶺のなでしこ 好き曲ソート結果】\n${top}`;
    $('#x-share').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) +
      '&hashtags=' + encodeURIComponent('高嶺のなでしこ,たかねこ好き曲ソート') +
      '&url=' + encodeURIComponent(location.href);
    shareTextForImg = text + '\n#高嶺のなでしこ #たかねこ好き曲ソート';
    buildShareImage(rows);
  }

  /* ================= 結果画像(Canvasで作成) ================= */
  const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif';
  let imgBlob = null, imgObjUrl = null, imgToken = 0, shareTextForImg = '';

  // CORS付きでサムネを読み込む(maxresが無ければhqdefaultへ)。失敗時はnull
  function loadThumb(url) {
    if (!url) return Promise.resolve(null);
    return new Promise(resolve => {
      const attempt = (u, fb) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => { (fb && im.naturalWidth <= 120) ? attempt(fb, null) : resolve(im); };
        im.onerror = () => { fb ? attempt(fb, null) : resolve(null); };
        im.src = u + (u.includes('?') ? '&' : '?') + 'c=1';   // 通常表示のキャッシュ(CORSなし)を避ける
      };
      attempt(url, url.includes('maxresdefault') ? url.replace('maxresdefault', 'hqdefault') : null);
    });
  }
  function rrPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function fitText(c, text, size, min, maxW) {
    let s = size;
    c.font = `bold ${s}px ${FONT}`;
    while (c.measureText(text).width > maxW && s > min) { s -= 2; c.font = `bold ${s}px ${FONT}`; }
    if (c.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  // 文字を枠の幅で折り返す(日本語は1文字ずつ、英語はスペースで区切れる範囲で)
  function wrapText(c, text, maxW) {
    const lines = [];
    let line = '';
    for (const ch of text) {
      if (c.measureText(line + ch).width > maxW && line) {
        const sp = line.lastIndexOf(' ');
        if (sp > 0 && ch !== ' ') { lines.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
        else { lines.push(line); line = ch === ' ' ? '' : ch; }
      } else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  }
  // サムネイルが読み込めなかった曲の代替表示: クリーム色の濃淡グラデーション + 曲名
  function drawPlaceholder(c, title, x, y, w, h) {
    const g = c.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#f9f4ea');
    g.addColorStop(.5, '#eee3d0');
    g.addColorStop(1, '#dccbb0');
    c.fillStyle = g; c.fillRect(x, y, w, h);

    const big = w > 200, pad = big ? 10 : 8, maxLines = big ? 4 : 3;
    const maxW = w - pad * 2;
    // 文字サイズ: 全角10文字がちょうど1行に収まる大きさ(10文字までの曲名は1行表示になる)
    let size = Math.floor(maxW / 10), min = big ? 18 : 12, lines;
    c.font = `bold ${size}px ${FONT}`;
    while (size > min && c.measureText('あ'.repeat(10)).width > maxW) { size -= 1; c.font = `bold ${size}px ${FONT}`; }
    for (;;) {
      c.font = `bold ${size}px ${FONT}`;
      lines = wrapText(c, title, maxW);
      if ((lines.length <= maxLines && lines.length * size * 1.3 <= h - pad) || size <= min) break;
      size -= 1;
    }
    if (lines.length > maxLines) {                     // 最小サイズでも入りきらないときは末尾を省略
      lines = lines.slice(0, maxLines);
      let last = lines[maxLines - 1];
      while (last.length > 1 && c.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    const lh = size * 1.3;
    c.fillStyle = '#5a4a4e'; c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach((t, i) => c.fillText(t, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * lh));
  }
  function drawThumb(c, im, x, y, w, h, r, title) {
    c.save();
    rrPath(c, x, y, w, h, r); c.clip();
    if (im) {
      const ar = w / h;
      let sw = im.naturalWidth, sh = sw / ar;
      if (sh > im.naturalHeight) { sh = im.naturalHeight; sw = sh * ar; }
      c.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
    } else {
      drawPlaceholder(c, title, x, y, w, h);
    }
    c.restore();
  }
  // 結果画像の配色。style.css の変数(--c-*)から取得し、取れなければ既定値を使う
  // 並び順は style.css の --rainbow と同じ(ホワイト→水色→オレンジ→薄いピンク→濃いピンク→ブルー→紫→イエロー)
  const MEMBER_ORDER = [
    ['white', '#efe9dc'], ['sky', '#45bdee'], ['orange', '#f28c1e'], ['pink', '#f6a9c9'],
    ['magenta', '#e4007f'], ['blue', '#2468d6'], ['purple', '#a64ca6'], ['yellow', '#f6d600']
  ];
  function drawResultCanvas(rows, thumbs) {
    const W = 1080, X = 64, R = W - 64;
    const HEAD = 370, FIRST = 230, ROW = 104, GAP = 14, FOOT = 150;
    const WINE = '#8f1d3c', INK = '#3f3a38', SUB = '#7a716c', DARK = '#5a4a4e';
    const n = rows.length;
    const H = HEAD + FIRST + (n - 1) * (ROW + GAP) + FOOT;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');

    const st = getComputedStyle(document.documentElement);
    const pal = {};
    MEMBER_ORDER.forEach(([k, d]) => { pal[k] = st.getPropertyValue('--c-' + k).trim() || d; });
    const stripe = MEMBER_ORDER.map(([k]) => pal[k]);

    // 背景: 空の青 → クリーム + チェック柄(ページと同じ)
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#7ec3de'); bg.addColorStop(.28, '#cfe8f0'); bg.addColorStop(.6, '#f4ecdd'); bg.addColorStop(1, '#f4ecdd');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(143,29,60,.06)';
    for (let gx = 0; gx < W; gx += 68) c.fillRect(gx, 0, 3, H);
    for (let gy = 0; gy < H; gy += 68) c.fillRect(0, gy, W, 3);

    // カード + 上端の8色ストライプ
    c.save();
    c.shadowColor = 'rgba(27,100,140,.28)'; c.shadowBlur = 40; c.shadowOffsetY = 14;
    rrPath(c, 36, 36, W - 72, H - 72, 44);
    c.fillStyle = '#fffdf8'; c.fill();
    c.restore();
    c.save();
    rrPath(c, 36, 36, W - 72, H - 72, 44); c.clip();
    const seg = (W - 72) / stripe.length;
    stripe.forEach((col, i) => { c.fillStyle = col; c.fillRect(36 + i * seg, 36, seg + 1, 18); });
    c.restore();

    // 見出し
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = SUB; c.font = `bold 34px ${FONT}`;
    c.fillText('あなたの', W / 2, 124);
    c.fillStyle = WINE; c.font = `bold 68px ${FONT}`;
    c.fillText('高嶺のなでしこ', W / 2, 208);
    c.fillText(`好きな曲 TOP${n}`, W / 2, 291);
    c.fillStyle = SUB; c.font = `28px ${FONT}`;
    c.fillText('楽曲ソートの結果', W / 2, 336);

    // 順位バッジの配色(1〜3位は専用、4位以降はメンバーカラーを順に使う)
    const cycle = [
      [pal.pink, DARK], [pal.magenta, '#fff'], [pal.blue, '#fff'], [pal.purple, '#fff'],
      [pal.yellow, DARK], [pal.sky, DARK], [pal.orange, '#fff']
    ];
    const badgeFor = rank => {
      if (rank === 1) return { bg: '#ffe45c', fg: '#7a5b00', ring: pal.yellow };
      if (rank === 2) return { bg: '#d6e8f1', fg: '#2f5568', ring: pal.sky };
      if (rank === 3) return { bg: '#fbd0a6', fg: '#a4520c', ring: pal.orange };
      const [col, fg] = cycle[(rank - 4) % cycle.length];
      return { bg: col, fg, ring: col };
    };

    rows.forEach((row, i) => {
      const first = i === 0;
      const b = badgeFor(row.rank);
      const y = first ? HEAD : HEAD + FIRST + GAP + (i - 1) * (ROW + GAP);
      const h = first ? FIRST : ROW;
      rrPath(c, X, y, R - X, h, first ? 36 : 28);
      c.fillStyle = '#fff'; c.fill();
      c.save();
      c.globalAlpha = first ? 1 : .75;
      c.lineWidth = first ? 6 : 3; c.strokeStyle = first ? pal.yellow : b.ring; c.stroke();
      c.restore();

      const cy = y + h / 2, bx = X + (first ? 84 : 62), br = first ? 56 : 36;
      c.beginPath(); c.arc(bx, cy, br, 0, Math.PI * 2);
      c.fillStyle = b.bg; c.fill();
      c.lineWidth = 4; c.strokeStyle = b.ring; c.stroke();
      c.fillStyle = b.fg; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `bold ${first ? 46 : 34}px ${FONT}`;
      c.fillText(first ? row.rank + '位' : String(row.rank), bx, cy + 2);

      const tw = first ? 302 : 160, th = first ? 170 : 90, tx = X + (first ? 170 : 116);
      drawThumb(c, thumbs[i], tx, y + (h - th) / 2, tw, th, first ? 14 : 10, row.song.title);

      const x = tx + tw + 26;
      c.textAlign = 'left'; c.fillStyle = INK;
      const label = fitText(c, row.song.title, first ? 52 : 40, 26, R - 28 - x);
      c.fillText(label, x, cy + 2);
    });

    // フッター
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = WINE; c.font = `bold 28px ${FONT}`;
    c.fillText('高嶺のなでしこ 好き曲ソート（非公式）', W / 2, H - 92);
    c.fillStyle = SUB; c.font = `22px ${FONT}`;
    c.fillText(location.host + location.pathname, W / 2, H - 56);

    return new Promise((resolve, reject) => {
      cv.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
    });
  }
  async function buildShareImage(rows) {
    const token = ++imgToken;
    const top = rows.slice(0, 10);
    $('#imgStatus').hidden = false; $('#imgStatus').textContent = '画像を作成中…';
    $('#resultImg').hidden = true;
    ['saveImgBtn', 'copyImgBtn', 'shareImgBtn'].forEach(id => $('#' + id).disabled = true);
    const thumbs = await Promise.all(top.map(r => loadThumb(r.song.image)));
    let blob;
    try { blob = await drawResultCanvas(top, thumbs); }
    catch (e) { blob = await drawResultCanvas(top, top.map(() => null)); }   // サムネ取得に失敗しても文字だけで作る
    if (token !== imgToken) return;
    imgBlob = blob;
    if (imgObjUrl) URL.revokeObjectURL(imgObjUrl);
    imgObjUrl = URL.createObjectURL(blob);
    $('#resultImg').src = imgObjUrl; $('#resultImg').hidden = false;
    $('#imgStatus').hidden = true;
    ['saveImgBtn', 'copyImgBtn', 'shareImgBtn'].forEach(id => $('#' + id).disabled = false);
  }

  /* ================= 開始・再開 ================= */
  function start() {
    const ids = [...selected];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    session = { order: ids, choices: [] };
    sorter = replay(session.order, session.choices);
    save();
    track('sort-start', 'ソート開始');
    renderBattle();
  }
  function resume() {
    session = load();
    sorter = replay(session.order, session.choices);
    renderBattle();
  }

  function bind() {
    $('#selAll').onclick = () => { filterMode = 'all'; activeTypes = new Set(); applyFilter(); renderSetup(); };
    $('#selNone').onclick = () => { selected.clear(); filterMode = 'custom'; renderSetup(); };
    $('#startBtn').onclick = start;
    $('#resumeBtn').onclick = resume;
    $('#discardBtn').onclick = () => { clear(); renderSetup(); };
    $('#btnL').onclick = () => choose('l');
    $('#btnR').onclick = () => choose('r');
    $('#btnTie').onclick = () => choose('t');
    $('#btnUndo').onclick = undo;
    $('#btnSkip').onclick = () => choose('s');
    $('#btnHome').onclick = renderSetup;
    $('#againBtn').onclick = () => { clear(); renderSetup(); };
    $('#x-share').addEventListener('click', () => track('share-x', 'Xにテキスト投稿'));

    // 結果画像: 保存 / コピー / 端末の共有シート
    const flash = (btn, msg) => { const t = btn.textContent; btn.textContent = msg; setTimeout(() => btn.textContent = t, 1800); };
    $('#saveImgBtn').onclick = () => {
      if (!imgBlob) return;
      const a = document.createElement('a');
      a.href = imgObjUrl; a.download = 'takaneko-sort.png';
      document.body.appendChild(a); a.click(); a.remove();
      track('image-save', '結果画像を保存');
      showNext('save');
    };
    const canCopy = !!(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
    $('#copyImgBtn').hidden = !canCopy;
    $('#copyImgBtn').onclick = async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': imgBlob })]);
        flash($('#copyImgBtn'), 'コピーしました');
        track('image-copy', '結果画像をコピー');
        showNext('copy');
      } catch (e) { alert('コピーできませんでした。「画像を保存」を使ってください。'); }
    };
    const probe = new File(['x'], 'a.png', { type: 'image/png' });
    const canShareFiles = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [probe] }));
    $('#shareImgBtn').hidden = !canShareFiles;
    $('#saveImgBtn').classList.toggle('primary', !canShareFiles);
    $('#shareImgBtn').onclick = async () => {
      if (!imgBlob) return;
      const file = new File([imgBlob], 'takaneko-sort.png', { type: 'image/png' });
      try { await navigator.share({ files: [file], text: shareTextForImg, url: location.href }); track('image-share', '画像つきでシェア'); }
      catch (e) { if (e.name !== 'AbortError') alert('共有できませんでした。「画像を保存」を使ってください。'); }
    };
    document.addEventListener('keydown', e => {
      if ($('#sort-area').hidden) return;
      if (e.key === 'ArrowLeft') choose('l');
      else if (e.key === 'ArrowRight') choose('r');
      else if (e.key === 'ArrowDown') { e.preventDefault(); choose('t'); }
      else if (e.key === 'z' || e.key === 'Z') undo();
    });
  }

  fetch('./songs.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error('songs.json: ' + r.status); return r.json(); })
    .then(data => {
      let nextId = Math.max(0, ...data.map(d => Number(d.id) || 0)) + 1;
      const seen = new Set();
      items = data.map(d => {
        let id = d.id;
        if (id == null || seen.has(id)) id = nextId++;   // id の付け忘れ・重複があっても動くようにする
        seen.add(id);
        const types = d.type == null ? [] : [].concat(d.type).map(String).filter(Boolean);
        return { id, title: d.title, image: d.image || '', types };
      });
      items.forEach(it => itemById.set(it.id, it));
      allTypes = [...new Set(items.flatMap(it => it.types))];
      selected = new Set(items.map(i => i.id));
      bind();
      renderSetup();
    })
    .catch(err => {
      $('#setup-area').hidden = false;
      $('#setup-area').textContent = 'エラー: songs.json が見つからないか、読み込めませんでした。';
      console.error(err);
    });
})();
