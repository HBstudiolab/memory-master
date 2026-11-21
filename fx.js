'use strict';

/* 타격감 연출 · 불화살(피버) · 고스트 페이스메이커
 * - 정답: 맞힌 지점으로 카메라가 여러 번 줌인(펀치)하며 번쩍이고, 정답 영역의 잔상 테두리가 겹겹이 퍼짐 + 별가루 + 차임
 * - 오답: 문제 이미지 전체가 유리창처럼 금 가며 와장창 깨져 떨어지고 화면이 크게 흔들림
 * - 연속 정답 FEVER_AT회 이후의 문제는 불화살(크리티컬) 연출
 * - 화면 최상단 바: 러닝 페이스처럼 "1문제당 몇 초"로 표시. 👻 라이벌은 목표 페이스(PACE_MS/문제)로 달리고,
 *   오답·해설 보기마다 내 기록에 PENALTY_MS가 더해집니다.
 * (archery.js 뒤, app.js 앞에 로드됩니다. state·phase·$ 등은 app.js의 전역을 실행 시점에 참조합니다.)
 */

const FEVER_AT = 4;        // 이만큼 연속으로 맞히면 다음 문제부터 불화살
const PACE_MS = 35000;     // 목표 페이스: 1문제당 35초
const PENALTY_MS = 20000;  // 오답(또는 해설 보기) 1번마다 기록에 더해지는 시간
const CRACK_MS = 150;      // 오답: 유리에 금이 간 채 멈춰 있는 시간(히트스톱)

function isFever() {
  return !!state && phase !== 'finished' && (state.streak || 0) >= FEVER_AT;
}

function syncFever() {
  document.body.classList.toggle('is-fever', isFever());
}

function resetHitFx() {
  document.getElementById('question-well').classList.remove('is-burst', 'is-crit');
  document.getElementById('result').classList.remove('is-burst', 'is-crit');
}

// 이미지 위 비율 좌표(x, 보이는 이미지 기준 y) → 화면 좌표
function screenPoint(hit) {
  const box = imageBox();
  if (!box) return null;
  return {box, x: box.left + hit.x * box.w, y: box.top + hit.shownY * box.h};
}

// 화면 좌표에 고정된 효과 레이어(스크롤·overflow에 잘리지 않음)
function fxHost(cls, box, ms) {
  const host = document.createElement('div');
  host.className = cls;
  Object.assign(host.style, {left: box.left + 'px', top: box.top + 'px', width: box.w + 'px', height: box.h + 'px'});
  document.body.append(host);
  setTimeout(() => host.remove(), ms);
  return host;
}

/* ---------- 정답: 중복 카메라 펀치 ---------- */

// grade() 시작 시점(화면이 해설로 바뀌기 전)에 호출됩니다.
function hitFx(q, hit, fever) {
  const well = $('question-well');
  for (const node of [well, $('result')]) {
    node.classList.add('is-burst');
    node.classList.toggle('is-crit', fever);
  }
  sfx('chime');
  if (fever) sfx('fire');

  const p = hit && screenPoint(hit);
  const wr = well.getBoundingClientRect();
  well.style.transformOrigin = p ? `${p.x - wr.left}px ${p.y - wr.top}px` : '50% 50%';

  // 카메라가 맞힌 지점으로 3번 연속 줌인(점점 약하게) + 첫 펀치 때 좌우 4px 흔들림
  const k = fever ? 1.5 : 1;
  well.animate([
    {transform: 'scale(1)', filter: 'brightness(1) saturate(1)'},
    {transform: `scale(${1 + 0.05 * k}) translateX(-4px)`, filter: 'brightness(1.3) saturate(1.4)', offset: 0.07},
    {transform: `scale(${1 + 0.05 * k}) translateX(4px)`, offset: 0.13},
    {transform: 'scale(1)', filter: 'brightness(1) saturate(1)', offset: 0.28},
    {transform: `scale(${1 + 0.035 * k})`, filter: 'brightness(1.2) saturate(1.3)', offset: 0.4},
    {transform: 'scale(1)', filter: 'brightness(1) saturate(1)', offset: 0.55},
    {transform: `scale(${1 + 0.02 * k})`, filter: 'brightness(1.12) saturate(1.2)', offset: 0.68},
    {transform: 'scale(1)', filter: 'brightness(1) saturate(1)'}
  ], {duration: 1000, easing: 'ease-out'});

  // 펀치마다 카메라 플래시
  const flash = document.createElement('span');
  flash.className = 'cam-flash' + (fever ? ' is-crit' : '');
  well.append(flash);
  flash.animate([0, 0.55, 0, 0.4, 0, 0.25, 0].map((opacity, i) => ({opacity, offset: [0, 0.07, 0.28, 0.4, 0.55, 0.68, 1][i]})),
    {duration: 1000, fill: 'forwards'}).onfinish = () => flash.remove();
  well.animate([
    {boxShadow: '0 0 0 0 #22c55e00'},
    {boxShadow: `0 0 0 4px ${fever ? '#f97316' : '#22c55e'}, 0 0 34px ${fever ? '#f97316' : '#22c55e'}`, offset: 0.1},
    {boxShadow: '0 0 0 0 #22c55e00'}
  ], {duration: 1100, easing: 'ease-out', composite: 'add'});

  if (!p) return;
  const host = fxHost('cheer' + (fever ? ' is-crit' : ''), p.box, 1700);
  const X = hit.x * 100, Y = hit.shownY * 100;

  // 정답 영역 잔상 테두리: 카메라 펀치에 맞춰 3겹으로 퍼져 나감
  if (hit.region) {
    // 정답 영역은 원본 이미지 기준 좌표 → 해설을 잘라내고 보여주는 이미지 기준으로 환산
    const r = hit.region, keep = view?.keep || 1;
    for (let i = 0; i < 3; i++) {
      const echo = document.createElement('span');
      echo.className = 'cheer-echo';
      Object.assign(echo.style, {left: r.x * 100 + '%', width: r.w * 100 + '%', top: (hit.shownY - (hit.y - r.y) / keep) * 100 + '%', height: r.h / keep * 100 + '%'});
      host.append(echo);
      echo.animate([
        {transform: 'scale(1)', opacity: 0.95},
        {transform: `scale(${1.25 + i * 0.12})`, opacity: 0}
      ], {duration: 520, delay: [0, 280, 550][i], easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both'});
    }
  }

  // 별가루·반짝이
  for (let i = 0, n = fever ? 30 : 20; i < n; i++) {
    const star = document.createElement('span');
    star.className = 'cheer-star' + (i % 3 ? '' : ' big');
    Object.assign(star.style, {left: X + '%', top: Y + '%'});
    host.append(star);
    const dir = Math.random() * Math.PI * 2, far = 50 + Math.random() * (fever ? 140 : 100);
    star.animate([
      {transform: 'translate(0, 0) rotate(0deg) scale(.4)', opacity: 1},
      {transform: `translate(${Math.cos(dir) * far * 0.8}px, ${Math.sin(dir) * far * 0.8}px) rotate(120deg) scale(1.1)`, opacity: 1, offset: 0.55},
      {transform: `translate(${Math.cos(dir) * far}px, ${Math.sin(dir) * far + 25}px) rotate(200deg) scale(.2)`, opacity: 0}
    ], {duration: 700 + Math.random() * 400, delay: Math.random() * 120, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'both'});
  }
  host.insertAdjacentHTML('beforeend',
    `<span class="cheer-ring" style="left:${X}%;top:${Y}%"></span>` +
    `<span class="cheer-ring late" style="left:${X}%;top:${Y}%"></span>` +
    `<strong class="cheer-stamp" style="left:${X}%;top:${Y}%">${fever ? 'CRITICAL!' : '정답!'}</strong>`);
}

function feverBanner() {
  const banner = document.createElement('div');
  banner.className = 'fever-banner';
  banner.textContent = `🔥 ${FEVER_AT}연속 명중! 다음 화살은 불화살`;
  document.body.append(banner);
  setTimeout(() => banner.remove(), 1900);
}

/* ---------- 오답: 와장창 유리 ---------- */

function wrongFx(hit) {
  const p = screenPoint(hit);
  if (!p) return;
  const well = $('question-well');
  sfx('crash');

  // 히트스톱 뒤 화면이 크게 흔들리며 빨갛게 번쩍
  const shake = [0, -16, 14, -11, 9, -6, 4, -2, 0];
  well.animate(shake.map((x, i) => ({transform: `translate(${x}px, ${i % 2 ? x * 0.5 : -x * 0.3}px) rotate(${x * 0.08}deg)`})),
    {duration: 460, delay: CRACK_MS, easing: 'ease-out'});
  well.animate([
    {boxShadow: '0 0 0 0 #ef444400'},
    {boxShadow: '0 0 0 4px #ef4444, 0 0 40px #ef4444, inset 0 0 60px #ef444466', offset: 0.15},
    {boxShadow: '0 0 0 0 #ef444400'}
  ], {duration: 900, delay: CRACK_MS, easing: 'ease-out', composite: 'add'});

  smash(fxHost('shatter is-fixed is-window', p.box, CRACK_MS + 1800), hit.x, hit.shownY);
}

// host 전체를 유리창으로 보고, 충격점에서 방사형 + 동심원 균열로 쪼개 와장창 떨어뜨립니다.
function smash(host, ix, iy) {
  const w = host.offsetWidth, h = host.offsetHeight, X = ix * 100, Y = iy * 100;
  const ts = [0, 1, 2, 3];
  for (let i = 0; i < 14; i++) ts.push(Math.random() * 4);
  ts.sort((a, b) => a - b);
  const edge = ts.map(t => { const e = Math.floor(t) % 4, f = t - Math.floor(t); return [[f, 0], [1, f], [1 - f, 1], [0, 1 - f]][e].map(v => v * 100); });
  const ring = edge.map(([ex, ey]) => { const k = 0.22 + Math.random() * 0.25; return [X + (ex - X) * k, Y + (ey - Y) * k]; });
  const ring2 = edge.map(([ex, ey], i) => { const k = 0.55 + Math.random() * 0.2; return [X + (ex - X) * k, Y + (ey - Y) * k]; });

  const pieces = [];
  edge.forEach((_, i) => {
    const j = (i + 1) % edge.length;
    pieces.push({pts: [[X, Y], ring[i], ring[j]], inner: true});                 // 충격점 주변: 카메라 쪽으로 튀어나옴
    pieces.push({pts: [ring[i], ring2[i], ring2[j]]});
    pieces.push({pts: [ring[i], ring2[j], ring[j]]});
    pieces.push({pts: [ring2[i], edge[i], edge[j]]});
    pieces.push({pts: [ring2[i], edge[j], ring2[j]]});
  });

  let cracks = '';
  edge.forEach((e, i) => { cracks += `M${X} ${Y}L${ring[i][0]} ${ring[i][1]}L${ring2[i][0]} ${ring2[i][1]}L${e[0]} ${e[1]}`; });
  cracks += 'M' + ring.map(p => p.join(' ')).join('L') + 'Z';
  cracks += 'M' + ring2.map(p => p.join(' ')).join('L') + 'Z';

  for (const {pts, inner} of pieces) {
    const piece = document.createElement('span'), glass = document.createElement('i');
    piece.className = 'shatter-piece';
    glass.style.clipPath = `polygon(${pts.map(([a, b]) => `${a}% ${b}%`).join(', ')})`;
    piece.append(glass);
    host.append(piece);
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const dx = (cx - X) / 100 * w, dy = (cy - Y) / 100 * h, dist = Math.hypot(dx, dy) || 1;
    const spin = Math.random() * 540 - 270;
    piece.style.transformOrigin = `${cx}% ${cy}%`;
    // 충격점에서 먼 조각일수록 조금 늦게 무너짐
    const delay = CRACK_MS + Math.min(160, dist / Math.max(w, h) * 220) + Math.random() * 40;
    if (inner) {
      piece.animate([
        {transform: 'none', opacity: 1},
        {transform: `translate(${dx * 1.5}px, ${dy * 1.5}px) rotate(${spin}deg) scale(2.2)`, opacity: 0}
      ], {duration: 380 + Math.random() * 160, delay: CRACK_MS, easing: 'cubic-bezier(.1,.7,.4,1)', fill: 'both'});
    } else {
      const push = 20 + Math.random() * 50, fall = 260 + Math.random() * 260 + h * 0.3;
      piece.animate([
        {transform: 'none', opacity: 1},
        {transform: `translate(${dx / dist * push}px, ${dy / dist * push - 12}px) rotate(${spin * 0.15}deg)`, opacity: 1, offset: 0.18},
        {transform: `translate(${dx / dist * push * 2.2}px, ${fall * 0.35}px) rotate(${spin * 0.55}deg)`, opacity: 1, offset: 0.55},
        {transform: `translate(${dx / dist * push * 3}px, ${fall}px) rotate(${spin}deg) scale(.8)`, opacity: 0}
      ], {duration: 900 + Math.random() * 400, delay, easing: 'cubic-bezier(.35,0,.75,.6)', fill: 'both'});
    }
  }

  host.insertAdjacentHTML('beforeend',
    `<svg class="shatter-cracks" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${cracks}"/></svg>` +
    `<span class="shatter-flash" style="left:${X}%;top:${Y}%"></span>` +
    `<span class="shatter-x" style="left:${X}%;top:${Y}%">✗</span>`);
  host.querySelector('.shatter-cracks').animate([{opacity: 0}, {opacity: 1, offset: 0.08}, {opacity: 1, offset: 0.5}, {opacity: 0}],
    {duration: CRACK_MS + 260, fill: 'forwards'});

  // 잘게 부서진 유리 가루
  for (let i = 0; i < 34; i++) {
    const bit = document.createElement('span');
    bit.className = 'shatter-bit';
    Object.assign(bit.style, {left: X + '%', top: Y + '%', width: 3 + Math.random() * 7 + 'px', height: 3 + Math.random() * 7 + 'px'});
    host.append(bit);
    const dir = Math.random() * Math.PI * 2, far = 60 + Math.random() * 160;
    bit.animate([
      {transform: 'translate(0, 0) rotate(0deg)', opacity: 1},
      {transform: `translate(${Math.cos(dir) * far * 0.6}px, ${Math.sin(dir) * far * 0.6}px) rotate(200deg)`, opacity: 1, offset: 0.35},
      {transform: `translate(${Math.cos(dir) * far}px, ${Math.sin(dir) * far * 0.6 + 240 + Math.random() * 120}px) rotate(500deg)`, opacity: 0}
    ], {duration: 800 + Math.random() * 400, delay: CRACK_MS * 0.6, easing: 'cubic-bezier(.3,.3,.7,1)', fill: 'both'});
  }
}

/* ---------- 고스트 페이스메이커(러닝 페이스) ---------- */

const pacer = document.createElement('div');
pacer.className = 'pacer';
pacer.hidden = true;
pacer.setAttribute('aria-label', '고스트 페이스메이커');
pacer.innerHTML = `
  <span class="pacer-light" aria-hidden="true"></span>
  <span class="pacer-label">PACE</span>
  <div class="pacer-track" aria-hidden="true">
    <span class="pacer-fill"></span>
    <span class="pacer-runner rival" title="라이벌(목표 페이스)"><span>👻</span></span>
    <span class="pacer-runner me" title="나"><span><i>🏃</i></span></span>
  </div>
  <span class="pacer-combo" hidden></span>
  <span class="pacer-pace"><b></b><small>/문제</small></span>
  <span class="pacer-goal"></span>
  <span class="pacer-diff"></span>
  <span class="pacer-text"></span>`;
document.body.prepend(pacer);
const pq = name => pacer.querySelector('.pacer-' + name);
const [pacerFill, pacerMe, pacerRival, pacerCombo, pacerPace, pacerGoal, pacerDiff, pacerText] =
  ['fill', 'runner.me', 'runner.rival', 'combo', 'pace b', 'goal', 'diff', 'text'].map(pq);
let pacerFor = null, pacerStatus = '';

// 러닝 페이스 표기: 42초 → 0'42"
const paceText = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`; };

// 오답·해설 보기: 내 기록에 시간을 더합니다(라이벌이 그만큼 앞으로 달아남).
function penalize() {
  if (!state) return;
  state.penalty = (state.penalty || 0) + PENALTY_MS;
  const pop = document.createElement('span');
  pop.className = 'pacer-penalty';
  pop.textContent = `+${PENALTY_MS / 1000}초`;
  pacer.append(pop);
  setTimeout(() => pop.remove(), 1400);
  pacer.animate([{background: '#991b1b'}, {background: '#0f172aeb'}], {duration: 600});
  updatePacer();
}

function updatePacer() {
  if (!state) return;
  if (pacerFor !== state) { pacerFor = state; pacerStatus = ''; }
  const total = Math.max(1, state.total);
  const me = state.total - state.queue.length;
  const spent = nowElapsed() + (state.penalty || 0);            // 내 기록(학습 시간 + 페널티)
  const rival = Math.min(state.total, spent / PACE_MS);         // 목표 페이스로 달렸다면 지금쯤 푼 문제 수
  const gapSec = Math.round((me * PACE_MS - spent) / 1000);      // +면 목표보다 그만큼 빠름
  const status = me >= state.total || gapSec > 0 ? 'ahead' : gapSec < 0 ? 'behind' : 'tie';
  pacer.hidden = false;
  document.body.classList.add('has-pacer');
  pacerFill.style.width = pacerMe.style.left = me / total * 100 + '%';
  pacerRival.style.left = rival / total * 100 + '%';

  const pace = me ? spent / me : null;
  pacerPace.textContent = pace ? paceText(pace) : `-'--"`;
  pacerPace.parentElement.dataset.speed = !pace ? '' : pace <= PACE_MS ? 'fast' : 'slow';
  pacerGoal.textContent = `목표 ${paceText(PACE_MS)}`;
  // 페이스 차이: 1문제당 목표보다 몇 초 느린지/빠른지
  const diffSec = pace ? Math.round((pace - PACE_MS) / 1000) : 0;
  pacerDiff.hidden = !pace;
  pacerDiff.dataset.speed = diffSec > 0 ? 'slow' : diffSec < 0 ? 'fast' : '';
  pacerDiff.textContent = diffSec > 0 ? `문제당 ${diffSec}초 느림` : diffSec < 0 ? `문제당 ${-diffSec}초 빠름` : '목표 페이스';
  pacerText.textContent = gapSec > 0 ? `${gapSec}초 앞섬` : gapSec < 0 ? `${-gapSec}초 뒤처짐` : '동률';

  const streak = state.streak || 0;
  pacerCombo.hidden = streak < 2;
  pacerCombo.textContent = `🔥 ${streak}연속`;
  pacerCombo.classList.toggle('is-fever', streak >= FEVER_AT);
  if (status !== pacerStatus) {
    // 추월하거나 추월당한 순간 바 전체가 번쩍입니다.
    if (pacerStatus && status !== 'tie') {
      const color = status === 'ahead' ? '#166534' : '#991b1b';
      pacer.animate([{background: color}, {background: '#0f172aeb'}, {background: color}, {background: '#0f172aeb'}], {duration: 900});
    }
    pacerStatus = status;
    pacer.dataset.status = status;
  }
}
