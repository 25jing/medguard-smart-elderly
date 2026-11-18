# -*- coding: utf-8 -*-
"""生成安心药助手 PWA 图标（192/512），纯 PIL 绘制，无外部素材依赖"""
from PIL import Image, ImageDraw

def make(size, path):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 圆角方形底（深青→浅青渐变模拟：两层圆角矩形）
    r = int(size * 0.22)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=(15, 118, 110, 255))
    d.rounded_rectangle([int(size * 0.06), int(size * 0.06), int(size * 0.94), int(size * 0.94)],
                        radius=int(r * 0.8), fill=(13, 148, 136, 255))
    # 白色药丸（胶囊）：斜置的两半胶囊
    import math
    cx, cy = size / 2, size / 2
    L = size * 0.30   # 胶囊半长
    W = size * 0.13   # 胶囊半宽
    ang = math.radians(-40)
    dx, dy = math.cos(ang), math.sin(ang)
    # 胶囊主体（两圆 + 矩形近似：用两个圆和一条粗线）
    x1, y1 = cx - dx * L * 0.55, cy - dy * L * 0.55
    x2, y2 = cx + dx * L * 0.55, cy + dy * L * 0.55
    d.line([x1, y1, x2, y2], fill=(255, 255, 255, 255), width=int(W * 2))
    d.ellipse([x1 - W, y1 - W, x1 + W, y1 + W], fill=(255, 255, 255, 255))
    d.ellipse([x2 - W, y2 - W, x2 + W, y2 + W], fill=(255, 237, 209, 255))  # 另一半暖色
    # 中缝
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    px, py = -dy, dx
    d.line([mx - px * W, my - py * W, mx + px * W, my + py * W], fill=(15, 118, 110, 255), width=max(2, size // 90))
    # 保护盾牌勾（底部小白勾）
    gy = cy + size * 0.30
    d.line([cx - size * 0.10, gy, cx - size * 0.02, gy + size * 0.07, cx + size * 0.12, gy - size * 0.09],
           fill=(255, 255, 255, 235), width=max(3, size // 40), joint="curve")
    img.save(path)
    print("saved", path)

if __name__ == "__main__":
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "frontend", "h5-app", "assets")
    os.makedirs(out, exist_ok=True)
    make(192, os.path.join(out, "icon-192.png"))
    make(512, os.path.join(out, "icon-512.png"))
