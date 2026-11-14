import * as P from './physics.js';
import { Cosmos } from './scene.js';

const $ = (id) => document.getElementById(id);
const HAS_API = location.protocol.startsWith('http') && !location.hostname.endsWith('github.io');

/* ─────────────── 状态 ─────────────── */
const state = {
  mode: 'movie',
  massSolar: 1e8,
  spin: P.MOVIE_SPIN,
  r: 1.0000188189,
  stayHours: 1,
  planetId: 'miller',
};

const planets = P.buildPlanets();
let cosmos = null;

/* ─────────────── 数字格式化 ─────────────── */
function num(v, d = 2) {
  if (!isFinite(v)) return '∞';
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(d).replace(/\.?0+$/, '');
}

/* 主角数字不吃「去尾零」那套：7.00 才是这个作品的签名，7 只是个数 */
function heroNum(v) {
  if (!isFinite(v)) return '∞';
  if (v >= 1e6) return v.toExponential(2);
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(4);
  if (v > 0) return v.toExponential(2);
  return '0.00';
}

function durationFromHours(h) {
  if (!isFinite(h)) return '∞';
  const years = h / P.YEAR_HOURS;
  if (years >= 1000) return `${num(years)} 年`;
  if (years >= 10) return `${num(years, 1)} 年`;
  if (years >= 1) {
    const yi = Math.floor(years);
    const mo = Math.round((years - yi) * 12);
    if (mo === 12) return `${yi + 1} 年`;
    return mo > 0 ? `${yi} 年 ${mo} 个月` : `${yi} 年`;
  }
  const days = h / 24;
  if (days >= 1) return `${num(days, 1)} 天`;
  return `${num(h, 2)} 小时`;
}

function massLabel(m) {
  if (m >= 1e6) return `${(m / 1e6).toFixed(1)}×10⁶ M☉`;
  if (m >= 1e4) return `${(m / 1e3).toFixed(1)}×10³ M☉`;
  return `${Math.round(m).toLocaleString('en-US')} M☉`;
}

/* ─────────────── 半径滑杆：对数刻度 ─────────────── */
const R_MAX = 60;
function radiusMin() {
  if (state.mode === 'movie') return P.horizonRadius(state.spin) * (1 + 1e-9);
  return P.iscoRadius(state.spin) * (1 + 1e-9);
}
function sliderToRadius(v) {
  const lo = Math.log(radiusMin()), hi = Math.log(R_MAX);
  return Math.exp(lo + (hi - lo) * v);
}
function radiusToSlider(r) {
  const lo = Math.log(radiusMin()), hi = Math.log(R_MAX);
  return Math.min(1, Math.max(0, (Math.log(r) - lo) / (hi - lo)));
}

/* ─────────────── 主渲染 ─────────────── */
function render() {
  const a = state.spin;
  const r = state.r;
  const factor = P.dilationFactor(r, a);
  const isco = P.iscoRadius(a);
  const insideIsco = r < isco * (1 - 1e-9);

  // 大数字
  const hum = P.humanizeFactor(factor);
  $('dilation-value').textContent = heroNum(hum.value);
  $('dilation-unit').textContent = hum.unit;
  $('dilation-sub').textContent =
    `a/M = ${a > 0.99999 ? '1 − ' + (1 - a).toExponential(0) : a.toFixed(4)} · r = ${r < 10 ? r.toFixed(10) : r.toFixed(3)} M`;

  // 滑杆回显
  $('out-spin').textContent = a.toFixed(4);
  $('out-radius').textContent = r < 10 ? r.toFixed(6) : r.toFixed(2);
  $('out-mass').textContent = massLabel(state.massSolar);
  $('sl-spin').value = String(a);
  if (state.mode === 'sandbox') {
    const rv = radiusToSlider(r);
    $('sl-radius').value = String(rv);
    $('sl-mass').value = String(Math.log10(state.massSolar) / 9);
  }

  // 提示
  const hint = $('physics-hint');
  hint.classList.toggle('is-calm', !insideIsco);
  if (insideIsco) {
    hint.innerHTML = `半径在 ISCO（${isco.toFixed(6)} M）内侧。<br>这个倍数算得出来，但那儿没有稳定圆轨道 —— 只有电影能让行星停在这儿。`;
  } else if (a < 0.06) {
    const ceil = P.maxStableFactor(a);
    hint.innerHTML = `自转接近 0：稳定轨道上限只有 <b>${P.humanizeFactor(ceil).text}</b>（√2 那一档）。<br>时间的张力，几乎全部来自自转。`;
  } else {
    const ceil = P.maxStableFactor(a);
    hint.innerHTML = `这颗自转的自转上限：稳定轨道能给到 <b>1 小时 = ${P.humanizeFactor(ceil).text}</b>。再往里，只能靠不稳定轨道。`;
  }

  // 账单
  const earthHours = state.stayHours * factor;
  $('bill-earth').textContent = durationFromHours(earthHours);
  $('bill-missed').textContent = durationFromHours(earthHours);
  $('bill-factor').textContent = factor >= 1e5 ? `${num(factor)}×` : `${num(factor)}×`;
  const cap = $('bill-caption');
  if (factor < 1.02) {
    cap.textContent = '你回来时，他们和你几乎一样老。这颗星球上，时间不欠你什么。';
  } else if (factor > 1e4) {
    cap.textContent = `你只待了 ${durationFromHours(state.stayHours)}，回来时他们比你多了 ${durationFromHours(earthHours)}。孩子会长成你的同龄人。`;
  } else {
    cap.textContent = `你只待了 ${durationFromHours(state.stayHours)}，回来时他们比你多了 ${durationFromHours(earthHours)}。`;
  }

  // 场景
  if (cosmos) {
    cosmos.setState({ spin: a, massSolar: state.massSolar, radiusM: r, planetColor: activePlanet()?.color });
    cosmos.setOrbit(r);
  }

  // chips 高亮
  document.querySelectorAll('.planet-chip').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.id === state.planetId);
  });
}

function activePlanet() {
  return planets.find((p) => p.id === state.planetId) || null;
}

/* ─────────────── 控件绑定 ─────────────── */
function bindControls() {
  // 模式
  document.querySelectorAll('.mode').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.mode').forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      setMode(b.dataset.mode);
    });
  });

  // 质量（对数）
  $('sl-mass').addEventListener('input', (e) => {
    state.massSolar = Math.pow(10, parseFloat(e.target.value) * 9);
    render();
  });

  // 自转
  $('sl-spin').addEventListener('input', (e) => {
    state.spin = parseFloat(e.target.value);
    const lo = radiusMin();
    if (state.r < lo) state.r = lo;
    render();
  });

  // 半径
  $('sl-radius').addEventListener('input', (e) => {
    state.r = sliderToRadius(parseFloat(e.target.value));
    render();
  });

  // 停留时长
  $('stay-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    document.querySelectorAll('#stay-chips .chip').forEach((x) => x.classList.remove('is-active'));
    b.classList.add('is-active');
    state.stayHours = parseFloat(b.dataset.hours);
    render();
  });

  // 行星
  const chips = $('planet-chips');
  planets.forEach((p) => {
    const el = document.createElement('button');
    el.className = 'planet-chip';
    el.dataset.id = p.id;
    el.innerHTML = `<b>${p.name}</b><span>${p.en} · 1h = ${P.humanizeFactor(p.factor).text}</span>`;
    el.addEventListener('click', () => selectPlanet(p.id));
    chips.appendChild(el);
  });

  // 视图切换
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('is-active'));
      t.classList.add('is-active');
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('is-shown'));
      $('view-' + t.dataset.view).classList.add('is-shown');
      if (t.dataset.view === 'ops') { refreshOps(); }
      if (t.dataset.view === 'observe' && cosmos) { cosmos.resize(); }
    });
  });
}

function setMode(mode) {
  const prev = state.mode;
  state.mode = mode;
  const locked = mode === 'movie';
  ['sl-spin', 'sl-radius'].forEach((id) => {
    $(id).disabled = locked;
    $(id).style.opacity = locked ? '.45' : '1';
  });
  $('sl-mass').disabled = locked;
  $('sl-mass').style.opacity = locked ? '.45' : '1';
  $('slider-note').textContent = locked
    ? '电影模式下参数锁在电影给定值上。切到沙盒才能自己拖。'
    : '半径滑杆用对数刻度；左端是 ISCO，再往里没有稳定轨道。';
  if (locked) {
    const p = planets.find((x) => x.id === state.planetId) || planets[0];
    state.spin = p.a; state.r = p.r;
  } else if (prev === 'movie') {
    // 从电影模式进沙盒：给一个有稳定轨道的起点，否则一进就卡在视界边上
    state.spin = 0.6;
    state.r = P.iscoRadius(0.6) * 1.05;
  }
  render();
}

function selectPlanet(id) {
  const p = planets.find((x) => x.id === id);
  if (!p) return;
  state.planetId = id;
  state.mode = 'movie';
  document.querySelectorAll('.mode').forEach((x) => x.classList.toggle('is-active', x.dataset.mode === 'movie'));
  setMode('movie');
  state.spin = p.a;
  state.r = p.r;
  render();
}

/* ─────────────── 账单页 ─────────────── */
function renderBill(stay = 3 + 20 / 60) {
  const host = $('bills');
  host.innerHTML = '';
  planets.forEach((p) => {
    const b = P.billFor(p, stay);
    const card = document.createElement('article');
    card.className = 'bill-card';
    card.style.setProperty('--c', p.color);
    card.innerHTML = `
      <h3>${p.name}</h3>
      <div class="bc-kind">${p.kind}</div>
      <div class="bc-cost">${durationFromHours(b.years * P.YEAR_HOURS)}</div>
      <div class="bc-cost-label">停留 3 小时 20 分 · 地球流逝</div>
      <p class="bc-note">${p.note}</p>
      ${p.unstable ? `<p class="bc-warn">⚠ 半径 ${p.r.toFixed(10)} M 落在 ISCO（${p.isco.toFixed(6)} M）内侧。稳定圆轨道不允许停在儿 —— 电影为了效果这么安排了。</p>` : ''}
    `;
    host.appendChild(card);
  });

  renderTable(stay);

  const m = planets[0];
  const film = P.billFor(m, 3 + 20 / 60);
  $('checks').innerHTML = [
    `施瓦西黑洞（自转 0）在 ISCO 6M 处：倍率 = √2 = 1.4142 ✓`,
    `米勒行星反解：r = ${m.r.toFixed(10)} M，倍率 = ${num(m.factor)} ✓`,
    `电影 3 小时 20 分 → ${film.years.toFixed(2)} 年（影片台词是 23 年 4 个月）✓`,
    `同一自转下，稳定轨道的天花板只有 1 小时 = ${P.humanizeFactor(m.ceiling).text} —— 差 ${(m.factor / m.ceiling).toFixed(1)} 倍`,
  ].map((t, i) => `<li class="${i === 3 ? 'bad' : ''}">${t}</li>`).join('');
}

/* 三颗星球 + 地球，并排同一份停留时长 */
function renderTable(stay) {
  const rows = planets.map((p) => ({
    name: p.name,
    sub: p.en,
    r: p.r,
    a: p.a,
    factor: p.factor,
    unstable: !!p.unstable,
    isco: p.isco,
    color: p.color,
  }));
  rows.push({ name: '地球', sub: 'Earth', r: null, a: null, factor: 1, unstable: false, color: 'var(--dim)' });

  const maxYears = Math.max(...rows.map((x) => P.earthYearsFor(stay, x.factor)));

  $('bill-table').innerHTML = `
    <thead>
      <tr>
        <th>星球</th><th>轨道半径</th><th>时间倍率</th>
        <th>那儿 1 小时</th><th>待 ${humanStay(stay)}，地球过去</th><th>轨道</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((x) => {
        const years = P.earthYearsFor(stay, x.factor);
        const bar = Math.max(1.5, (years / maxYears) * 100);
        return `<tr>
          <td class="c-name"><i style="background:${x.color}"></i>${x.name}<em>${x.sub}</em></td>
          <td class="c-num">${x.r == null ? '—' : (x.r < 1.001 ? x.r.toFixed(10) : x.r.toFixed(1))}${x.r == null ? '' : ' M'}</td>
          <td class="c-num">${heroNum(x.factor)}×</td>
          <td class="c-num">${P.humanizeFactor(x.factor).text}</td>
          <td class="c-cost">
            <span class="bar" style="width:${bar}%"></span>
            <b>${durationFromHours(years * P.YEAR_HOURS)}</b>
          </td>
          <td class="c-flag ${x.unstable ? 'bad' : 'ok'}">${x.r == null ? '基准' : x.unstable ? 'ISCO 内侧 ✗' : '稳定 ✓'}</td>
        </tr>`;
      }).join('')}
    </tbody>`;

  const m = planets[0];
  $('table-foot').textContent =
    `米勒的倍率是地球的 ${num(m.factor)} 倍 —— 但它的半径 ${m.r.toPrecision(10)} M 在 ISCO ${m.isco.toPrecision(8)} M 内侧（近 ${(m.isco - m.r).toExponential(2)} M），稳定圆轨道不允许停在那里。`;
}

function humanStay(h) {
  if (h >= 1) {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return mm > 0 ? `${hh} 小时 ${mm} 分` : `${hh} 小时`;
  }
  return `${Math.round(h * 60)} 分钟`;
}

/* ─────────────── 进度页 ─────────────── */
let progress = null;

async function loadProgress() {
  let data = null;
  if (HAS_API) {
    try {
      const r = await fetch('/api/progress');
      if (r.ok) data = await r.json();
    } catch {}
  }
  if (!data) {
    try { data = JSON.parse(localStorage.getItem('timebill.progress') || 'null'); } catch {}
  }
  progress = data || (await fetch('data/progress.json').then((r) => r.json()).catch(() => ({ weeks: [] })));
  renderProgress();
}

function renderProgress() {
  const host = $('weeks');
  host.innerHTML = '';
  let total = 0, done = 0;
  (progress.weeks || []).forEach((w) => {
    const el = document.createElement('section');
    el.className = 'week';
    const tasks = w.sessions.map((s) => {
      total++; if (s.done) done++;
      return `<label class="task ${s.done ? 'is-done' : ''}" data-id="${s.id}">
        <input type="checkbox" ${s.done ? 'checked' : ''}>
        <span class="task-label">${s.label}</span>
        <span class="task-note">${s.note || ''}</span>
      </label>`;
    }).join('');
    el.innerHTML = `<div class="week-head"><h3>${w.title}</h3><p>${w.goal}</p></div><div class="week-body">${tasks}</div>`;
    host.appendChild(el);
  });
  $('plan-progress-text').textContent = `${done} / ${total} 已勾`;

  host.querySelectorAll('.task').forEach((row) => {
    row.querySelector('input').addEventListener('change', async (e) => {
      const id = row.dataset.id;
      const on = e.target.checked;
      row.classList.toggle('is-done', on);
      for (const w of progress.weeks) {
        const s = w.sessions.find((x) => x.id === id);
        if (s) s.done = on;
      }
      const d = progress.weeks.flatMap((w) => w.sessions).filter((s) => s.done).length;
      const t = progress.weeks.flatMap((w) => w.sessions).length;
      $('plan-progress-text').textContent = `${d} / ${t} 已勾`;
      localStorage.setItem('timebill.progress', JSON.stringify(progress));
      if (HAS_API) {
        try {
          await fetch('/api/progress', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(progress) });
        } catch {}
      }
    });
  });
}

/* ─────────────── 作战台 ─────────────── */
const SVC_META = {
  ollama: { name: 'Ollama', port: ':11434' },
  dify: { name: 'Dify', port: ':80' },
  xinference: { name: 'Xinference', port: ':9997' },
  hermes: { name: 'Hermes', port: '本会话' },
};

async function refreshOps() {
  if (!HAS_API) {
    $('ops-grid').innerHTML = `<p class="ops-empty">这一页连的是我自己电脑上的三路本地 AI（Ollama / Dify / Xinference）。
      线上版只有静态页面，所以这里空着 —— 不是坏了。想在本地看它跑起来：<code>git clone</code> 后执行 <code>node server.mjs</code>，
      再开 <code>http://localhost:8787</code>。</p>`;
    return;
  }
  try {
    const r = await fetch('/api/ops');
    const d = await r.json();
    renderOps(d);
    $('net-status').classList.toggle('is-up', !!(d.ollama?.up || d.dify?.up));
  } catch {
    $('net-status').classList.remove('is-up');
  }
}

function renderOps(d) {
  const host = $('ops-grid');
  host.innerHTML = '';
  for (const key of Object.keys(SVC_META)) {
    const meta = SVC_META[key];
    const s = d[key] || {};
    const up = !!s.up;
    const div = document.createElement('section');
    div.className = 'svc ' + (up ? 'is-up' : 'is-down');
    const rows = [];
    if (key === 'ollama' && up) {
      rows.push(['状态', '应答中']);
      rows.push(['已装模型', String(s.models?.length || 0)]);
    } else if (key === 'dify' && up) {
      rows.push(['状态', s.installed === false ? '未初始化' : '运行中']);
      rows.push(['容器', String(s.containers ?? '—')]);
    } else if (key === 'xinference') {
      rows.push(['状态', up ? '应答中' : '未启动']);
      rows.push(['模型', String(s.models?.length ?? 0)]);
    } else if (key === 'hermes') {
      rows.push(['角色', '总调度']);
      const last = (d.log || [])[0];
      rows.push(['最近动作', last ? last.what : '（账本还空）']);
      if (last?.detail) rows.push(['细节', String(last.detail).slice(0, 28)]);
    }
    if (!rows.length) rows.push(['状态', up ? '应答中' : '未响应']);

    div.innerHTML = `
      <div class="svc-top">
        <span class="svc-led"></span>
        <span class="svc-name">${meta.name}</span>
        <span class="svc-port">${meta.port}</span>
      </div>
      <div class="svc-body">
        ${rows.map(([k, v]) => `<div class="svc-row"><span>${k}</span><b>${v}</b></div>`).join('')}
        ${s.models?.length ? `<div class="svc-models">${s.models.slice(0, 6).map((m) => `<span>${typeof m === 'string' ? m : m.name || m.id}</span>`).join('')}</div>` : ''}
        ${s.note ? `<p class="svc-note">${s.note}</p>` : ''}
      </div>`;
    host.appendChild(div);
  }
  $('ops-updated').textContent = '刷新于 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });

  const stream = $('ops-stream');
  const log = d.log || [];
  $('ops-empty').style.display = log.length ? 'none' : 'block';
  stream.innerHTML = log.slice(0, 40).map((e) => `
    <li>
      <span class="s-time">${(e.t || '').slice(11, 19)}</span>
      <span class="s-what">${e.what}<em>${e.detail || ''}</em></span>
      <span class="s-meta">${e.meta || ''}</span>
    </li>`).join('');
}

async function narrate() {
  const btn = $('ops-narrate');
  btn.disabled = true;
  btn.textContent = '正在让本地模型写…';
  const a = state.spin, r = state.r;
  const f = P.dilationFactor(r, a);
  try {
    const res = await fetch('/api/narrate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        factor: f, radius: r, spin: a,
        stay: state.stayHours,
        earth: durationFromHours(state.stayHours * f),
      }),
    });
    const d = await res.json();
    if (d.text) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="s-time">${new Date().toLocaleTimeString('zh-CN', { hour12: false })}</span><span class="s-what">旁白：<em>${d.text.slice(0, 180)}</em></span><span class="s-meta">${d.model || 'local'}</span>`;
      $('ops-stream').prepend(li);
      $('ops-empty').style.display = 'none';
    }
  } catch {
    btn.textContent = '本地服务没应答';
  } finally {
    setTimeout(() => { btn.disabled = false; btn.textContent = '让本地模型写一段账单旁白'; }, 600);
  }
}

/* ─────────────── 启动 ─────────────── */
function boot() {
  try {
    cosmos = new Cosmos($('sky'));
  } catch (err) {
    console.warn('WebGL 不可用：', err);
    // 没 WebGL 就退回离线渲染的那张图 —— 作品永远要有画，不能是一块空白
    $('sky').insertAdjacentHTML('afterend',
      '<div class="sky-fallback"><img src="assets/hero.png" alt="Gargantua 的引力透镜、吸积盘与光子环"><span>这台设备没开 WebGL，显示离线渲染的静帧；数字与账单照常可用。</span></div>');
  }

  bindControls();
  const stay = $('sl-stay');
  const stayH = stay ? parseFloat(stay.value) / 60 : 3 + 20 / 60;
  $('stay-out').textContent = humanStay(stayH);
  renderBill(stayH);

  if (stay && !stay.dataset.bound) {
    stay.dataset.bound = '1';
    stay.addEventListener('input', () => {
      const h = parseFloat(stay.value) / 60;
      $('stay-out').textContent = humanStay(h);
      renderBill(h);
    });
  }
  loadProgress();
  setMode('movie');
  selectPlanet('miller');

  $('ops-narrate').addEventListener('click', narrate);
  $('plan-export').addEventListener('click', () => {
    const done = progress.weeks.flatMap((w) => w.sessions).filter((s) => s.done);
    const text = done.map((s) => `✓ ${s.label}${s.note ? '  — ' + s.note : ''}`).join('\n');
    navigator.clipboard?.writeText(text);
    $('plan-export').textContent = '已复制';
    setTimeout(() => ($('plan-export').textContent = '导出勾选记录'), 1400);
  });

  if (!HAS_API) {
    // 线上版没有 server.mjs：别留一个点了没反应的按钮
    $('net-status').title = '本地服务未连接（静态托管模式）';
    const b = $('ops-narrate');
    b.disabled = true;
    b.textContent = '旁白需要本地服务';
    b.style.opacity = '.45';
    b.style.cursor = 'default';
    $('ops-empty').textContent = '线上版只有静态页面。要看三路 AI 真的在跑，在本地 git clone 后执行 node server.mjs。';
  }
  $('lan-url').textContent = HAS_API ? `http://${location.hostname}:${location.port}` : '本地静态模式';

  // 观测页才轮询，省电
  setInterval(() => {
    if ($('view-ops').classList.contains('is-shown')) refreshOps();
  }, 4000);
  if (HAS_API) refreshOps();
}

document.addEventListener('DOMContentLoaded', boot);
