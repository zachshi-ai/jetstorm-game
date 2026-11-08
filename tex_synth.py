import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 1024

def pnoise(size, scale, seed=0):
    rng = np.random.default_rng(seed)
    w = rng.random((size, size)).astype(np.float32)
    F = np.fft.fft2(w)
    fy = np.fft.fftfreq(size).astype(np.float32)[:, None]
    fx = np.fft.fftfreq(size).astype(np.float32)[None, :]
    r = np.sqrt(fx*fx + fy*fy)
    filt = np.exp(-(r * scale) ** 2) * 0.5 + np.exp(-(r * scale * 0.25) ** 2) * 0.5
    n = np.real(np.fft.ifft2(F * filt))
    n -= n.min(); n /= max(n.max(), 1e-6)
    return n

def highpass(size, seed):
    rng = np.random.default_rng(seed)
    w = rng.random((size, size)).astype(np.float32)
    F = np.fft.fft2(w)
    fy = np.fft.fftfreq(size).astype(np.float32)[:, None]
    fx = np.fft.fftfreq(size).astype(np.float32)[None, :]
    r = np.sqrt(fx*fx + fy*fy)
    filt = 1.0 - np.exp(-(r * 0.12) ** 2)
    n = np.real(np.fft.ifft2(F * filt))
    n -= n.mean(); n /= max(abs(n).max(), 1e-6)
    return n

def to_img(a, path, q=86):
    Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(path, 'JPEG', quality=q, optimize=True)

def normal_from(h, path, strength=3.0, size=512):
    im = Image.fromarray((np.clip(h, 0, 1) * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255.0
    # wrap-around differences so the normal map tiles seamlessly
    hx = np.roll(a, -1, axis=1) - np.roll(a, 1, axis=1)
    hy = np.roll(a, -1, axis=0) - np.roll(a, 1, axis=0)
    n = np.stack([-hx*strength, -hy*strength, np.ones_like(a)], -1)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    out = ((n*0.5+0.5)*255).astype(np.uint8)
    Image.fromarray(out).save(path, 'JPEG', quality=88, optimize=True)

# ---------------- asphalt ----------------
low = pnoise(S, 0.010, 1) * 0.55 + pnoise(S, 0.035, 2) * 0.30 + pnoise(S, 0.10, 3) * 0.15
grain = highpass(S, 11) * 0.5 + highpass(S, 12) * 0.5
h = 0.5 + (low - 0.5) * 0.55 + grain * 0.30
h = np.clip(h, 0, 1)

base = 0.30 + (low - 0.5) * 0.16 + grain * 0.075          # albedo ramp
# gravel specks
rng = np.random.default_rng(7)
spec = (rng.random((S, S)) > 0.9972).astype(np.float32)
spec = np.array(Image.fromarray((spec*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)))/255
base = base + spec * 0.42
dark = (rng.random((S, S)) > 0.9985).astype(np.float32)
dark = np.array(Image.fromarray((dark*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)))/255
base = base - dark * 0.20

# oil / rubber patches
patch = pnoise(S, 0.006, 21)
base = base - np.clip((patch - 0.60) * 1.8, 0, 1) * 0.10

rgb = np.stack([base*0.98, base*1.0, base*1.06], -1)   # slightly cool
to_img(rgb, 'assets/asphalt_new.jpg')
normal_from(h, 'assets/asphalt_new_norm.jpg', 3.4)

# ------------- ground (dry sand / dirt) -------------
low2 = pnoise(S, 0.008, 31) * 0.6 + pnoise(S, 0.03, 32) * 0.28 + pnoise(S, 0.11, 33) * 0.12
g2 = highpass(S, 41) * 0.6 + highpass(S, 42) * 0.4
h2 = np.clip(0.5 + (low2-0.5)*0.6 + g2*0.26, 0, 1)
b2 = 0.52 + (low2-0.5)*0.22 + g2*0.05
rng2 = np.random.default_rng(9)
st = (rng2.random((S, S)) > 0.9965).astype(np.float32)
st = np.array(Image.fromarray((st*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.9)))/255
b2 = b2 + st*0.25
rgb2 = np.stack([b2*1.04, b2*0.92, b2*0.76], -1)
to_img(rgb2, 'assets/ground_new.jpg')
normal_from(h2, 'assets/ground_new_norm.jpg', 2.2)

import os
for f in ['asphalt_new.jpg','asphalt_new_norm.jpg','ground_new.jpg','ground_new_norm.jpg']:
    print(f, os.path.getsize('assets/'+f)//1024, 'KB')
