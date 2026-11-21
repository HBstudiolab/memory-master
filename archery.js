'use strict';

/* 1인칭 활쏘기 조준
 * 활 버튼을 누른 채 드래그 → 스코프 시점에서 문제 이미지를 조준(당길수록 줌인),
 * 손을 떼면 화살이 날아가 십자선 위치에 꽂히고, 그 지점을 클릭한 것과 같은 효과가 납니다.
 */

const launch = document.getElementById('archery-launch');
const questionPanel = document.querySelector('.question-panel');
// 활쏘기 연출은 사용자가 직접 실행하는 효과이므로 OS의 '애니메이션 효과 끄기' 설정과 관계없이 재생합니다.

const ZOOM_START = 1;     // 처음 시점 배율
const ZOOM_DRAWN = 1.3;   // 활을 다 당겼을 때 배율
const ZOOM_MIN = 1;
const ZOOM_MAX = 2;
const UNZOOM_MS = 280;    // 손을 뗀 뒤 줌이 풀리는 시간(그 다음 화살 발사)
const SOUND = true;       // 발사·적중 효과음 (false로 끄기)
const FLIGHT_MS = 200;    // 화살 비행 시간
const HITSTOP_MS = 90;    // 적중 순간 화면이 멈추는 시간(히트스톱)
const HITSTOP_FEVER_MS = 160;

// 화살 그래픽(오른쪽 끝이 화살촉): 카본 샤프트 + 강철 광폭 화살촉 + 큰 깃
const ARROW_SVG = `
<svg viewBox="0 0 300 40" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">
  <defs>
    <linearGradient id="arw-steel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f8fafc"/><stop offset=".45" stop-color="#cbd5e1"/><stop offset=".55" stop-color="#64748b"/><stop offset="1" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="arw-shaft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#475569"/><stop offset=".3" stop-color="#e2e8f0"/><stop offset=".6" stop-color="#1e293b"/><stop offset="1" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="arw-vane" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7f1d1d"/><stop offset="1" stop-color="#ef4444"/>
    </linearGradient>
  </defs>
  <path d="M6 1 L60 17 L72 20 L60 23 L6 39 L24 20Z" fill="url(#arw-vane)" stroke="#450a0a" stroke-width="1"/>
  <path d="M16 6 L48 16.5 M16 34 L48 23.5" stroke="#fef2f2" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="10" y="16.5" width="222" height="7" rx="3.5" fill="url(#arw-shaft)"/>
  <rect x="0" y="17" width="14" height="6" rx="2" fill="#fbbf24"/>
  <rect x="200" y="15" width="34" height="10" rx="2" fill="#b45309"/>
  <rect x="200" y="15" width="34" height="3" fill="#fde68a"/>
  <path d="M224 3 L300 20 L224 37 L240 20Z" fill="url(#arw-steel)" stroke="#0f172a" stroke-width="1.2"/>
  <path d="M228 6 L296 19.5" stroke="#fff" stroke-width="1.6" opacity=".9"/>
  <path d="M240 20 H298" stroke="#fff" stroke-width="1" opacity=".6"/>
</svg>`;
const MIN_DRAW_MS = 300;  // 이보다 짧게 누르면 발사하지 않음
const SENSITIVITY = 2;    // 드래그 거리 → 조준 이동량
const GRIP = {x: 165 / 400, y: 380 / 500}; // 활 SVG 안의 손잡이 위치(비율)

const BOW_SVG = `
<svg class="fps-bow" viewBox="0 0 400 500" aria-hidden="true">
  <defs>
    <linearGradient id="fps-wood" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#5a3216"/><stop offset=".45" stop-color="#9a6531"/><stop offset=".55" stop-color="#7a4a22"/><stop offset="1" stop-color="#4d2a10"/>
    </linearGradient>
    <linearGradient id="fps-skin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f0c29f"/><stop offset="1" stop-color="#c78763"/>
    </linearGradient>
  </defs>
  <g class="fps-string drawn"><path d="M430 -40 L330 620 M95 560 L330 620"/></g>
  <g class="fps-string loose"><path d="M430 -40 L95 560"/></g>
  <path d="M-20 560 L105 395 L190 420 L130 560 Z" fill="url(#fps-skin)"/>
  <path d="M95 560 C120 500 140 440 165 390 C230 260 330 90 430 -40" fill="none" stroke="#2a1607" stroke-width="30" stroke-linecap="round"/>
  <path d="M95 560 C120 500 140 440 165 390 C230 260 330 90 430 -40" fill="none" stroke="url(#fps-wood)" stroke-width="23" stroke-linecap="round"/>
  <path d="M104 560 C128 500 146 445 170 395 C234 266 332 98 430 -28" fill="none" stroke="#d6a36a" stroke-opacity=".35" stroke-width="4"/>
  <rect x="-17" y="-48" width="34" height="96" rx="14" fill="#2b211b" transform="translate(162 398) rotate(22)"/>
  <g transform="translate(160 410) rotate(22)">
    <rect x="-36" y="-26" width="64" height="64" rx="24" fill="url(#fps-skin)"/>
    <path d="M-34 -6 H24 M-34 10 H24 M-32 26 H20" stroke="#9c5f42" stroke-opacity=".45" stroke-width="2.5" stroke-linecap="round"/>
    <ellipse cx="20" cy="-30" rx="11" ry="20" transform="rotate(35 20 -30)" fill="url(#fps-skin)" stroke="#9c5f42" stroke-opacity=".35"/>
  </g>
</svg>`;

const fps = document.createElement('div');
fps.className = 'fps';
fps.hidden = true;
fps.setAttribute('aria-hidden', 'true');
fps.innerHTML = `
  <div class="fps-world"><div class="fps-board"></div></div>
  <div class="fps-scope"></div>
  <div class="fps-speed"></div>
  <svg class="fps-reticle"></svg>
  <span class="fps-trail" hidden></span>
  <div class="fps-fx"></div>
  <div class="fps-impact" hidden>
    <span class="fps-blaze"></span><span class="fps-shockwave"></span><span class="fps-flash"></span><span class="fps-hole"></span><span class="fps-ring"></span><span class="fps-ring late"></span>
    <span class="fps-stuck"><span>${ARROW_SVG}</span></span>
    <strong class="fps-crit">CRITICAL!</strong>
  </div>
  <span class="fps-arrow" hidden><span><i class="fps-aura"></i>${ARROW_SVG}<i class="fps-fire"></i></span></span>
  <span class="fps-arrow fps-ghost" hidden><span>${ARROW_SVG}</span></span>
  <span class="fps-arrow fps-ghost" hidden><span>${ARROW_SVG}</span></span>
  ${BOW_SVG}
  <div class="fps-hud"><strong class="fps-zoom"></strong><span class="fps-hint"></span></div>`;
document.body.append(fps);

const toastEl = document.createElement('div');
toastEl.className = 'fps-toast';
toastEl.hidden = true;
toastEl.setAttribute('role', 'status');
document.body.append(toastEl);

const el = name => fps.querySelector('.fps-' + name);
const world = el('world'), board = el('board'), reticle = el('reticle'), bow = el('bow');
const impact = el('impact'), arrow = el('arrow'), zoomLabel = el('zoom'), hint = el('hint');
const trail = el('trail'), stuck = el('stuck'), speed = el('speed'), fxLayer = el('fx');
const ghosts = [...fps.querySelectorAll('.fps-ghost')];

// 효과음: 파일 없이 Web Audio로 합성합니다.
let audio = null, noiseBuffer = null;
function sfx(kind) {
  if (!SOUND) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const c = audio, t = c.currentTime;
    if (!noiseBuffer) {
      noiseBuffer = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    // delay: 지금부터 몇 초 뒤에 재생할지
    const noise = (dur, type, from, to, vol, delay = 0) => {
      const src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain(), s = t + delay;
      src.buffer = noiseBuffer;
      filter.type = type;
      filter.frequency.setValueAtTime(from, s);
      filter.frequency.exponentialRampToValueAtTime(to, s + dur);
      gain.gain.setValueAtTime(vol, s);
      gain.gain.exponentialRampToValueAtTime(0.001, s + dur);
      src.connect(filter).connect(gain).connect(c.destination);
      src.start(s);
      src.stop(s + dur);
    };
    const tone = (type, from, to, dur, vol, delay = 0) => {
      const osc = c.createOscillator(), gain = c.createGain(), s = t + delay;
      osc.type = type;
      osc.frequency.setValueAtTime(from, s);
      osc.frequency.exponentialRampToValueAtTime(to, s + dur * 0.8);
      gain.gain.setValueAtTime(vol, s);
      gain.gain.exponentialRampToValueAtTime(0.001, s + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(s); osc.stop(s + dur + 0.01);
    };
    if (kind === 'crash') {
      // 와장창: 금 가는 소리 → 크게 깨짐 → 유리 조각들이 떨어지며 짤랑짤랑
      noise(0.08, 'highpass', 4000, 2500, 0.5);
      tone('sine', 150, 40, 0.3, 0.7, 0.15);
      noise(0.4, 'highpass', 7000, 1800, 0.7, 0.15);
      noise(0.35, 'bandpass', 2500, 600, 0.45, 0.17);
      for (let i = 0; i < 22; i++) {
        const f = 2000 + Math.random() * 5000;
        tone('sine', f, f * 0.97, 0.12 + Math.random() * 0.15, 0.05 + Math.random() * 0.07, 0.16 + Math.pow(Math.random(), 1.6) * 0.9);
      }
      noise(0.25, 'highpass', 6000, 3000, 0.25, 0.55);
      noise(0.2, 'highpass', 6000, 3000, 0.18, 0.8);
    } else if (kind === 'chime') {
      // 딩-동-댕-딩! 밝은 장조 아르페지오 + 반짝임
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        tone('triangle', f, f, 0.45, 0.22, i * 0.075);
        tone('sine', f * 2, f * 2, 0.3, 0.06, i * 0.075);
      });
      tone('triangle', 1318.5, 1318.5, 0.6, 0.16, 0.32);
      for (let i = 0; i < 6; i++) tone('sine', 3000 + Math.random() * 2500, 3000, 0.12, 0.04, 0.3 + i * 0.05);
    } else if (kind === 'fire') {
      noise(0.4, 'lowpass', 2000, 150, 0.6);               // 화르륵
      noise(0.3, 'bandpass', 900, 3200, 0.22);
    } else if (kind === 'release') {
      noise(0.4, 'bandpass', 4200, 250, 0.55);             // 쉬이익(길고 굵은 바람 소리)
      noise(0.12, 'highpass', 5000, 2000, 0.3);            // 공기 찢는 소리
      tone('triangle', 220, 70, 0.16, 0.35);               // 시위 튕기는 소리
      tone('sine', 120, 32, 0.45, 0.7);                    // 쿵(발사 반동 저음)
    } else {
      tone('sine', 190, 38, 0.32, 0.9);                    // 쾅
      tone('square', 80, 30, 0.12, 0.18);                  // 둔탁한 타격
      noise(0.1, 'highpass', 3500, 1200, 0.6);             // 탁
      noise(0.4, 'lowpass', 900, 60, 0.5);                 // 우르릉 잔향
    }
  } catch {}
}

let aim = null;      // 조준 중 상태
let shot = null;     // 발사 연출 중 상태
let toastTimer = 0;

function setArcheryEnabled(enabled) {
  launch.disabled = !enabled;
}

function closeScope() {
  if (aim) {
    cancelAnimationFrame(aim.frame);
    if (launch.hasPointerCapture?.(aim.pointerId)) launch.releasePointerCapture(aim.pointerId);
  }
  aim = null;
  fps.hidden = true;
  fps.classList.remove('is-released', 'is-closing', 'is-unzoomed', 'is-hitstop');
  impact.hidden = true;
  arrow.hidden = true;
  ghosts.forEach(g => { g.hidden = true; });
  trail.hidden = true;
  fxLayer.replaceChildren();
  impact.querySelectorAll('.fps-chip').forEach(node => node.remove());
  board.replaceChildren();
  document.body.classList.remove('is-aiming');
  window.removeEventListener('wheel', onWheel);
}

function resetArchery() {
  if (shot) {
    shot.timers.forEach(clearTimeout);
    shot.animations.forEach(a => a.cancel());
    cancelAnimationFrame(shot.frame);
  }
  shot = null;
  closeScope();
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1800);
}

function drawReticle() {
  const w = innerWidth, h = innerHeight, cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) / 2 * 0.94;
  const step = r / 12;
  let ticks = '';
  for (let i = -11; i <= 11; i++) {
    if (!i) continue;
    const len = i % 2 ? 5 : 10;
    ticks += `M${cx + i * step} ${cy - len} V${cy + len} M${cx - len} ${cy + i * step} H${cx + len} `;
  }
  const gap = 22;
  reticle.setAttribute('viewBox', `0 0 ${w} ${h}`);
  reticle.innerHTML = `
    <g class="halo"><path d="M${cx - r} ${cy} H${cx + r} M${cx} ${cy - r} V${cy + r} ${ticks}"/></g>
    <g class="line"><path d="M${cx - r} ${cy} H${cx + r} M${cx} ${cy - r} V${cy + r} ${ticks}"/></g>
    <g class="post">
      <path d="M${cx - r} ${cy} H${cx - r * 0.55} M${cx + r * 0.55} ${cy} H${cx + r} M${cx} ${cy + r * 0.55} V${cy + r}"/>
    </g>
    <g class="center">
      <circle cx="${cx}" cy="${cy}" r="22"/>
      <circle class="dot" cx="${cx}" cy="${cy}" r="2.5"/>
      <path d="M${cx - 40} ${cy} H${cx - gap / 2} M${cx + gap / 2} ${cy} H${cx + 40} M${cx} ${cy - 40} V${cy - gap / 2} M${cx} ${cy + gap / 2} V${cy + 40}"/>
    </g>`;
}

function swayAt(t) {
  return {x: Math.sin(t / 650) * 2.2 + Math.sin(t / 270) * 0.8, y: Math.cos(t / 830) * 1.8 + Math.sin(t / 340) * 0.6};
}

function aimedPoint(t = performance.now()) {
  if (aim.frozen) return aim.frozen;
  const s = swayAt(t);
  return {x: aim.x + s.x, y: aim.y + s.y};
}

function render(t) {
  if (!aim) return;
  aim.zoom += (aim.zoomTarget - aim.zoom) * (aim.frozen ? 0.3 : 0.12);
  const p = aimedPoint(t);
  const z = aim.zoom;
  board.style.transform = `translate(${innerWidth / 2 - p.x * z}px, ${innerHeight / 2 - p.y * z}px) scale(${z})`;
  zoomLabel.textContent = `×${z.toFixed(1)}`;
  aim.frame = requestAnimationFrame(render);
}

function startPoint(panel) {
  // 문제 이미지 하단 중앙과 활 버튼 중앙의 한가운데에서 조준을 시작합니다.
  const img = document.getElementById('question-image');
  const bow = launch.getBoundingClientRect();
  const r = !img.hidden && img.naturalWidth ? img.getBoundingClientRect() : panel;
  const x = (r.left + r.width / 2 + bow.left + bow.width / 2) / 2 - panel.left;
  const y = (r.bottom + bow.top + bow.height / 2) / 2 - panel.top;
  return {x: Math.max(0, Math.min(panel.width, x)), y: Math.max(0, Math.min(panel.height, y))};
}

function openScope(event) {
  const panel = questionPanel.getBoundingClientRect();
  const copy = questionPanel.cloneNode(true);
  copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  copy.querySelectorAll('.zoom-button').forEach(node => node.remove());
  copy.classList.add('fps-copy');
  copy.style.width = `${panel.width}px`;
  board.replaceChildren(copy);

  const start = startPoint(panel);
  aim = {
    pointerId: event.pointerId,
    lastX: event.clientX,
    lastY: event.clientY,
    startedAt: performance.now(),
    x: start.x,
    y: start.y,
    width: panel.width,
    height: panel.height,
    zoom: ZOOM_START,
    zoomTarget: ZOOM_DRAWN,
    frame: 0
  };
  const fever = typeof isFever === 'function' && isFever();
  fps.classList.toggle('is-fever', fever);
  hint.textContent = (fever ? '🔥 불화살 · ' : '') + '드래그해서 조준 · 손을 떼면 발사' + (matchMedia('(pointer: fine)').matches ? ' · 휠로 줌' : '');
  drawReticle();
  fps.hidden = false;
  document.body.classList.add('is-aiming');
  launch.setPointerCapture(event.pointerId);
  window.addEventListener('wheel', onWheel, {passive: false});
  aim.frame = requestAnimationFrame(render);
}

function onWheel(event) {
  if (!aim) return;
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
  aim.zoomTarget = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, aim.zoomTarget * factor));
}

launch.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || aim || shot || phase !== 'question' || !currentQuestion()) return;
  event.preventDefault();
  openScope(event);
});

launch.addEventListener('pointermove', event => {
  if (event.pointerId !== aim?.pointerId) return;
  const k = SENSITIVITY / Math.sqrt(aim.zoom);
  aim.x = Math.max(0, Math.min(aim.width, aim.x + (event.clientX - aim.lastX) * k));
  aim.y = Math.max(0, Math.min(aim.height, aim.y + (event.clientY - aim.lastY) * k));
  aim.lastX = event.clientX;
  aim.lastY = event.clientY;
});

launch.addEventListener('pointerup', event => {
  if (event.pointerId !== aim?.pointerId) return;
  if (performance.now() - aim.startedAt < MIN_DRAW_MS) {
    closeScope();
    toast('활 버튼을 누른 채로 드래그해서 조준하세요.');
    return;
  }
  shoot();
});

for (const type of ['pointercancel', 'lostpointercapture']) {
  launch.addEventListener(type, event => {
    if (event.pointerId === aim?.pointerId && !shot) closeScope();
  });
}

launch.addEventListener('click', event => {
  if (event.detail === 0) toast('활 버튼을 마우스나 손가락으로 누른 채 드래그해서 조준하세요. 이미지를 직접 눌러도 됩니다.');
});

window.addEventListener('resize', () => { if (aim && !shot) closeScope(); });
window.addEventListener('blur', () => { if (aim && !shot) closeScope(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && aim && !shot) closeScope();
});

function focusNext() {
  if (phase !== 'explanation') return;
  const top = document.getElementById('next-top');
  (top.hidden ? document.getElementById('next') : top).focus({preventScroll: true});
}

function shoot() {
  const point = aimedPoint();
  if (launch.hasPointerCapture?.(aim.pointerId)) launch.releasePointerCapture(aim.pointerId);

  shot = {timers: [], animations: [], frame: 0};
  const run = (node, frames, options) => { const a = node.animate(frames, options); shot.animations.push(a); return a; };
  const cx = innerWidth / 2, cy = innerHeight / 2;
  const b = bow.getBoundingClientRect();
  const sx = b.left + b.width * GRIP.x, sy = b.top + b.height * GRIP.y;
  const angle = Math.atan2(cy - sy, cx - sx);
  const dist = Math.hypot(cx - sx, cy - sy);
  const pose = (x, y, s) => `translate(${x}px, ${y}px) rotate(${angle}rad) scale(${s})`;

  // 0) 손을 떼면 조준점을 고정한 채 줌이 먼저 풀리고, 그 다음 발사
  aim.frozen = point;
  aim.zoomTarget = 1;
  fps.classList.add('is-unzoomed');
  shot.timers.push(setTimeout(fire, UNZOOM_MS));

  function fire() {
    if (!shot || !aim) return;
    const fever = fps.classList.contains('is-fever');
    aim.zoom = aim.zoomTarget;
    render(performance.now());
    cancelAnimationFrame(aim.frame);

    // 1) 발사: 시위가 풀리고 화살이 바람·속도선·잔상을 남기며 날아감
    fps.classList.add('is-released');
    sfx('release');
    if (fever) sfx('fire');
    Object.assign(trail.style, {left: `${sx}px`, top: `${sy}px`, width: `${dist}px`, rotate: `${angle}rad`});
    trail.hidden = false;
    run(trail, [{scale: '0 1', opacity: 1}, {scale: '1 1', opacity: 0.9, offset: 0.5}, {scale: '1 0.2', opacity: 0}],
      {duration: 380, easing: 'ease-out', fill: 'forwards'});
    run(speed, [{opacity: 0, scale: 1.4, rotate: '0deg'}, {opacity: 1, scale: 1.1, offset: 0.2}, {opacity: 0, scale: 0.95, rotate: '4deg'}],
      {duration: 480, easing: 'ease-out'});

    const at = t => ({x: sx + (cx - sx) * t, y: sy + (cy - sy) * t}); // 비행 경로 위의 점(0=활, 1=과녁)
    const fx = (cls, x, y, style = {}) => {
      const node = document.createElement('span');
      node.className = cls;
      Object.assign(node.style, {left: `${x}px`, top: `${y}px`}, style);
      fxLayer.append(node);
      return node;
    };

    // 발사 순간: 활 앞 폭발 섬광 + 하얀 화면 플래시 + 카메라가 과녁 쪽으로 돌진
    run(fx('fps-muzzle', sx, sy), [{transform: 'scale(.2)', opacity: 1}, {transform: 'scale(2.2)', opacity: 0}],
      {duration: 320, easing: 'ease-out', fill: 'forwards'});
    run(fx('fps-screenflash', 0, 0), [{opacity: fever ? 0.7 : 0.5}, {opacity: 0}], {duration: 140, fill: 'forwards'});
    run(world, [{scale: 1, translate: '0 0'}, {scale: 0.97, translate: '0 8px', offset: 0.15}, {scale: 1.08, translate: '0 0'}],
      {duration: FLIGHT_MS, easing: 'ease-in'});

    // 음속 충격파(큰 고리)와 소용돌이(작은 고리): 화살이 지나가는 순간 경로에 수직으로 퍼짐
    for (let i = 0; i < 12; i++) {
      const t = 0.06 + i * 0.075, big = i % 4 === 1, p = at(t), size = (big ? 190 : 80) * (1 - t * 0.6);
      run(fx('fps-ring2' + (big ? ' big' : ''), p.x, p.y, {width: `${size * 0.32}px`, height: `${size}px`, margin: `${-size / 2}px 0 0 ${-size * 0.16}px`}), [
        {transform: `rotate(${angle}rad) scale(.25)`, opacity: 0},
        {transform: `rotate(${angle}rad) scale(.7)`, opacity: 1, offset: 0.15},
        {transform: `rotate(${angle}rad) scale(${big ? 1.9 : 1.3})`, opacity: 0}
      ], {duration: big ? 460 : 300, delay: t * FLIGHT_MS, easing: 'ease-out', fill: 'both'});
    }

    // 경로 양옆으로 튀는 불티·공기 파편
    for (let i = 0, n = fever ? 26 : 18; i < n; i++) {
      const t = Math.random() * 0.9, p = at(t), side = Math.random() < 0.5 ? -1 : 1, far = 30 + Math.random() * 80 * (1 - t * 0.5);
      const nx = -Math.sin(angle) * side * far + Math.cos(angle) * 30, ny = Math.cos(angle) * side * far + Math.sin(angle) * 30;
      run(fx('fps-ember', p.x, p.y), [
        {transform: 'translate(0, 0) scale(1)', opacity: 0},
        {opacity: 1, offset: 0.1},
        {transform: `translate(${nx}px, ${ny}px) scale(.2)`, opacity: 0}
      ], {duration: 260 + Math.random() * 220, delay: t * FLIGHT_MS, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'both'});
    }
    for (let i = 0, n = fever ? 16 : 11; i < n; i++) {
      const line = document.createElement('span');
      line.className = 'fps-wind';
      const along = Math.random() * 0.55, side = (Math.random() - 0.5) * (40 + along * 100);
      Object.assign(line.style, {
        left: `${sx + Math.cos(angle) * dist * along - Math.sin(angle) * side}px`,
        top: `${sy + Math.sin(angle) * dist * along + Math.cos(angle) * side}px`,
        width: `${dist * (0.25 + Math.random() * 0.3)}px`
      });
      fxLayer.append(line);
      run(line, [
        {transform: `rotate(${angle}rad) translateX(0) scaleX(.1)`, opacity: 0},
        {opacity: 0.9, offset: 0.25},
        {transform: `rotate(${angle}rad) translateX(${dist * 0.45}px) scaleX(1)`, opacity: 0}
      ], {duration: 280 + Math.random() * 160, delay: i * 10, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'both'});
    }
    // 화살은 강하게 진동하며(가까울수록 크게) 원근감 있게 작아지면서 날아감
    const frames = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t, i) => {
      const p = at(t), j = (i % 2 ? 1 : -1) * (1 - t) * (fever ? 6 : 4) * (i && i < 5 ? 1 : 0);
      return {transform: pose(p.x - Math.sin(angle) * j, p.y + Math.cos(angle) * j, 1.3 - t)};
    });
    const timing = {duration: FLIGHT_MS, easing: 'cubic-bezier(.3,.6,.6,1)', fill: 'both'};
    ghosts.forEach((g, i) => { g.hidden = false; run(g, frames, {...timing, delay: (i + 1) * 22}); });
    arrow.hidden = false;
    const flight = run(arrow, frames, timing);

    // 2) 적중: 히트스톱(적중 프레임에서 잠깐 정지) → 화살 떨림·파편·화면 흔들림
    flight.onfinish = () => {
      if (!shot) return;
      arrow.hidden = true;
      ghosts.forEach(g => { g.hidden = true; });
      impact.hidden = false;
      sfx('hit');
      stuck.style.rotate = `${angle}rad`;
      // 과녁에 방사형 균열
      let cracks = '';
      for (let i = 0, n = fever ? 11 : 8; i < n; i++) {
        const d = (i / n + Math.random() * 0.08) * Math.PI * 2, r1 = 14, r2 = 60 + Math.random() * (fever ? 130 : 90);
        const mx = Math.cos(d + 0.15) * r2 * 0.55, my = Math.sin(d + 0.15) * r2 * 0.55;
        cracks += `M${Math.cos(d) * r1} ${Math.sin(d) * r1} L${mx} ${my} L${Math.cos(d) * r2} ${Math.sin(d) * r2} `;
      }
      const crackSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      crackSvg.setAttribute('class', 'fps-cracks');
      crackSvg.setAttribute('viewBox', '-200 -200 400 400');
      crackSvg.innerHTML = `<path d="${cracks}"/>`;
      Object.assign(crackSvg.style, {left: `${cx}px`, top: `${cy}px`});
      fxLayer.append(crackSvg);
      fps.classList.add('is-hitstop');
      shot.timers.push(setTimeout(afterHitstop, fever ? HITSTOP_FEVER_MS : HITSTOP_MS));
    };

    function afterHitstop() {
      if (!shot) return;
      fps.classList.remove('is-hitstop');
      const k = fever ? 1.8 : 1;
      run(stuck, [0, .2, -.15, .1, -.06, .035, -.015, 0].map(d => ({rotate: `${angle + d}rad`})),
        {duration: 650, easing: 'ease-out'});
      run(stuck.firstElementChild, [{translate: '-28px 0'}, {translate: '0 0'}], {duration: 70, easing: 'ease-out'});
      run(world, [
        {translate: '0 0', scale: 1},
        {translate: `${-12 * k}px ${8 * k}px`, scale: 1 + 0.05 * k},
        {translate: `${9 * k}px ${-6 * k}px`, scale: 1 + 0.035 * k},
        {translate: `${-5 * k}px ${3 * k}px`, scale: 1 + 0.02 * k},
        {translate: `${2 * k}px ${-1 * k}px`, scale: 1.008},
        {translate: '0 0', scale: 1}
      ], {duration: fever ? 520 : 420, easing: 'ease-out'});
      for (let i = 0, n = fever ? 30 : 14; i < n; i++) {
        const chip = document.createElement('span');
        chip.className = 'fps-chip' + (fever ? (i % 4 ? ' spark' : '') : (i % 3 ? '' : ' spark'));
        impact.append(chip);
        const dir = Math.random() * Math.PI * 2, far = (fever ? 70 : 45) + Math.random() * (fever ? 120 : 75);
        run(chip, [
          {translate: '0 0', rotate: '0deg', opacity: 1},
          {translate: `${Math.cos(dir) * far}px ${Math.sin(dir) * far + 25}px`, rotate: `${Math.random() * 540 - 270}deg`, opacity: 0}
        ], {duration: 420 + Math.random() * 200, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'forwards'});
      }

      // 3) 잠시 보여준 뒤 닫고, 그 지점을 클릭한 것과 같은 효과 적용
      const hold = fever ? 200 : 0;
      shot.timers.push(setTimeout(() => fps.classList.add('is-closing'), 780 + hold));
      shot.timers.push(setTimeout(() => {
        shot = null;
        closeScope();
        applyHit(point);
      }, 1000 + hold));
    }
  }
}

const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

// 조준 지점(문제 패널 기준 좌표)을 실제 화면에서 클릭한 것과 같은 효과로 처리합니다.
function applyHit(point) {
  if (phase !== 'question') return;
  const panel = questionPanel.getBoundingClientRect();
  const x = panel.left + point.x, y = panel.top + point.y;

  const box = imageBox();
  if (box && x >= box.left && x <= box.left + box.w && y >= box.top && y <= box.top + box.h) {
    // 해설 영역이 잘려 보이는 문제도 있으므로, 원본 이미지 기준 좌표(hitImage 반환값)로 화살을 꽂습니다.
    const at = hitImage({clientX: x, clientY: y});
    if (at && typeof at === 'object') {
      const stuck = document.createElement('span');
      stuck.className = 'hit-arrow';
      Object.assign(stuck.style, {left: at.x * 100 + '%', top: at.y * 100 + '%'});
      document.getElementById('hit-layer').prepend(stuck);
    }
    focusNext();
    return;
  }
  toast('빗나갔습니다! 문제 이미지를 조준해 보세요.');
}
