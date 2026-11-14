# 星际穿越时间账单 · 进度存档

最后更新：2026-11-14（用户离开中，暂停）

## 已拍板的决定（不再重开）

| 项 | 决定 |
|---|---|
| 形态 | Three.js 3D 交互网页，非 2D 非静态图 |
| 物理 | 双模式：电影模式（Gargantua 参数复现）+ 沙盒（自由调 M / a / r） |
| AI 层 | 第一版就起 Ollama + Dify + Xinference，接进同一个「作战台」页 |
| 发布 | 本地跑通 → 公开 repo → GitHub Pages |
| 署名 | yushi |
| 节奏 | 每周 3 次 × 90 分钟，四周 |
| 手机 | 竖屏适配 + 局域网同步进度 + 移动端形态 |

## 已完成（可验证）

- `src/physics.js` 克尔时间膨胀内核，含数值稳定写法（避免 1 附近灾难性抵消）
- `scripts/test-physics.mjs`：11 项断言全通过
  - 施瓦西 ISCO=6M → √2 ✓
  - ISCO / 光子轨道 / 视界端点值 ✓
  - 米勒行星反解：r = 1.0000188189 M，D = 61362 → 1 小时 = 7.00 年 ✓
  - 3 小时 20 分 = 23.33 年（电影 23 年 4 个月）✓
- `index.html` 四视图骨架：观测 / 账单 / 进度 / 作战台
- `data/progress.json` 四周 12 次任务清单

## 关键发现（写进作品里，别丢）

用电影给出的自转 a/M = 1 − 10⁻¹⁴，**稳定圆轨道最多只给到 1 小时 = 3.85 年**。
要 7 年，半径必须比 ISCO 内侧还近 1.9×10⁻⁵ M —— 稳定轨道不允许。
所以米勒行星在物理上「放错了位置」，这不是算错，是电影为了戏剧性。
作品里必须标出来，这是它比影迷网页高级的地方。

## 下次开工第一件事

`src/scene.js`：吸积盘 + 引力透镜星空着色器（当前 index.html 引用了但文件还没有 → 页面白屏）。
再写 `src/main.js` 接滑杆、`server.mjs` 起 8787 端口（静态 + /api/ops + /api/progress）。

## 基础设施

- Ollama：已起（11434），有 qwen3.6:35b / qwen3:8b / bge-m3
- Docker（OrbStack）：已起
- Dify：**已起来**（12 个容器 Up，api healthy，http://localhost 返回 307 → 首次打开要去 /install 建管理员账号，这一步只能你本人做）
- Xinference：`~/.xinference-venv` 用 uv 装到一半被停（重跑 `~/.local/bin/uv pip install --python ~/.xinference-venv/bin/python xinference` 续上）
- 可用空间 670GB
