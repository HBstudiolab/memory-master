'use strict';

const $ = id => document.getElementById(id);
const KEY = 'memory-master-state-v1';

let datasets = [], questions = [], currentSet = null, state = null, clock = null;
let phase = 'question'; // question | explanation | finished
let activeQuestion = null;
let view = null;        // 해설 영역을 잘라낸 상태의 문제 이미지 정보 {bands, keep, url}
let viewToken = 0;

function shuffle(list) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function getStorage() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
function save() { if (!state) return; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
function nowElapsed() { return state ? state.elapsed + (!state.pausedAt ? Date.now() - state.startedAt : 0) : 0; }
function formatTime(t) { const s = Math.floor(Math.max(0, t) / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0'); }
function tick() { $('timer').textContent = formatTime(nowElapsed()); updatePacer(); }
function setVisible(id, yes) { $(id).hidden = !yes; }
function currentQuestion() { return questions.find(q => q.id === state?.queue?.[0]); }

function resetUI() {
  resetArchery();
  resetHitFx();
  clearHits();
  setVisible('result', false);
  setVisible('next', false);
  setVisible('next-float', false);
  setVisible('next-top', false);
  setVisible('explanation-well', false);
  setVisible('finish', false);
  setVisible('actions', true);
  setArcheryEnabled(true);
  phase = 'question';
}

function updateStats() {
  if (!state) return;
  const remaining = state.queue.length, done = state.total - remaining;
  $('remaining').textContent = String(remaining);
  $('completed').textContent = `${done} / ${state.total}`;
  $('accuracy').textContent = state.firstAttempts ? Math.round(state.firstCorrect / state.firstAttempts * 100) + '%' : '–';
  $('progress').style.width = (state.total ? done / state.total * 100 : 100) + '%';
  syncFever();
  tick();
}

/* ---------- 문제 이미지 표시 (해설 영역 잘라내기) ---------- */

// 해설 영역 사각형들의 세로 범위를 합쳐 잘라낼 가로 띠 목록으로 만듭니다.
function toBands(rects) {
  if (!rects) return null;
  const list = rects.map(r => [Math.max(0, r.y), Math.min(1, r.y + r.h)]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of list) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else merged.push([a, b]);
  }
  const bands = merged.map(([y0, y1]) => ({y0, y1, len: y1 - y0})).filter(b => b.len > 0);
  const cut = bands.reduce((s, b) => s + b.len, 0);
  return bands.length && cut < 0.98 ? bands : null;
}

function releaseView() {
  if (view?.url) URL.revokeObjectURL(view.url);
  view = null;
}

function setQuestionSrc(src, onFail) {
  const img = $('question-image');
  img.hidden = !src;
  $('question-empty').hidden = !!src;
  if (!src) { img.removeAttribute('src'); return; }
  img.onerror = () => { img.hidden = true; $('question-empty').hidden = false; onFail?.(); };
  img.src = src;
}

// regions.json에는 남아 있지만 이미지 파일을 지운 문제는 이번 학습에서 빼고 다음 문제로 넘어갑니다.
function dropMissing(q) {
  if (activeQuestion !== q || phase !== 'question' || state.queue[0] !== q.id) return;
  questions = questions.filter(x => x !== q);
  state.queue.shift();
  state.total = Math.max(0, state.total - 1);
  save();
  toast('이미지 파일이 없어 건너뜁니다: ' + q.questionImage.split('/').pop());
  showQuestion();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* ---------- 저해상도 문제 이미지 선명하게 ---------- */
// 원본이 작으면(가로 300px 안팎) 화면에서 2~3배로 늘어나 글자가 뭉개집니다.
// 단계적으로 확대한 뒤 언샤프 마스크(윤곽 선명화) + 대비 보정(배경은 더 희게, 글자는 더 진하게)을 적용합니다.
const SHARPEN = false;      // true로 바꾸면 작은 이미지를 확대·선명화해서 표시
const SHARP_WIDTH = 1200;   // 이 가로 픽셀이 될 때까지 확대(이보다 큰 원본은 그대로)
const SHARP_AMOUNT = 0.2;   // 윤곽 선명화 세기
const LEVEL_BLACK = 45;     // 이보다 어두운 값은 완전한 검정으로
const LEVEL_WHITE = 242;    // 이보다 밝은 값은 완전한 흰색으로(누런/회색 배경 제거)

let sharp = null;           // 현재 문제의 선명화된 전체 이미지 {url}

function releaseSharp() {
  if (sharp?.url) URL.revokeObjectURL(sharp.url);
  sharp = null;
}

function canvasUrl(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(URL.createObjectURL(b)) : reject(Error('canvas')), 'image/png'));
}

// RGB 채널 가로·세로 박스 블러(반경 r)
function boxBlur(src, w, h, r) {
  const tmp = new Uint8ClampedArray(src.length), out = new Uint8ClampedArray(src.length), d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += src[(row + Math.min(w - 1, Math.max(0, i))) * 4 + c];
      for (let x = 0; x < w; x++) {
        tmp[(row + x) * 4 + c] = sum / d;
        sum += src[(row + Math.min(w - 1, x + r + 1)) * 4 + c] - src[(row + Math.max(0, x - r)) * 4 + c];
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += tmp[(Math.min(h - 1, Math.max(0, i)) * w + x) * 4 + c];
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 4 + c] = sum / d;
        sum += tmp[(Math.min(h - 1, y + r + 1) * w + x) * 4 + c] - tmp[(Math.max(0, y - r) * w + x) * 4 + c];
      }
    }
  }
  return out;
}

async function sharpenImage(src) {
  const img = await loadImage(src);
  const W = img.naturalWidth, H = img.naturalHeight;
  const scale = SHARPEN ? Math.min(4, SHARP_WIDTH / W) : 1;
  let cur = img, cw = W;
  if (scale > 1.15) {
    const tw = Math.round(W * scale);
    while (cw < tw) {                         // 한 번에 크게 늘리는 것보다 2배씩 나눠 늘려야 덜 뭉개짐
      const nw = Math.min(tw, cw * 2), nh = Math.round(nw / W * H), c = document.createElement('canvas');
      c.width = nw; c.height = nh;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(cur, 0, 0, nw, nh);
      cur = c; cw = nw;
    }
    const ctx = cur.getContext('2d'), w = cur.width, h = cur.height;
    const data = ctx.getImageData(0, 0, w, h), px = data.data;
    const blur = boxBlur(px, w, h, Math.max(1, Math.round(scale * 0.6)));
    const lut = new Uint8ClampedArray(512);   // 선명화 결과(-255~511) → 레벨 보정 값
    for (let i = 0; i < 512; i++) {
      const v = Math.min(1, Math.max(0, (i - 128 - LEVEL_BLACK) / (LEVEL_WHITE - LEVEL_BLACK)));
      lut[i] = Math.round(Math.pow(v, 1.6) * 255);   // 중간 밝기를 조금 어둡게 → 획이 진해짐
    }
    for (let i = 0; i < px.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = px[i + c] + SHARP_AMOUNT * (px[i + c] - blur[i + c]);
        px[i + c] = lut[Math.min(511, Math.max(0, Math.round(v) + 128))];
      }
    }
    ctx.putImageData(data, 0, 0);
    return cur;
  }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

// 해설 띠를 뺀 이미지를 캔버스로 만들어, 원래 그 부분이 없던 이미지처럼 보여줍니다.
async function cropImage(img, bands) {
  const W = img.width, H = img.height;
  const keepRows = [];
  let y = 0;
  for (const b of bands) {
    const y0 = Math.round(b.y0 * H), y1 = Math.round(b.y1 * H);
    if (y0 > y) keepRows.push([y, y0]);
    y = Math.max(y, y1);
  }
  if (y < H) keepRows.push([y, H]);
  const outH = keepRows.reduce((s, [a, b]) => s + (b - a), 0);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = Math.max(1, outH);
  const ctx = canvas.getContext('2d');
  let dy = 0;
  for (const [a, b] of keepRows) { ctx.drawImage(img, 0, a, W, b - a, 0, dy, W, b - a); dy += b - a; }
  return canvasUrl(canvas);
}

async function showQuestionImage(q) {
  const token = ++viewToken;
  releaseView();
  releaseSharp();
  const bands = toBands(q.explains);
  const well = $('question-well');
  well.classList.add('is-preparing');      // 선명화·잘라내기 전 원본(해설 포함)이 보이지 않게
  setQuestionSrc('');
  $('question-empty').hidden = true;
  try {
    const full = await sharpenImage(q.questionImage);
    if (token !== viewToken) return;
    const fullUrl = await canvasUrl(full);
    if (token !== viewToken) { URL.revokeObjectURL(fullUrl); return; }
    sharp = {url: fullUrl};
    if (bands) {
      const url = await cropImage(full, bands);
      if (token !== viewToken) { URL.revokeObjectURL(url); return; }
      view = {bands, keep: 1 - bands.reduce((s, b) => s + b.len, 0), url};
    }
    setQuestionSrc(view ? view.url : fullUrl);
  } catch {
    if (token !== viewToken) return;
    // 실패하면 원본을 그대로 쓰고 해설 띠는 덮어 숨깁니다(원본도 없으면 건너뜀).
    setQuestionSrc(q.questionImage, () => dropMissing(q));
    for (const b of bands || []) addHit('explain-cover', {left: 0, width: '100%', top: b.y0 * 100 + '%', height: b.len * 100 + '%'});
  } finally {
    if (token === viewToken) well.classList.remove('is-preparing');
  }
}

// 잘라낸 이미지의 세로 좌표(0~1)를 원본 이미지 좌표로 바꿉니다.
function toFullY(y) {
  if (!view) return y;
  let full = y * view.keep;
  for (const b of view.bands) { if (full >= b.y0) full += b.len; else break; }
  return Math.min(1, full);
}

// 답한 뒤: 원본 이미지로 바꾸며 해설 영역이 펼쳐지듯 나타납니다.
function revealExplanation(q) {
  const bands = toBands(q.explains);
  if (!bands) return;
  const well = $('question-well'), img = $('question-image');
  const cropped = !!view;
  const before = well.offsetHeight;
  viewToken++;
  releaseView();
  $('hit-layer').querySelectorAll('.explain-cover').forEach(el => el.remove());
  const show = () => {
    layoutHitLayer();
    for (const b of bands) addHit('explain-zone', {left: 0, width: '100%', top: b.y0 * 100 + '%', height: b.len * 100 + '%'});
    if (cropped) {
      const after = well.offsetHeight;
      if (after > before) well.animate([{height: before + 'px'}, {height: after + 'px'}], {duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)'});
    }
  };
  if (!cropped) { show(); return; }
  img.addEventListener('load', show, {once: true});
  setQuestionSrc(sharp?.url || q.questionImage);
}

/* ---------- 문제 진행 ---------- */

function showQuestion() {
  resetUI();
  updateStats();
  const q = currentQuestion();
  if (!q) { finish(); return; }
  activeQuestion = q;
  $('question-title').textContent = q.subject || '이미지 문제';
  $('round-chip').textContent = (state.wrong[q.id] || 0) ? '복습 문제' : '이미지 문제';
  showQuestionImage(q);
  setHitMode(q);
}

function showExplanation(message, status) {
  const q = activeQuestion;
  if (!q) return;
  resetArchery();
  phase = 'explanation';
  $('feedback').textContent = message;
  $('feedback').className = 'feedback ' + status;
  $('correct-answer').textContent = '정답 위치를 초록색으로 표시했습니다.' + (q.explains ? ' 해설이 문제 이미지에 펼쳐졌습니다.' : '');
  setVisible('correct-answer', true);
  revealExplanation(q);
  revealRegions(q);
  const hasImage = !q.explains && !!q.explanationImage;
  setVisible('explanation-well', hasImage);
  if (hasImage) {
    const img = $('explanation-image');
    img.onerror = () => setVisible('explanation-well', false);
    img.src = q.explanationImage;
  }
  // 정답이면 다음 버튼을 결과 바로 아래에, 오답·해설 보기면 해설 아래에 둡니다.
  const label = state.queue.length === 0 ? '학습 결과 보기 →' : '다음 문제 →';
  $('next').textContent = $('next-top').textContent = label;
  setVisible('next-top', status === 'good' || !hasImage);
  setVisible('next', status !== 'good' && hasImage);
  // 오른쪽 플로팅 버튼(활 버튼 자리): 마지막 문제면 결과 보기
  $('next-float').classList.toggle('is-last', state.queue.length === 0);
  $('next-float').setAttribute('aria-label', label.replace(' →', ''));
  $('next-float').title = label.replace(' →', '');
  setVisible('next-float', true);
  setVisible('result', true);
  setVisible('actions', false);
  setArcheryEnabled(false);
  save();
}

function markFirst(q, correct) {
  if (!state.seen[q.id]) { state.seen[q.id] = true; state.firstAttempts++; if (correct) state.firstCorrect++; }
}

// hit: 이미지 정답 위치를 맞힌 경우 {x, y, region}
function grade(q, correct, hit) {
  const fever = isFever();   // 이번 문제가 불화살 문제였는지(콤보 갱신 전 기준)
  state.streak = correct ? (state.streak || 0) + 1 : 0;
  if (correct) hitFx(q, hit, fever); else { penalize(); if (hit) wrongFx(hit); }
  markFirst(q, correct);
  if (correct) {
    state.queue.shift();
    state.completed.push(q.id);
    showExplanation((state.wrong[q.id] || 0) ? '정답입니다! 이전에 틀렸던 문제도 완료했습니다.' : '정답입니다! 완료 처리했습니다.', 'good');
  } else {
    state.wrong[q.id] = (state.wrong[q.id] || 0) + 1;
    state.queue.push(state.queue.shift());
    showExplanation('오답입니다. 이 문제는 나중에 다시 출제됩니다.', 'bad');
  }
  updateStats();
  if (correct && state.streak === FEVER_AT && state.queue.length) feverBanner();
}

function reveal() {
  if (phase !== 'question') return;
  const q = currentQuestion();
  markFirst(q, false);
  state.streak = 0;
  penalize();
  state.wrong[q.id] = (state.wrong[q.id] || 0) + 1;
  state.queue.push(state.queue.shift());
  showExplanation('정답을 확인했습니다. 이 문제는 나중에 다시 출제됩니다.', 'neutral');
  updateStats();
}

function skip() {
  if (phase !== 'question') return;
  if (state.queue.length < 2) {
    $('feedback').textContent = '현재 마지막 남은 문제입니다. 답을 입력하거나 해설을 확인해 주세요.';
    $('feedback').className = 'feedback neutral';
    setVisible('correct-answer', false);
    setVisible('result', true);
    return;
  }
  state.queue.push(state.queue.shift());
  save();
  showQuestion();
}

function finish() {
  resetArchery();
  clearHits();
  viewToken++;
  releaseView();
  releaseSharp();
  $('zoom-question').hidden = true;
  $('question-hint').textContent = '';
  phase = 'finished';
  state.elapsed = nowElapsed();
  state.pausedAt = Date.now();
  state.startedAt = Date.now();
  save();
  $('question-title').textContent = '학습 완료';
  $('question-image').hidden = true;
  $('question-empty').textContent = '모든 문제를 완료했습니다.';
  setVisible('question-empty', true);
  setArcheryEnabled(false);
  setVisible('actions', false);
  setVisible('result', false);
  setVisible('finish', true);
  setVisible('next-float', false);
  $('finish-summary').textContent = `총 ${state.total}문제 완료 · 첫 시도 정답률 ${state.firstAttempts ? Math.round(state.firstCorrect / state.firstAttempts * 100) : 0}%`;
  updateStats();
}

function startNew() {
  if (!questions.length) { alert('이 세트에 유효한 문제가 없습니다.'); return; }
  const range = $('range').value;
  const pool = shuffle(questions).slice(0, range === 'all' ? questions.length : Number(range));
  state = {set: currentSet.id, version: currentSet.version || '1', total: pool.length, queue: pool.map(q => q.id), completed: [], wrong: {}, seen: {}, firstAttempts: 0, firstCorrect: 0, streak: 0, elapsed: 0, startedAt: Date.now(), pausedAt: null};
  save();
  showQuestion();
}

/* ---------- 문제 세트 / 영역 데이터 ---------- */

// 좌표는 이미지 크기 대비 비율(0~1)의 사각형 {x,y,w,h}.
function cleanRegions(list) {
  if (!Array.isArray(list)) return null;
  const ok = list.map(r => ({x: +r?.x, y: +r?.y, w: +r?.w, h: +r?.h}))
    .filter(r => [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001);
  return ok.length ? ok : null;
}

// regions.json: {version, regions: {이미지경로: [정답 영역]}, explains: {이미지경로: [해설 영역]}}
// 정답 영역이 지정된 이미지 하나하나가 곧 문제입니다(문제 목록·정답 모두 이 파일 하나로 관리).
async function loadRegionData(root) {
  const res = await fetch(root + 'regions.json', {cache: 'no-store'});
  if (!res.ok) throw Error(res.status === 404 ? 'regions.json 파일이 없습니다.' : 'regions.json 응답 ' + res.status);
  const data = await res.json();
  if (!data || typeof data !== 'object') throw Error('regions.json 형식이 올바르지 않습니다.');
  if (!data.regions && !data.explains) return {regions: data, explains: {}}; // 예전 형식
  return {regions: data.regions || {}, explains: data.explains || {}};
}

function buildQuestions(root, areaData) {
  const list = [];
  for (const [rawKey, rects] of Object.entries(areaData.regions)) {
    const key = String(rawKey).replace(/^\.\//, '');
    const regions = cleanRegions(rects);
    if (!regions || /^(?:https?:|data:|\/\/)/i.test(key) || key.includes('..')) continue;
    const parts = key.split('/'), file = parts.pop();
    list.push({
      id: 'img:' + key.replace(/^images\//, ''),
      type: 'image',
      subject: file.replace(/\.[^.]+$/, ''),
      folder: parts.length > 1 ? parts[parts.length - 1] : '',
      questionImage: root + key,
      regions,
      explains: cleanRegions(areaData.explains[rawKey] ?? areaData.explains[key])
    });
  }
  return list.sort((a, b) => a.id.localeCompare(b.id, 'ko', {numeric: true}));
}

// regions.json에 남아 있지만 실제 파일은 지운 이미지를 미리 걸러냅니다(확인할 수 없으면 그대로 둠).
async function keepExisting(list) {
  const ok = await Promise.all(list.map(q =>
    fetch(q.questionImage, {method: 'HEAD', cache: 'no-store'}).then(r => r.status !== 404, () => true)));
  return list.filter((q, i) => ok[i]);
}

function showLoadError(message) {
  resetArchery();
  phase = 'finished';
  $('question-title').textContent = '문제를 불러오지 못했습니다';
  $('question-image').hidden = true;
  $('question-empty').textContent = message;
  setVisible('question-empty', true);
  setVisible('actions', false);
  setVisible('result', false);
  setArcheryEnabled(false);
}

async function loadSet(id) {
  resetArchery();
  currentSet = datasets.find(d => d.id === id) || datasets[0];
  $('dataset').value = currentSet.id;
  const root = currentSet.id === 'default' ? 'datasets/default/' : currentSet.path.replace(/[^/]*$/, '');
  let areaData;
  try {
    areaData = await loadRegionData(root);
  } catch (e) {
    showLoadError(location.protocol === 'file:'
      ? '파일을 직접 열면 브라우저가 문제 데이터를 막습니다. 실행.bat으로 열어 주세요.'
      : '문제 데이터를 읽지 못했습니다: ' + e.message);
    return false;
  }
  questions = await keepExisting(buildQuestions(root, areaData));
  if (!questions.length) {
    showLoadError('정답 위치가 지정된 문제가 없습니다. region-editor.html에서 문제 이미지마다 정답 영역을 지정해 주세요.');
    return false;
  }
  currentSet.version = '2';
  const ids = new Set(questions.map(q => q.id));
  const old = getStorage();
  if (old && old.set === currentSet.id && old.version === currentSet.version && old.queue.every(qid => ids.has(qid)) && old.total <= questions.length) {
    state = old;
    if (!state.pausedAt) { state.elapsed = nowElapsed(); state.pausedAt = Date.now(); }
    state.startedAt = Date.now();
    state.pausedAt = null;
    save();
    if (!state.queue.length) finish(); else showQuestion();
  } else {
    startNew();
  }
  return true;
}

async function init() {
  try {
    const res = await fetch('datasets/subjects.json', {cache: 'no-store'});
    if (!res.ok) throw Error();
    const data = await res.json();
    datasets = [{id: 'default', name: '기본 예시 문제', version: '1'}, ...data.filter(d => d.id && d.path && d.id !== 'default')];
  } catch {
    datasets = [{id: 'default', name: '기본 예시 문제', version: '1'}];
  }
  for (const d of datasets) {
    if (d.id === 'default') continue;
    const op = document.createElement('option');
    op.value = d.id;
    op.textContent = d.name || d.id;
    $('dataset').append(op);
  }
  const old = getStorage();
  await loadSet(old && datasets.some(d => d.id === old.set) ? old.set : 'default');
  clock = setInterval(tick, 1000);
}

/* ---------- 이미지 위 정답 위치 클릭 ---------- */

function imageBox() {
  const img = $('question-image'), well = $('question-well');
  if (img.hidden || !img.naturalWidth) return null;
  const r = img.getBoundingClientRect(), w0 = well.getBoundingClientRect();
  const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  const left = r.left + (r.width - w) / 2, top = r.top + (r.height - h) / 2;
  return {left, top, w, h, offsetX: left - w0.left - well.clientLeft, offsetY: top - w0.top - well.clientTop};
}

function layoutHitLayer() {
  const b = imageBox(), layer = $('hit-layer');
  if (!b) { layer.hidden = true; return; }
  layer.hidden = false;
  Object.assign(layer.style, {left: b.offsetX + 'px', top: b.offsetY + 'px', width: b.w + 'px', height: b.h + 'px'});
}

function clearHits() {
  $('hit-layer').replaceChildren();
  $('question-well').classList.remove('is-hittable');
}

function setHitMode(q) {
  const has = !!q.regions;
  $('question-well').classList.toggle('is-hittable', has);
  $('zoom-question').hidden = !has;
  $('question-hint').textContent = '이미지에서 정답 위치를 누르거나, 오른쪽 아래 활 버튼을 누른 채 드래그해 쏘세요. 🔍 버튼으로 크게 볼 수 있습니다.';
  layoutHitLayer();
}

function addHit(cls, style, text) {
  const el = document.createElement('span');
  el.className = cls;
  Object.assign(el.style, style);
  if (text) el.textContent = text;
  $('hit-layer').append(el);
  return el;
}

function revealRegions(q) {
  $('question-well').classList.remove('is-hittable');
  if (!q.regions) return;
  layoutHitLayer();
  for (const r of q.regions) addHit('hit-zone', {left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%'});
}

// 반환값: false = 처리 안 함(확대 보기), true = 처리함, {x,y} = 이미지 원본 기준 적중 좌표
function hitImage(e) {
  const q = currentQuestion();
  if (phase !== 'question' || !q?.regions) return false;
  const b = imageBox();
  if (!b) return true;
  const x = (e.clientX - b.left) / b.w, shownY = (e.clientY - b.top) / b.h;
  if (x < 0 || x > 1 || shownY < 0 || shownY > 1) return true;
  const y = toFullY(shownY);
  const region = q.regions.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  const correct = !!region;
  grade(q, correct, {x, y, shownY, region});
  addHit('hit-mark ' + (correct ? 'good' : 'bad'), {left: x * 100 + '%', top: y * 100 + '%'}, correct ? '✓' : '✗');
  return {x, y};
}

/* ---------- 이벤트 ---------- */

function advanceQuestion() {
  if (phase !== 'explanation') return;
  if (state.queue.length) showQuestion(); else finish();
}

function openLightbox(source) {
  if (!source.hidden && source.src) { $('lightbox-image').src = source.src; $('lightbox').showModal(); }
}

$('reveal').addEventListener('click', reveal);
$('skip').addEventListener('click', skip);
$('next').addEventListener('click', advanceQuestion);
$('next-top').addEventListener('click', advanceQuestion);
$('next-float').addEventListener('click', advanceQuestion);
$('apply').addEventListener('click', async () => {
  if (confirm('현재 학습 진행 상황을 초기화하고 새로 시작할까요?')) { localStorage.removeItem(KEY); await loadSet($('dataset').value); startNew(); }
});
$('dataset').addEventListener('change', async () => { await loadSet($('dataset').value); });
$('restart').addEventListener('click', () => { if (confirm('현재 세트를 처음부터 다시 학습할까요?')) startNew(); });
$('finish-restart').addEventListener('click', () => { startNew(); });
$('question-image').addEventListener('click', e => { if (!hitImage(e)) openLightbox($('question-image')); });
$('explanation-image').addEventListener('click', () => openLightbox($('explanation-image')));
$('zoom-question').addEventListener('click', () => openLightbox($('question-image')));
// 이미지 표시 크기: 원본 가로의 IMAGE_SCALE배로 보여주되, 문제 칸 너비(컨테이너 너비)보다 커지면 칸 너비에 맞춥니다(CSS max-width:100%).
const IMAGE_SCALE = 1.5;
function fitImage(img) { img.style.width = img.naturalWidth ? img.naturalWidth * IMAGE_SCALE + 'px' : ''; }
$('question-image').addEventListener('load', e => { fitImage(e.target); layoutHitLayer(); });
$('explanation-image').addEventListener('load', e => fitImage(e.target));
window.addEventListener('resize', layoutHitLayer);
if (window.ResizeObserver) {
  const ro = new ResizeObserver(layoutHitLayer);
  ro.observe($('question-well'));
  ro.observe($('question-image'));
}
$('close-lightbox').addEventListener('click', () => $('lightbox').close());
$('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) $('lightbox').close(); });
document.addEventListener('visibilitychange', () => {
  if (!state) return;
  if (document.hidden) { state.elapsed = nowElapsed(); state.pausedAt = Date.now(); save(); }
  else if (state.pausedAt && phase !== 'finished') { state.startedAt = Date.now(); state.pausedAt = null; }
});
window.addEventListener('pagehide', () => { if (state) { state.elapsed = nowElapsed(); state.pausedAt = Date.now(); save(); } });

init();
