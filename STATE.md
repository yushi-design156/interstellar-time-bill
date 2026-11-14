# STATE · 星际穿越时间账单

> 暂停 / 恢复用。「暂停一下」= 停手并更新这份存档；「继续开始」= 从这里接着做。

最后更新：2026-11-14 20:15 · 第 1 周

## 一、已定的六件事（不再改）

| 项 | 决定 |
|---|---|
| 形态 | Three.js 3D 交互网页（不是 p5、不是静态信息图） |
| 物理 | 双模式：电影模式（Gargantua 参数）+ 沙盒自由调参 |
| AI 层 | Ollama + Dify + Xinference 三路真实接进「作战台」 |
| 发布 | 本地跑通 → GitHub 公开仓 → GitHub Pages |
| 署名 | yushi |
| 节奏 | 每周 3 次 × 90 分钟，四周 |
| 手机 | 竖屏适配 + 局域网同步进度 |

## 二、已经能跑的部分

- **物理内核** `src/physics.js` — 克尔赤道面顺行圆轨道，`x = √(1/r)` 改写避免近视界抵消。`node scripts/test-physics.mjs` → **19 项断言全通过**。
- **画面** `src/scene.js` — 天空着色器逐像素解透镜方程（反解 `b = θ − θ_E²/θ`），盘由偏折光线与赤道面求交决定，没有一处手摆位置。多普勒实测左右亮度比 68:43。
- **UI** `index.html` + `src/main.js` + `assets/style.css` — 四视图（观测 / 账单 / 进度 / 作战台），滑杆实时联动；手机竖屏画布独占顶部 44vh，文字读数落到下面。
- **本地服务** `server.mjs` — 静态托管 + `/api/ops` 真实探测 + `/api/narrate` 调本地模型写旁白。
- **作战台实测**：Ollama ✓（5 模型）、Dify ✓（17 容器）、Xinference ✓（9997 已应答，401 要 key）、Hermes ✓（读真实调用账本）。
- **降级路径**：WebGL 不可用时显示 `assets/hero.png` 离线渲染静帧，数字照常。
- **git** 已 init + 提交（`main`，身份 yushi / yushi@users.noreply.github.com）。

## 三、关键发现（作品的核心论点，别丢）

1. 米勒行星反解出 r = **1.0000188189 M**，倍率 61,362 → 1 小时 = 7.00 年。
2. 稳定圆轨道天花板：极端自转下 **1 小时 ≈ 3.85 年**。要 7 年得再往里 1.9×10⁻⁵ M —— ISCO 内侧，没有稳定轨道。
3. 电影是拿物理换了戏剧性。作品不改参数凑数，把这句判断印在账单上。
4. `maxStableFactor` 返回 dt/dτ；换成「地球年 / 行星小时」必须除 8766。这个单位坑踩过一次，测试里现在钉住了。
5. qwen3 是思考模型：`think: false` 必须显式关，否则预算全烧在 `<think>`，`response` 是空的。
6. 模型会编数字（「三小时」「数万倍」）→ 已加服务端护栏：句子里出现数字就弃用，退回只用真值的既定文案。

## 四、下一个动作（从这里接着做）

**发布到 GitHub Pages** —— 代码已提交，只差认证：

```bash
cd ~/Projects/interstellar-time-bill
gh auth login                    # 浏览器里输一次性码，只能你本人做
gh repo create interstellar-time-bill --public --source=. --push
gh api -X POST repos/{owner}/interstellar-time-bill/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```

Pages 起来后地址是 `https://<用户名>.github.io/interstellar-time-bill/`。
线上没有 `server.mjs`，作战台会显示「需要本地服务」——那是设计内的降级，不是 bug。

## 五、还没做

- [ ] GitHub 认证 + 建仓 + 开 Pages（唯一卡住的事）
- [ ] Safari 真机竖屏看一眼（这台机器 headless 浏览器只有 SwiftShader，截不到图）
- [x] 账单视图对照表（三星球 + 地球并排、停留时长滑杆 15 分钟–24 小时实时重算、ISCO 内外标注）
- [ ] OG 图与分享卡片
- [ ] 第 2、3 周任务（作品集包装、答辩脚本）

## 六、环境

- 项目：`~/Projects/interstellar-time-bill`
- 服务：`node server.mjs` → 8787（后台跑着，日志 `logs-server.txt`）
- Ollama 11434 · Dify 80（`~/dify/docker`，17 容器）· Xinference 9997（`~/.xinference-venv`）
- 凭证一律不代填、不落盘：Dify 管理员账号、Xinference API key 都要你本人在浏览器里建
- 视觉迭代走 `scripts/preview.py` 离线渲染（numpy 逐行复刻着色器），不用浏览器截图
