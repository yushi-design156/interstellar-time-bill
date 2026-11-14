import * as P from '../src/physics.js';
let fails = 0;
const ok = (name, cond, got='') => { if(!cond) fails++; console.log((cond?'PASS':'FAIL'), name, got); };

ok('Schwarzschild ISCO=6M → √2', Math.abs(P.dilationFactor(6,0)-Math.SQRT2)<1e-12, P.dilationFactor(6,0));
ok('ISCO a=0 → 6M', Math.abs(P.iscoRadius(0)-6)<1e-9, P.iscoRadius(0));
ok('ISCO a=1 → 1M', Math.abs(P.iscoRadius(1)-1)<1e-6, P.iscoRadius(1));
ok('光子轨道 a=0 → 3M', Math.abs(P.photonOrbit(0)-3)<1e-9, P.photonOrbit(0));
ok('视界 a=0 → 2M', Math.abs(P.horizonRadius(0)-2)<1e-12, P.horizonRadius(0));

const planets = P.buildPlanets();
const miller = planets[0];
ok('Miller 反解成功', miller.factor > 60000, `r=${miller.r.toFixed(10)}M D=${miller.factor.toFixed(1)}`);
ok('Miller 1 小时 = 7.00 年', Math.abs(P.earthYearsFor(1, miller.factor)-7)<0.01, P.earthYearsFor(1,miller.factor).toFixed(4)+' 年');
ok('Miller 在视界外', miller.r > P.horizonRadius(miller.a), `r+=${P.horizonRadius(miller.a).toFixed(10)}`);
ok('Miller 被标记为 ISCO 内侧', miller.unstable === true, `isco=${miller.isco.toFixed(10)}`);
ok('稳定上限 ≈ 3.85 年/小时', Math.abs(miller.ceiling*1/P.YEAR_HOURS-3.85)<0.1, (miller.ceiling/P.YEAR_HOURS).toFixed(3)+' 年');

planets.forEach(p=>console.log(`  ${p.name}\tD=${p.factor.toFixed(4)}\t1h=${P.humanizeFactor(p.factor).text}\tr=${p.r}`));
const film = P.billFor(miller, 3+20/60);
ok('电影 3h20m ≈ 23.3 年', Math.abs(film.years-23.3)<0.4, film.years.toFixed(2)+' 年');
ok('无自转极限 = √2', Math.abs(P.maxStableFactor(0)-Math.SQRT2)<1e-6, P.maxStableFactor(0).toFixed(4));
ok('自转 0.9 的 ISCO 上限 ≈ 2.15（不是 3）', Math.abs(P.maxStableFactor(0.9) - 2.15) < 0.05, P.maxStableFactor(0.9).toFixed(4));
let mono = true, prev = 0;
for (let a = 0; a <= 0.9999; a += 0.01) { const v = P.maxStableFactor(a); if (v < prev - 1e-9) mono = false; prev = v; }
ok('上限随自转单调上升', mono, `${P.maxStableFactor(0).toFixed(2)} → ${P.maxStableFactor(0.9999).toFixed(2)}`);
// 单位别弄混：maxStableFactor 返回的是 dt/dτ，换成「地球年 / 行星小时」要除 YEAR_HOURS
const yph = (a) => P.maxStableFactor(a) / P.YEAR_HOURS;
ok('a=0.9 的稳定轨道上限 ≈ 0.0002 年/小时', Math.abs(yph(0.9) * P.YEAR_HOURS - 2.1493) < 1e-3, yph(0.9).toExponential(2));
ok('稳定上限在极端自转下 = 3.85 年/小时', Math.abs(yph(1 - 1e-14) - 3.853) < 0.01, yph(1 - 1e-14).toFixed(3));
ok('7 年/小时 在稳定轨道上不可能', yph(1 - 1e-14) < 7, `天花板只有 ${yph(1 - 1e-14).toFixed(2)} 年/小时`);
// 要 7 年/小时需要多极端的自转？二分找临界 a
let lo = 0, hi = 0.9999999;
for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (yph(m) > 7) hi = m; else lo = m; }
ok('临界自转 a_crit → 1 才够 7 年，且仍不让行星停在那儿', hi > 0.99999, `a_crit = ${hi.toFixed(8)}`);
let bad=0; for (let a=0; a<=0.9999999999; a+=0.001) { const v=P.dilationFactor(P.iscoRadius(a)*1.0001,a); if(!isFinite(v)||isNaN(v)) bad++; }
ok('全自转范围无 NaN', bad===0, `bad=${bad}`);
console.log(fails? `\n${fails} 项未通过` : '\n全部通过');
