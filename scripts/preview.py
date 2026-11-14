#!/usr/bin/env python3
"""把 src/scene.js 的天空着色器用 numpy 复刻，离线渲一张图。

目的：SwiftShader 跑不动逐像素物理，但构图必须看得见。这里逐行照抄 GLSL，
所以改这里的常数等于改 scene.js 的常数，调完直接搬回去。
"""
import numpy as np
from PIL import Image
import sys

# ── 与 scene.js 一致的参数 ──
AZ, EL, DIST = 0.0, 0.20, 11.6
FOV = 38.0
FOCUS = np.array([-1.9, 1.05, 0.0])
VIS = 0.32
SPIN = 0.9999
MASS_LOG = 8.0
PHOTON_R = 5.2 * VIS * (0.94 + 0.10 * min(1.0, SPIN))
import os
IN_MULT = float(os.environ.get("IN_MULT", 1.30))
OUT_MULT = float(os.environ.get("OUT_MULT", 2.25))
A_SCALE = float(os.environ.get("A_SCALE", 0.62))
C_SCALE = float(os.environ.get("C_SCALE", 0.72))
U_IN = PHOTON_R * IN_MULT
U_OUT = PHOTON_R * OUT_MULT
U_TEMP = max(0.18, min(1.0, 1.15 - (MASS_LOG - 1) / 8.2))
LENS = 1.0


def n2(p):
    i = np.floor(p)
    f = p - i
    f = f * f * (3.0 - 2.0 * f)

    def h(a, b):
        v = np.sin(a * 127.1 + b * 311.7) * 43758.5453123
        return v - np.floor(v)

    a = h(i[..., 0], i[..., 1])
    b = h(i[..., 0] + 1, i[..., 1])
    c = h(i[..., 0], i[..., 1] + 1)
    d = h(i[..., 0] + 1, i[..., 1] + 1)
    fx, fy = f[..., 0], f[..., 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def norm(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def render(W=960, H=760):
    cam = np.array([np.sin(AZ) * np.cos(EL) * DIST, np.sin(EL) * DIST, np.cos(AZ) * np.cos(EL) * DIST])

    # 相机基
    fwd = FOCUS - cam
    fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, np.array([0.0, 1.0, 0.0]))
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)

    ys, xs = np.mgrid[0:H, 0:W]
    px = (xs + 0.5) / W * 2 - 1
    py = 1 - (ys + 0.5) / H * 2
    th_fov = np.tan(np.radians(FOV) / 2)
    aspect = W / H
    d = norm(fwd[None, None] + right[None, None] * (px * th_fov * aspect)[..., None] + up[None, None] * (py * th_fov)[..., None])

    hole = np.array([0.0, 0.0, 0.0])
    h = norm((hole - cam)[None, None])
    cam_y = cam[1]

    ct = np.clip((d * h).sum(-1), -1, 1)
    th = np.arccos(ct)
    perp = d - ct[..., None] * h
    pl = np.linalg.norm(perp, axis=-1, keepdims=True)
    perp = np.where(pl > 1e-6, perp / np.maximum(pl, 1e-9), np.array([0.0, 1.0, 0.0]))

    dist_to_hole = np.linalg.norm(cam - hole)
    ang = np.arcsin(min(0.9, PHOTON_R / max(2, dist_to_hole)))
    theta_e = ang
    u_shadow = ang * 1.05

    LENS_MODE = os.environ.get("LENS_MODE", "fwd")
    if LENS_MODE == "inv":
        # 反解点透镜：视向 θ → 源方向 b = θ − θ_E²/θ（两像分别在同侧/异侧）
        safe_th = np.maximum(th, 1e-4)
        b1 = th - theta_e * theta_e / safe_th
        b2 = -(th + theta_e * theta_e / safe_th)
    else:
        disc = np.sqrt(th * th + 4 * theta_e * theta_e)
        b1 = 0.5 * (th + disc)
        b2 = 0.5 * (th - disc)
    d1 = h * np.cos(b1)[..., None] + perp * np.sin(b1)[..., None]
    d2 = h * np.cos(b2)[..., None] + perp * np.sin(b2)[..., None]

    # ── 星 ──
    def stars(dd):
        col = np.zeros_like(dd)
        for i in range(2):
            scale = 30.0 + i * 46.0
            p = dd * scale
            idi = np.floor(p)
            f = p - idi - 0.5
            hv = np.sin(idi[..., 0] * 127.1 + idi[..., 1] * 311.7 + idi[..., 2] * 17.0 + i * 7.7) * 43758.5453123
            hv = hv - np.floor(hv)
            m = hv > 0.972
            b = np.clip((0.17 - np.linalg.norm(f, axis=-1)) / 0.17, 0, 1)
            b = b * b * (3 - 2 * b)
            tint = np.where((hv * 13 % 1)[..., None] > 0.5, np.array([1.0, 0.88, 0.72]), np.array([0.74, 0.85, 1.0]))
            col += (b * m * (0.34 - i * 0.12))[..., None] * tint
        return col

    sky_bent = np.maximum(stars(d1), stars(d2) * 0.55)
    sky = stars(d) * (1 - LENS) + sky_bent * LENS

    np2 = np.stack([np.arctan2(d[..., 2], d[..., 0]) * 1.1, d[..., 1] * 2.6], -1)
    neb = n2(np2 * 2.2)
    neb = neb * 0.6 + n2(np2 * 5.1) * 0.4
    neb_col = np.array([0.055, 0.045, 0.10])[None, None] * (1 - neb[..., None]) + np.array([0.05, 0.07, 0.10])[None, None] * neb[..., None]
    sky += neb_col * (neb ** 2.6)[..., None] * 0.9

    sm = np.clip((th - u_shadow * 0.90) / (u_shadow * 1.12 - u_shadow * 0.90), 0, 1)
    sky *= (sm * sm * (3 - 2 * sm))[..., None]

    ringw = 0.0022 + theta_e * 0.035
    ring = np.exp(-((th - theta_e) / ringw) ** 2)
    sky += (ring * 0.34 * LENS)[..., None] * np.array([1.0, 0.90, 0.76])

    # ── 盘 ──
    def disk_image(dd):
        out_rgb = np.zeros_like(dd)
        out_a = np.zeros(dd.shape[:2])
        safe = np.abs(dd[..., 1]) > 1e-4
        tt = np.where(safe, -cam_y / np.where(safe, dd[..., 1], 1.0), -1.0)
        ok = safe & (tt > 0)
        P = cam[None, None] + dd * np.where(ok, tt, 0)[..., None]
        rho = np.linalg.norm(P[..., [0, 2]], axis=-1)
        hit = ok & (rho >= U_IN) & (rho <= U_OUT)
        if not hit.any():
            return out_rgb, out_a

        t = np.clip((rho - U_IN) / (U_OUT - U_IN), 0, 1)
        phi = np.arctan2(P[..., 2], P[..., 0])
        spiral = phi * 3.0 - np.log(np.maximum(rho, 1e-3)) * 4.0
        fil = n2(np.stack([spiral, rho * 1.1], -1))
        fil = fil * 0.6 + n2(np.stack([spiral * 2.9, rho * 2.6], -1)) * 0.4
        # 沿流向拉长的细丝：像流动的等离子体，不是一张贴图
        streak = 0.55 + 0.45 * np.sin(phi * 34.0 + n2(np.stack([spiral * 0.6, rho * 0.4], -1)) * 6.0)

        edge = np.clip(t / 0.10, 0, 1)
        edge = edge * edge * (3 - 2 * edge)
        tail = np.clip((t - 0.60) / 0.40, 0, 1)
        edge = edge * (1 - tail * tail * (3 - 2 * tail))

        vel = norm(np.stack([-np.sin(phi), np.zeros_like(phi), np.cos(phi)], -1))
        beta = 0.50 + 0.46 * SPIN
        mu = (vel * dd).sum(-1)
        dop = 1.0 / np.power(np.maximum(1.0 - beta * mu, 0.08), 2.6)
        dop = np.clip(dop, 0.06, 3.4)

        hot = np.array([1.00, 0.94, 0.84])
        mid = np.array([1.00, 0.58, 0.24])
        cool = np.array([0.52, 0.12, 0.04])
        s1 = np.clip((1 - t - 0.02) / 0.34, 0, 1)
        s1 = s1 * s1 * (3 - 2 * s1)
        col = cool[None, None] * (1 - s1[..., None]) + mid[None, None] * s1[..., None]
        # 内缘一路烧到白：整张图唯一的纯亮部
        w = np.clip(np.power(1 - t, 3.0) * (0.75 + 0.65 * U_TEMP), 0, 1)
        col = col * (1 - w[..., None]) + hot[None, None] * w[..., None]
        # 多普勒：迎面偏白，背面偏红
        bl = np.clip((dop - 1.0) / 2.4, 0, 1)[..., None]
        rd = np.clip((1.0 - dop) / 0.80, 0, 1)[..., None]
        col = col * (1 - 0.22 * bl) + np.array([1.00, 0.95, 0.86]) * (0.22 * bl)
        col = col * (1 - 0.45 * rd) + np.array([0.78, 0.20, 0.07]) * (0.45 * rd)

        a = edge * (0.26 + 0.74 * np.power(np.clip(fil, 0, 1), 1.25) * streak) * A_SCALE
        a *= np.clip(np.power(dop, 1.15), 0.04, 1.0)
        a *= 0.45 + 0.85 * np.power(1 - t, 1.5)
        a = np.clip(a, 0, 0.97)

        outc = col * np.clip(np.power(dop, 1.05), 0.05, 2.4)[..., None] * C_SCALE
        outc = outc / (1 + outc * 0.10)

        out_rgb = np.where(hit[..., None], outc, 0)
        out_a = np.where(hit, a, 0)
        return out_rgb, out_a

    r0, a0 = disk_image(d)
    r1, a1 = disk_image(d1)
    r2, a2 = disk_image(d2)
    a2 = a2 * 0.55

    dcol = r2.copy()
    da = a2.copy()
    dcol = dcol * (1 - a1[..., None]) + r1 * a1[..., None]
    da = da + a1 * (1 - da)
    dcol = dcol * (1 - a0[..., None]) + r0 * a0[..., None]
    da = da + a0 * (1 - da)

    img = sky * (1 - da[..., None]) + dcol
    img = np.clip(img, 0, 1)
    img = np.power(img, 1 / 2.2) * 255
    return img.astype(np.uint8)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/preview.png"
    W = int(sys.argv[2]) if len(sys.argv) > 2 else 960
    H = int(sys.argv[3]) if len(sys.argv) > 3 else 760
    arr = render(W, H)
    Image.fromarray(arr).save(out)
    lum = arr.astype(float).mean(-1)
    print(f"W={W} H={H} mean={lum.mean():.1f} p99={np.percentile(lum,99):.0f} "
          f"warm={((arr[...,0].astype(int)-arr[...,2])>25).mean():.4f} "
          f"dark(<12)={(lum<12).mean():.3f}")
    cx, cy = W // 2, H // 2
    print(f"center lum {lum[cy-8:cy+8, cx-8:cx+8].mean():.1f}")
