/* Kerr 黑洞 · 时间膨胀核心
 * 单位制：G = c = 1，质量 M 归一化为 1（所有半径以 M 为单位，自转 a 以 M 为单位）
 * 参考系：行星上的固有时间 dτ，对比无穷远观测者（地球）的坐标时间 dt
 * 公式：dt/dτ = 1 / sqrt(1 - 3M/r + 2 a M^1.5 / r^1.5)   （赤道面顺行圆轨道）
 * 检验：Schwarzschild a=0, r=6M(ISCO) → √2 = 1.4142 ✓
 */

export const YEAR_HOURS = 365.25 * 24;      // 一年 = 8766 小时
export const MOVIE_SPIN = 1 - 1e-14;        // Gargantua 实测自转 ≈ 1 - 1e-14

/** 外视界 r+ = M(1 + √(1 - a²)) */
export function horizonRadius(a) {
  return 1 + Math.sqrt(Math.max(0, 1 - a * a));
}

/** 顺行光子圆轨道（稳定圆轨道的最内极限的下界） */
export function photonOrbit(a) {
  return 2 * (1 + Math.cos((2 / 3) * Math.acos(-a)));
}

/** 顺行 ISCO —— 有质量粒子能稳定绕行的最内半径 */
export function iscoRadius(a) {
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  return 3 + z2 - Math.sqrt(Math.max(0, (3 - z1) * (3 + z1 + 2 * z2)));
}

/**
 * 引力+运动学时间膨胀因子 dt/dτ 的倒数形式（数值稳定版）
 * f(r,a) = 1 - 3(a? ) ... 用 x = √(M/r) 改写避免 1 附近的灾难性抵消：
 *   f = (x-1)²(2x+1) + 2(a-1)x³
 * 恒等变形自 f = 1 - 3x² + 2a x³
 */
export function fDilation(r, a) {
  const x = Math.sqrt(1 / r);
  const xm = x - 1;
  return xm * xm * (2 * x + 1) + 2 * (a - 1) * x * x * x;
}

/** dt/dτ：行星 1 小时 = 地球多少小时 */
export function dilationFactor(r, a) {
  const f = fDilation(r, a);
  if (!(f > 0)) return Infinity;
  return 1 / Math.sqrt(f);
}

export const secondsPerHour = 3600;

/** 行星上待 tHours 小时 → 地球过去多少年 */
export function earthYearsFor(tHours, factor) {
  return (tHours * factor) / YEAR_HOURS;
}

/**
 * 反解：给定自转 a 与目标膨胀倍数，求需要站在多近的轨道上
 * 在 (r_isco, 1000M) 上对 f 做二分（f 随 r 单调递增，r→r_isco 时 f→小值/0）
 * opts.minRadius：允许的最小半径（沙盒默认 ISCO；电影模式允许到视界附近，因为电影就是这么拍的）
 * 返回 { r, factor, feasible, insideISCO }
 */
export function radiusForFactor(a, targetFactor, opts = {}) {
  const rIsco = iscoRadius(a);
  const rMin = opts.minRadius ?? rIsco * (1 + 1e-12);
  const rMax = 1000;
  const fTarget = 1 / (targetFactor * targetFactor);
  if (!(fTarget > 0) || !isFinite(fTarget)) return { r: rMin, factor: Infinity, feasible: false, insideISCO: false };
  if (fDilation(rMin, a) > fTarget) {
    return { r: rMin, factor: dilationFactor(rMin, a), feasible: false, insideISCO: rMin < rIsco };
  }
  if (fDilation(rMax, a) < fTarget) return { r: rMax, factor: dilationFactor(rMax, a), feasible: false, insideISCO: false };
  let lo = rMin, hi = rMax;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (fDilation(mid, a) < fTarget) lo = mid; else hi = mid;
  }
  const r = 0.5 * (lo + hi);
  return { r, factor: dilationFactor(r, a), feasible: true, insideISCO: r < rIsco };
}

/** 稳定圆轨道（ISCO 及以外）能达到的膨胀上限 —— 自转的真实「天花板」 */
export function maxStableFactor(a) {
  return dilationFactor(iscoRadius(a) * (1 + 1e-9), a);
}

/** 每 M 的物理尺度（施瓦西半径，米）：M☉ → 2953 m */
export const RS_PER_SOLAR_MASS_M = 2953.25;

/** 潮汐加速度差（近似牛顿式，仅作量级提示）：Δg ≈ 2GM h / r³ */
export function tidalAccel(massSolar, rInM, bodyHeightM = 1.8) {
  const G = 6.674e-11, c = 2.998e8, Msun = 1.989e30;
  const M = massSolar * Msun;
  const r = rInM * (2 * G * M / (c * c)); // r 以米
  return (2 * G * M * bodyHeightM) / Math.pow(r, 3);
}

/** 把倍数讲成人话：1 小时 → “7 年” / “12 天” / “1.05 小时” */
export function humanizeFactor(factor) {
  const hours = factor; // 1 小时对应的小时数
  if (!isFinite(factor)) return { value: Infinity, unit: '年', text: '趋近无穷' };
  if (hours >= YEAR_HOURS) return { value: hours / YEAR_HOURS, unit: '年', text: fmt(hours / YEAR_HOURS) + ' 年' };
  if (hours >= 24 * 30) return { value: hours / (24 * 30), unit: '月', text: fmt(hours / (24 * 30), 1) + ' 个月' };
  if (hours >= 24) return { value: hours / 24, unit: '天', text: fmt(hours / 24, 1) + ' 天' };
  return { value: hours, unit: '小时', text: fmt(hours, 2) + ' 小时' };
}

export function fmt(v, digits = 2) {
  if (!isFinite(v)) return '∞';
  if (v === 0) return '0';
  if (v >= 1e6 || (v < 1e-3 && v > 0)) return v.toExponential(3).replace('e+', 'e');
  return v.toFixed(digits).replace(/\.?0+$/, '');
}

/** 三颗星球 —— 电影模式（Miller 由数值反解得到，不是硬编码） */
export function buildPlanets() {
  // 电影把米勒行星放在 ISCO 内侧：为了得到 1h=7y，半径必须比稳定轨道极限还近 1.9e-5 M
  const miller = radiusForFactor(MOVIE_SPIN, 7 * YEAR_HOURS, { minRadius: horizonRadius(MOVIE_SPIN) * (1 + 1e-9) });
  const ceiling = maxStableFactor(MOVIE_SPIN);
  return [
    {
      id: 'miller', name: '米勒', en: 'Miller', kind: '水 · 浅海 · 潮汐',
      a: MOVIE_SPIN, r: miller.r, factor: miller.factor,
      unstable: miller.insideISCO,
      isco: iscoRadius(MOVIE_SPIN),
      ceiling,
      color: '#7fd4ff', accent: '#cdf3ff',
      note: '站在视界外 0.0000188 M 处。一小时，地球七年。',
      danger: '每一个浪都从视界那一侧推过来。',
      catch: '这个半径在 ISCO 内侧 —— 稳定圆轨道不允许。电影把它放在了不该待的地方。',
    },
    {
      id: 'mann', name: '曼恩', en: 'Mann', kind: '冰云 · 永冻 · 死寂',
      a: 0.6, r: 60, factor: dilationFactor(60, 0.6),
      color: '#c9d6e8', accent: '#eef4ff',
      note: '时间几乎是公平的。代价换成别的。',
      danger: '这里的危险不来自引力。',
    },
    {
      id: 'edmunds', name: '埃德蒙斯', en: 'Edmunds', kind: '荒原 · 唯一可居 · 远',
      a: 0.25, r: 300, factor: dilationFactor(300, 0.25),
      color: '#ffc98a', accent: '#ffe6c4',
      note: '时间与地球同步。离开的成本，是全部的过去。',
      danger: '没有怪物。只有距离。',
    },
  ];
}

/** 账单：停留 t 小时的地球时间成本 */
export function billFor(planetOrParams, hours) {
  const factor = planetOrParams.factor ?? dilationFactor(planetOrParams.r, planetOrParams.a);
  const years = earthYearsFor(hours, factor);
  const missed = years; // 你回来时，地球老了同样多岁数
  return { factor, years, missed, days: years * 365.25 };
}
