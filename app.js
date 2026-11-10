// ==========================================
// 中山間 活動記録 LIFFモーダル
//   ?mode=report   … 活動報告
//   ?mode=purchase … 備品購入
//   ?mock=1        … LINEなしで画面だけ確認する（mock.js）
// ==========================================
(() => {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const MOCK = new URLSearchParams(location.search).get('mock') === '1';
  const PHOTO_MAX = 3;
  const DONE_PREFIX = '【記録完了】';

  const PHOTO_INFO = {
    '集合写真': { title: '作業前の集合写真', hint: '活動を始める前の集合写真を撮るか、アルバムから選んでください（3枚まで）。' },
    '写真(中)': { title: '作業中の写真', hint: '作業している様子の写真を撮るか、選んでください（3枚まで）。' },
    '写真(後)': { title: '完了時の写真', hint: '作業が終わったあとの写真を撮るか、選んでください（3枚まで）。' },
    '領収書写真': { title: '領収書の写真', hint: '領収書の写真を撮るか、選んでください（3枚まで）。' },
    '商品写真': { title: '購入した商品の写真', hint: '購入した商品の写真を撮るか、選んでください（3枚まで）。' }
  };

  const STEPS = {
    report: ['photo:集合写真', 'start', 'location', 'weather', 'participants', 'activity', 'kasan', 'photo:写真(中)', 'photo:写真(後)', 'end', 'confirm'],
    purchase: ['date', 'purchaseItems', 'photo:領収書写真', 'photo:商品写真', 'confirm']
  };
  const MODE_LABEL = { report: '活動報告', purchase: '備品購入' };

  const KANA_TABS = [
    { label: 'すべて', chars: [] },
    { label: 'あ行', chars: 'あいうえお' }, { label: 'か行', chars: 'かきくけこがぎぐげご' },
    { label: 'さ行', chars: 'さしすせそざじずぜぞ' }, { label: 'た行', chars: 'たちつてとだぢづでど' },
    { label: 'な行', chars: 'なにぬねの' }, { label: 'は行', chars: 'はひふへほばびぶべぼぱぴぷぺぽ' },
    { label: 'ま行', chars: 'まみむめも' }, { label: 'や行', chars: 'やゆよ' },
    { label: 'ら行', chars: 'らりるれろ' }, { label: 'わ行', chars: 'わをん' },
    { label: '団体', group: true }, { label: '非農業者', group: true }
  ];

  // ---------------- 状態 ----------------
  const S = {
    mode: null,
    data: null,
    stepIndex: 0,
    returnToConfirm: false,
    submitting: false,
    uploading: 0,
    kanaTab: 'すべて',
    openCats: {},
    a: {
      photos: { '集合写真': [], '写真(中)': [], '写真(後)': [], '領収書写真': [], '商品写真': [] },
      start: '', end: '', date: '',
      location: '', weather: '', kasan: '',
      purchase: [],
      attendance: {},      // 名簿の行番号 → { items: [...] }（出席の人だけ）
      manualNames: [],
      act: { checked: {}, otherTexts: {}, catTexts: {} }
    }
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const app = $('#app');

  // 小さなDOMヘルパー（文字列は必ず textContent で入れる）
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.setAttribute('style', v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------------- 通信 ----------------
  async function api(action, payload) {
    const body = Object.assign({ liffAction: action, idToken: liff.getIDToken() }, payload || {});
    if (MOCK) return window.MOCK_API(action, body);
    let res;
    try {
      // Content-Type を付けない（text/plain）ことで、GASでも CORS の事前確認なしで送れる
      res = await fetch(CFG.GAS_URL, { method: 'POST', body: JSON.stringify(body) });
    } catch (e) {
      throw new Error('通信できませんでした。電波の良いところで、もう一度お試しください。');
    }
    let json;
    try { json = await res.json(); } catch (e) { throw new Error('サーバーから正しい返事がありませんでした。'); }
    if (!json.ok) throw new Error(json.error || 'エラーが発生しました。');
    return json;
  }

  // ---------------- 日時 ----------------
  const pad = n => String(n).padStart(2, '0');
  function toLocalInput(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function nowRounded() {
    const d = new Date();
    d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0);
    return toLocalInput(d);
  }
  function fmtDT(v) {
    if (!v) return '';
    const d = new Date(v);
    const w = '日月火水木金土'[d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日(${w}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function duration(start, end) {
    const ms = new Date(end) - new Date(start);
    if (!(ms > 0)) return '';
    const m = Math.floor(ms / 60000);
    return `${Math.floor(m / 60)}時間${m % 60}分`;
  }

  // ---------------- 集計 ----------------
  const isSpecial = name => name === '団体' || name === '非農業者';

  function rosterCount() {
    let n = 0;
    for (const m of S.data.members) {
      const at = S.a.attendance[m.row];
      if (!at) continue;
      n += isSpecial(m.name) ? at.items.length : 1;
    }
    return n;
  }

  function collectActivity() {
    const cats = new Set();
    const details = [];
    const others = [];
    let missingOther = false;
    S.data.activityOptions.forEach((c, ci) => {
      c.items.forEach((item, ii) => {
        const key = `${ci}_${ii}`;
        if (!S.a.act.checked[key]) return;
        cats.add(c.cat);
        details.push(item);
        if (item.includes('その他')) {
          const t = (S.a.act.otherTexts[key] || '').trim();
          if (t) others.push(t); else missingOther = true;
        }
      });
    });
    S.data.activityOptions.forEach(c => {
      const t = (S.a.act.catTexts[c.cat] || '').trim();
      if (t) { cats.add(c.cat); others.push(`【${c.cat}】${t}`); }
    });
    return { categories: [...cats], details, otherText: others.join('\n'), missingOther };
  }

  const donePhotos = key => S.a.photos[key].filter(p => p.status === 'done').map(p => p.url);

  // ---------------- 各ステップ ----------------
  function stepDef(id) {
    if (id.startsWith('photo:')) return photoStep(id.slice(6));
    return {
      start: dtStep('start', '活動の開始日時', '活動を始めた日時を選んでください。'),
      end: dtStep('end', '活動の終了日時', '活動が終わった日時を選んでください。'),
      date: dtStep('date', '購入した日時', '備品を購入した日時を選んでください。'),
      location: locationStep(),
      weather: singleStep('weather', '天気', () => S.data.weathers, true),
      kasan: singleStep('kasan', 'スマート農業加算ですか？', () => ['はい', 'いいえ'], true),
      purchaseItems: purchaseStep(),
      participants: participantsStep(),
      activity: activityStep(),
      confirm: confirmStep()
    }[id];
  }

  // 写真
  function photoStep(key) {
    const info = PHOTO_INFO[key];
    return {
      title: info.title,
      nextLabel: () => (S.a.photos[key].length ? '次へ' : '写真なしで次へ'),
      validate() {
        const list = S.a.photos[key];
        if (list.some(p => p.status === 'uploading')) return '写真を送信中です。少しお待ちください。';
        if (list.some(p => p.status === 'error')) return '送信に失敗した写真があります。×で消してから進んでください。';
        return '';
      },
      render(body) {
        const list = S.a.photos[key];
        const input = h('input', {
          type: 'file', accept: 'image/*', multiple: true, hidden: true,
          onchange: e => { addPhotos(key, [...e.target.files]); e.target.value = ''; }
        });
        const grid = h('div', { class: 'photo-grid' });
        const draw = () => {
          grid.replaceChildren();
          list.forEach((p, i) => {
            grid.append(h('div', { class: 'photo' },
              h('img', { src: p.thumb, alt: '' }),
              p.status === 'uploading' ? h('div', { class: 'photo-overlay' }, h('div', { class: 'spinner' })) : null,
              p.status === 'error' ? h('div', { class: 'photo-overlay err' }, '送信失敗') : null,
              p.status !== 'uploading' ? h('button', {
                class: 'photo-del', 'aria-label': '写真を消す',
                onclick: () => { list.splice(i, 1); draw(); renderFooter(); }
              }, '×') : null
            ));
          });
          if (list.length < PHOTO_MAX) {
            grid.append(h('button', { class: 'photo-add', onclick: () => input.click() },
              h('span', { class: 'plus' }, '＋'), '撮影・選択'));
          }
        };
        S.redrawPhotos = draw;
        draw();
        body.append(h('p', { class: 'hint' }, info.hint), grid, input);
      }
    };
  }

  function addPhotos(key, files) {
    const list = S.a.photos[key];
    const room = PHOTO_MAX - list.length;
    if (files.length > room) toast(`写真は${PHOTO_MAX}枚までです。最初の${room}枚だけ追加します。`);
    files.slice(0, room).forEach(file => {
      const item = { thumb: URL.createObjectURL(file), status: 'uploading', url: '' };
      list.push(item);
      S.uploading++;
      resizeImage(file)
        .then(dataUrl => api('uploadPhoto', { key, dataUrl }))
        .then(res => { item.url = res.url; item.status = 'done'; })
        .catch(err => { item.status = 'error'; toast(err.message); })
        .finally(() => {
          S.uploading--;
          if (S.redrawPhotos && currentId() === 'photo:' + key) { S.redrawPhotos(); renderFooter(); }
        });
    });
    if (S.redrawPhotos) S.redrawPhotos();
    renderFooter();
  }

  function resizeImage(file, max = 1600, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした。')); };
      img.src = url;
    });
  }

  // 日時
  function dtStep(field, title, hint) {
    return {
      title,
      validate() {
        if (!S.a[field]) return '日時を選んでください。';
        if (field === 'end' && !(new Date(S.a.end) > new Date(S.a.start))) return '終了日時は開始日時より後にしてください。';
        return '';
      },
      render(body) {
        if (!S.a[field]) {
          S.a[field] = nowRounded();
          // 終了の初期値が開始より前になるときは「開始＋1時間」にしておく
          if (field === 'end' && S.a.start && !(new Date(S.a.end) > new Date(S.a.start))) {
            S.a.end = toLocalInput(new Date(new Date(S.a.start).getTime() + 3600000));
          }
        }
        const info = h('div', { class: 'info' });
        const updInfo = () => {
          if (field !== 'end') { info.textContent = fmtDT(S.a[field]); info.className = 'info'; return; }
          const d = duration(S.a.start, S.a.end);
          info.textContent = d ? `作業時間：${d}` : '終了日時を開始日時より後にしてください';
          info.className = d ? 'info' : 'info warn';
        };
        const input = h('input', {
          type: 'datetime-local', class: 'dt', value: S.a[field],
          oninput: e => { S.a[field] = e.target.value; updInfo(); }
        });
        const setNow = () => { S.a[field] = nowRounded(); input.value = S.a[field]; updInfo(); };
        body.append(
          h('p', { class: 'hint' }, hint),
          h('div', { class: 'dt-wrap' },
            input,
            h('div', { class: 'dt-quick' }, h('button', { class: 'chip-btn', onclick: setNow }, '今の時刻にする')),
            info)
        );
        updInfo();
      }
    };
  }

  // 1つ選ぶとすぐ次へ進む質問
  function singleStep(field, title, getOptions, twoCols) {
    return {
      title,
      hideNextUntilAnswered: true,
      validate: () => (S.a[field] ? '' : '選んでください。'),
      render(body) {
        const opts = getOptions();
        body.append(h('div', { class: 'choices' + (twoCols ? ' two' : '') },
          opts.map(o => h('button', {
            class: 'choice' + (S.a[field] === o ? ' selected' : ''),
            onclick: () => { S.a[field] = o; render(); setTimeout(next, 180); }
          }, o))));
      }
    };
  }

  // 場所（選ぶ or 入力）
  function locationStep() {
    return {
      title: '活動場所',
      hideNextUntilAnswered: true,
      validate: () => (S.a.location.trim() ? '' : '場所を選ぶか、入力してください。'),
      render(body) {
        const opts = S.data.locations;
        const isCustom = S.a.location && !opts.includes(S.a.location);
        const input = h('input', { class: 'text', type: 'text', placeholder: '例：〇〇地区の水路', value: isCustom ? S.a.location : '', enterkeyhint: 'done' });
        const useInput = () => {
          const v = input.value.trim();
          if (!v) { toast('場所を入力してください。'); return; }
          S.a.location = v; render(); setTimeout(next, 180);
        };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') useInput(); });
        body.append(
          h('div', { class: 'choices' },
            opts.map(o => h('button', {
              class: 'choice' + (S.a.location === o ? ' selected' : ''),
              onclick: () => { S.a.location = o; render(); setTimeout(next, 180); }
            }, o))),
          h('div', { class: 'manual-box' },
            h('label', {}, 'リストにない場所は入力してください'),
            h('div', { class: 'row' }, input, h('button', { class: 'btn-small', onclick: useInput }, '決定')))
        );
      }
    };
  }

  // 備品購入の内容（複数選択）
  function purchaseStep() {
    return {
      title: '備品購入の内容',
      validate: () => (S.a.purchase.length ? '' : '1つ以上選んでください。'),
      render(body) {
        body.append(h('p', { class: 'hint' }, '当てはまるものをすべて選んでください。'),
          h('div', { class: 'choices' },
            S.data.purchaseOptions.map(o => {
              const on = S.a.purchase.includes(o);
              return h('button', {
                class: 'choice' + (on ? ' selected' : ''),
                onclick: () => {
                  S.a.purchase = on ? S.a.purchase.filter(x => x !== o) : S.a.purchase.concat(o);
                  render();
                }
              }, h('span', { class: 'check' }, on ? '✓' : ''), o);
            })));
      }
    };
  }

  // 参加者
  function participantsStep() {
    return {
      title: '参加者',
      validate: () => (rosterCount() + S.a.manualNames.length > 0 ? '' : '参加者を1人以上選んでください。'),
      render(body) {
        const countEl = h('span', { class: 'att-count' });
        const updCount = () => {
          const r = rosterCount(), m = S.a.manualNames.length;
          countEl.textContent = `参加 ${r + m}名` + (m ? `（手入力${m}名）` : '');
        };
        const grid = h('div', { class: 'members' });
        const tabs = h('div', { class: 'tabs' });

        const drawTabs = () => {
          tabs.replaceChildren(...KANA_TABS.map(t => h('button', {
            class: 'tab' + (t.group ? ' group' : '') + (S.kanaTab === t.label ? ' active' : ''),
            onclick: () => { S.kanaTab = t.label; drawTabs(); drawGrid(); }
          }, t.label)));
        };
        const drawGrid = () => {
          const tab = KANA_TABS.find(t => t.label === S.kanaTab);
          const list = S.data.members.filter(m => {
            if (tab.label === 'すべて') return true;
            if (tab.group) return m.name === tab.label;
            if (isSpecial(m.name)) return false;
            const k = (m.kana || '').trim();
            return k !== '' && tab.chars.includes(k.charAt(0));
          });
          grid.replaceChildren();
          if (!list.length) { grid.append(h('div', { class: 'empty' }, '該当する人がいません')); return; }
          list.forEach(m => {
            const at = S.a.attendance[m.row];
            const special = isSpecial(m.name);
            grid.append(h('button', {
              class: 'member' + (special ? ' group' : '') + (at ? ' on' : ''),
              onclick: () => openMemberSheet(m, () => { drawGrid(); updCount(); })
            },
              h('span', { class: 'kana' }, special ? '' : m.kana),
              h('span', { class: 'name' }, m.name),
              h('span', { class: 'st' }, at ? (special ? `${at.items.length}団体` : '● 参加') : '〇'),
              at && at.items.length ? h('span', { class: 'its' }, at.items.join('、')) : null));
          });
        };

        const manualInput = h('input', { class: 'text', type: 'text', placeholder: '名簿にない人の名前', enterkeyhint: 'done' });
        const chips = h('div', { class: 'chips' });
        const drawChips = () => {
          chips.replaceChildren(...S.a.manualNames.map((n, i) => h('span', { class: 'chip' }, n,
            h('button', { 'aria-label': n + 'を消す', onclick: () => { S.a.manualNames.splice(i, 1); drawChips(); updCount(); renderFooter(); } }, '×'))));
        };
        const addManual = () => {
          const v = manualInput.value.trim();
          if (!v) return;
          S.a.manualNames.push(v);
          manualInput.value = '';
          drawChips(); updCount(); renderFooter();
        };
        manualInput.addEventListener('keydown', e => { if (e.key === 'Enter') addManual(); });

        drawTabs(); drawGrid(); drawChips(); updCount();
        body.append(
          h('div', { class: 'att-summary' }, h('span', { class: 'hint', style: 'margin:0' }, '参加した人をタップ'), countEl),
          tabs, grid,
          h('div', { class: 'manual-box' },
            h('label', {}, '名簿にない人を追加'),
            h('div', { class: 'row' }, manualInput, h('button', { class: 'btn-small', onclick: addManual }, '追加')),
            chips)
        );
      }
    };
  }

  // 名簿の人をタップしたときのシート（持ち物 or 団体名を選ぶ）
  function openMemberSheet(m, onChange) {
    const special = isSpecial(m.name);
    const list = m.name === '団体' ? S.data.groups : m.name === '非農業者' ? S.data.others : S.data.items;
    const current = S.a.attendance[m.row];

    // 持ち物の選択肢がない普通の人は、タップだけで参加/取消を切り替える
    if (!special && !list.length) {
      if (current) delete S.a.attendance[m.row]; else S.a.attendance[m.row] = { items: [] };
      onChange(); renderFooter();
      return;
    }

    let selected = current ? current.items.slice() : [];
    const root = $('#sheet-root');
    const close = () => root.replaceChildren();
    const listEl = h('div', { class: 'sheet-list' });
    const drawList = () => {
      listEl.replaceChildren(...list.map(it => {
        const on = selected.includes(it);
        return h('button', {
          class: 'choice' + (on ? ' selected' : ''),
          onclick: () => { selected = on ? selected.filter(x => x !== it) : selected.concat(it); drawList(); }
        }, it);
      }));
    };
    drawList();

    const confirm = () => {
      if (special && !selected.length) {
        delete S.a.attendance[m.row];
      } else {
        S.a.attendance[m.row] = { items: selected };
      }
      close(); onChange(); renderFooter();
    };
    const absent = () => { delete S.a.attendance[m.row]; close(); onChange(); renderFooter(); };

    root.replaceChildren(h('div', { class: 'overlay', onclick: e => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
        h('h3', {}, m.name),
        h('p', { class: 'hint' }, special ? '参加した団体・組織を選んでください（複数可）' : '持ち物があれば選んでください（なくても大丈夫です）'),
        listEl,
        h('div', { class: 'sheet-foot' },
          h('button', { class: 'btn btn-ghost', onclick: absent }, current ? '不参加にする' : 'やめる'),
          h('button', { class: 'btn ' + (special ? 'btn-blue' : 'btn-next'), onclick: confirm }, special ? '決定' : '参加にする')))));
  }

  // 活動内容
  function activityStep() {
    return {
      title: '活動内容',
      validate() {
        const r = collectActivity();
        if (!r.details.length) return '活動内容を1つ以上チェックしてください。';
        if (r.missingOther) return '「その他」を選んだときは、内容を入力してください。';
        return '';
      },
      render(body) {
        const opts = S.data.activityOptions;
        if (!opts.length) {
          body.append(h('p', { class: 'hint' }, '活動内容の選択肢が見つかりません。スプレッドシートの「活動内容リスト」を確認してください。'));
          return;
        }
        body.append(h('p', { class: 'hint' }, '区分をタップして開き、行った作業にチェックしてください。'));
        opts.forEach((c, ci) => {
          const countChecked = () => c.items.filter((_, ii) => S.a.act.checked[`${ci}_${ii}`]).length;
          const badge = h('span', { class: 'cat-badge' });
          const wrap = h('div', { class: 'cat' });
          const updHead = () => {
            const n = countChecked();
            badge.textContent = n ? `${n}` : '';
            badge.style.display = n ? '' : 'none';
            wrap.classList.toggle('has', n > 0 || !!(S.a.act.catTexts[c.cat] || '').trim());
          };
          const bodyEl = h('div', { class: 'cat-body' });
          c.items.forEach((item, ii) => {
            const key = `${ci}_${ii}`;
            const id = `act_${key}`;
            const isOther = item.includes('その他');
            const other = isOther ? h('input', {
              class: 'text act-other', type: 'text', placeholder: '【必須】具体的な内容',
              value: S.a.act.otherTexts[key] || '',
              oninput: e => { S.a.act.otherTexts[key] = e.target.value; }
            }) : null;
            if (other) other.style.display = S.a.act.checked[key] ? '' : 'none';
            bodyEl.append(h('div', { class: 'act-item' },
              h('input', {
                type: 'checkbox', id, checked: !!S.a.act.checked[key],
                onchange: e => {
                  if (e.target.checked) S.a.act.checked[key] = true; else delete S.a.act.checked[key];
                  if (other) other.style.display = e.target.checked ? '' : 'none';
                  updHead();
                }
              }),
              h('label', { for: id }, item)));
            if (other) bodyEl.append(other);
          });
          bodyEl.append(h('div', { class: 'cat-note' },
            h('label', {}, `✏️ 具体的な作業内容（任意）`),
            h('input', {
              class: 'text', type: 'text', placeholder: '例：水路の泥上げ、〇〇の補修',
              value: S.a.act.catTexts[c.cat] || '',
              oninput: e => { S.a.act.catTexts[c.cat] = e.target.value; updHead(); }
            })));
          bodyEl.style.display = S.openCats[ci] ? '' : 'none';
          const arrow = h('span', {}, S.openCats[ci] ? '▲' : '▼');
          wrap.append(
            h('button', {
              class: 'cat-head',
              onclick: () => {
                S.openCats[ci] = !S.openCats[ci];
                bodyEl.style.display = S.openCats[ci] ? '' : 'none';
                arrow.textContent = S.openCats[ci] ? '▲' : '▼';
              }
            }, h('span', {}, c.cat, badge), arrow),
            bodyEl);
          updHead();
          body.append(wrap);
        });
      }
    };
  }

  // 確認
  function summaryRows() {
    const photoText = key => { const n = donePhotos(key).length; return n ? `${n}枚` : 'なし'; };
    if (S.mode === 'purchase') {
      return [
        ['購入日時', fmtDT(S.a.date), 'date'],
        ['内容', S.a.purchase.join('、'), 'purchaseItems'],
        ['領収書写真', photoText('領収書写真'), 'photo:領収書写真'],
        ['商品写真', photoText('商品写真'), 'photo:商品写真']
      ];
    }
    const act = collectActivity();
    const r = rosterCount(), m = S.a.manualNames.length;
    let people = `${r + m}名`;
    if (m) people += `\n（名簿${r}名＋手入力：${S.a.manualNames.join('、')}）`;
    let actText = act.details.filter(d => !d.includes('その他')).join('、');
    if (act.otherText) actText += (actText ? '\n' : '') + act.otherText;
    return [
      ['集合写真', photoText('集合写真'), 'photo:集合写真'],
      ['開始', fmtDT(S.a.start), 'start'],
      ['場所', S.a.location, 'location'],
      ['天気', S.a.weather, 'weather'],
      ['参加者', people, 'participants'],
      ['活動内容', actText || '（選択なし）', 'activity'],
      ['スマート農業加算', S.a.kasan, 'kasan'],
      ['作業中の写真', photoText('写真(中)'), 'photo:写真(中)'],
      ['完了時の写真', photoText('写真(後)'), 'photo:写真(後)'],
      ['終了', fmtDT(S.a.end), 'end'],
      ['作業時間', duration(S.a.start, S.a.end), 'end']
    ];
  }

  function confirmStep() {
    return {
      title: 'この内容で記録しますか？',
      nextLabel: () => (S.submitting ? '記録中…' : 'この内容で記録する'),
      render(body) {
        body.append(h('p', { class: 'hint' }, '内容を確認して、下の「この内容で記録する」を押してください。'),
          h('div', { class: 'summary' }, summaryRows().map(([k, v, stepId]) => h('div', { class: 'sum-row' },
            h('div', { class: 'sum-key' }, k),
            h('div', { class: 'sum-val' }, v || '―'),
            h('button', { class: 'sum-edit', onclick: () => jumpTo(stepId) }, '修正')))));
      }
    };
  }

  // ---------------- 画面の切り替え ----------------
  const steps = () => STEPS[S.mode];
  const currentId = () => steps()[S.stepIndex];
  let footerEl = null;

  function render() {
    const list = steps();
    const def = stepDef(currentId());
    S.redrawPhotos = null;
    const body = h('main', { class: 'body' });
    footerEl = h('footer', { class: 'foot' });
    app.replaceChildren(
      h('header', { class: 'top' },
        h('div', { class: 'top-row' },
          h('span', { class: 'mode-tag' }, MODE_LABEL[S.mode] + (S.mode === 'report' ? `　No.${S.data.nextNo}` : '')),
          h('span', {}, `${S.stepIndex + 1} / ${list.length}`)),
        h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${((S.stepIndex + 1) / list.length) * 100}%` })),
        h('h1', { class: 'q' }, def.title)),
      body,
      footerEl);
    def.render(body);
    renderFooter();
  }

  function renderFooter() {
    if (!footerEl || !S.mode) return;
    const def = stepDef(currentId());
    const isConfirm = currentId() === 'confirm';
    let label = def.nextLabel ? def.nextLabel() : '次へ';
    if (S.returnToConfirm && !isConfirm) label = '確認画面へ戻る';
    const back = h('button', { class: 'btn btn-back', onclick: back_ }, S.stepIndex === 0 ? 'やめる' : '戻る');
    const nextBtn = h('button', { class: 'btn btn-next', disabled: S.submitting, onclick: isConfirm ? submit : next },
      S.submitting ? h('span', { class: 'spinner', style: 'border-top-color:#fff' }) : null, label);
    const showNext = isConfirm || !def.hideNextUntilAnswered || !def.validate() || S.returnToConfirm;
    footerEl.replaceChildren(back, showNext ? nextBtn : h('div', { style: 'flex:1' }));
  }

  function next() {
    const def = stepDef(currentId());
    const err = def.validate ? def.validate() : '';
    if (err) { toast(err); return; }
    if (S.returnToConfirm) {
      S.returnToConfirm = false;
      S.stepIndex = steps().length - 1;
    } else if (S.stepIndex < steps().length - 1) {
      S.stepIndex++;
    }
    render();
  }

  function back_() {
    if (S.submitting) return;
    if (S.stepIndex === 0) {
      if (window.confirm('入力をやめて閉じますか？')) closeApp();
      return;
    }
    S.returnToConfirm = false;
    S.stepIndex--;
    render();
  }

  function jumpTo(stepId) {
    const i = steps().indexOf(stepId);
    if (i < 0) return;
    S.stepIndex = i;
    S.returnToConfirm = true;
    render();
  }

  function closeApp() {
    if (!MOCK && liff.isInClient()) liff.closeWindow();
    else renderModeSelect();
  }

  // ---------------- 記録 ----------------
  function buildAnswers() {
    const photos = {};
    Object.keys(S.a.photos).forEach(k => { photos[k] = donePhotos(k); });
    if (S.mode === 'purchase') {
      return { photos, date: S.a.date, purchase: S.a.purchase };
    }
    const act = collectActivity();
    return {
      photos,
      start: S.a.start, end: S.a.end,
      location: S.a.location, weather: S.a.weather, kasan: S.a.kasan,
      attendance: Object.entries(S.a.attendance).map(([row, v]) => ({ row: Number(row), items: v.items })),
      manualNames: S.a.manualNames,
      activity: { categories: act.categories, details: act.details, otherText: act.otherText }
    };
  }

  function doneMessage(no) {
    if (S.mode === 'purchase') {
      return `${DONE_PREFIX}備品購入 No.${no}\n購入日時：${fmtDT(S.a.date)}\n内容：${S.a.purchase.join('、')}`;
    }
    const act = collectActivity();
    return `${DONE_PREFIX}活動報告 No.${no}\n` +
      `開始：${fmtDT(S.a.start)}\n終了：${fmtDT(S.a.end)}（${duration(S.a.start, S.a.end)}）\n` +
      `場所：${S.a.location}\n参加者：${rosterCount() + S.a.manualNames.length}名\n` +
      `内容：${act.details.filter(d => !d.includes('その他')).join('、') || act.otherText}`;
  }

  async function submit() {
    if (S.submitting) return;
    if (S.uploading) { toast('写真を送信中です。少しお待ちください。'); return; }
    S.submitting = true;
    renderFooter();
    let no;
    try {
      const res = await api('submit', { mode: S.mode, answers: buildAnswers() });
      no = res.no;
    } catch (err) {
      S.submitting = false;
      renderFooter();
      alert('記録できませんでした。\n\n' + err.message);
      return;
    }

    app.replaceChildren(h('div', { class: 'center-screen' },
      h('div', { class: 'done-mark' }, '✓'),
      h('h2', {}, '記録しました'),
      h('p', {}, `${MODE_LABEL[S.mode]} No.${no}`),
      h('p', { class: 'hint' }, 'まもなくトーク画面に戻ります')));

    try {
      if (!MOCK && liff.isInClient()) {
        await liff.sendMessages([{ type: 'text', text: doneMessage(no) }]);
      }
    } catch (e) {
      // トーク以外から開いた場合などは送れないが、記録はできているので閉じる
      console.warn(e);
    }
    setTimeout(() => {
      if (!MOCK && liff.isInClient()) liff.closeWindow();
      else app.replaceChildren(h('div', { class: 'center-screen' },
        h('div', { class: 'done-mark' }, '✓'), h('h2', {}, '記録しました'),
        h('p', {}, `${MODE_LABEL[S.mode]} No.${no}`),
        h('p', { class: 'hint' }, 'この画面は閉じて大丈夫です')));
    }, 1200);
  }

  // ---------------- 開始 ----------------
  function startMode(mode) {
    S.mode = mode;
    S.stepIndex = 0;
    render();
  }

  function renderModeSelect() {
    S.mode = null;
    app.replaceChildren(h('div', { class: 'center-screen' },
      h('h2', {}, '何を記録しますか？'),
      h('div', { class: 'mode-select' },
        h('button', { class: 'mode-btn', onclick: () => startMode('report') }, '📝 活動報告'),
        h('button', { class: 'mode-btn sub', onclick: () => startMode('purchase') }, '🧾 備品購入'))));
  }

  function renderError(msg) {
    app.replaceChildren(h('div', { class: 'center-screen' },
      h('h2', {}, '開けませんでした'),
      h('p', {}, msg),
      h('button', { class: 'btn btn-next', style: 'flex:0;padding:14px 28px', onclick: () => location.reload() }, 'もう一度読み込む')));
  }

  async function main() {
    try {
      if (!MOCK && (!CFG.LIFF_ID || CFG.LIFF_ID.includes('ここに'))) {
        throw new Error('LIFF ID が設定されていません（config.js）。');
      }
      await liff.init({ liffId: CFG.LIFF_ID });
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }

      const res = await api('init');
      S.data = res.data;
      // すでに出席簿アプリで登録されていた人を最初から選んでおく
      S.data.members.forEach(m => {
        if (!m.attended) return;
        const items = String(m.items || '').split(',').map(s => s.trim()).filter(Boolean);
        if (isSpecial(m.name) && !items.length) return;
        S.a.attendance[m.row] = { items };
      });

      // liff.init のあとで URL を読む（liff.state 経由で ?mode= が付く）
      const mode = new URLSearchParams(location.search).get('mode');
      if (STEPS[mode]) startMode(mode); else renderModeSelect();
    } catch (err) {
      renderError(err.message || String(err));
    }
  }

  main();
})();
