import numpy as np
from PIL import Image, ImageFilter

def cut(src, dst, tol=26, feather=1.2):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    h, w, _ = a.shape
    # background colour estimated from the 4 corners
    corners = np.concatenate([a[:20,:20].reshape(-1,3), a[:20,-20:].reshape(-1,3),
                              a[-20:,:20].reshape(-1,3), a[-20:,-20:].reshape(-1,3)])
    bg = np.median(corners, axis=0)
    dist = np.abs(a - bg).max(axis=2)
    close = dist < tol
    # flood fill from the border so interior dark pixels (tyres, glass) stay opaque
    bgm = np.zeros((h, w), bool)
    bgm[0, :] = close[0, :]; bgm[-1, :] = close[-1, :]
    bgm[:, 0] = close[:, 0]; bgm[:, -1] = close[:, -1]
    for _ in range(400):
        prev = bgm
        d = bgm.copy()
        d[1:, :] |= bgm[:-1, :]; d[:-1, :] |= bgm[1:, :]
        d[:, 1:] |= bgm[:, :-1]; d[:, :-1] |= bgm[:, 1:]
        bgm = d & close
        if np.array_equal(bgm, prev):
            break
    alpha = np.where(bgm, 0.0, 1.0)
    # soften a touch
    am = Image.fromarray((alpha*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather))
    alpha = np.asarray(am).astype(np.float32)/255.0
    out = np.dstack([a, alpha*255]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    bbox = img.split()[3].getbbox()
    img = img.crop(bbox)
    img.save(dst)
    print(dst, img.size)

cut('assets/car_rear.png', 'assets/car_rear_cut.png')
cut('assets/car_jet.png', 'assets/car_jet_cut.png')
