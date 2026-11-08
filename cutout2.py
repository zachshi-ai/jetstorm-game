import numpy as np
from PIL import Image, ImageFilter

def cut(src, dst, thr=62, feather=1.4):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    h, w, _ = a.shape
    L = a.max(axis=2)
    close = L < thr
    bgm = np.zeros((h, w), bool)
    bgm[0, :] = close[0, :]; bgm[-1, :] = close[-1, :]
    bgm[:, 0] = close[:, 0]; bgm[:, -1] = close[:, -1]
    for _ in range(600):
        prev = bgm
        d = bgm.copy()
        d[1:, :] |= bgm[:-1, :]; d[:-1, :] |= bgm[1:, :]
        d[:, 1:] |= bgm[:, :-1]; d[:, :-1] |= bgm[:, 1:]
        bgm = d & close
        if np.array_equal(bgm, prev):
            break
    fg = ~bgm
    # keep only the largest blob region -> drop stray specks
    alpha = fg.astype(np.float32)
    am = Image.fromarray((alpha*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather))
    alpha = np.asarray(am).astype(np.float32)/255.0
    out = np.dstack([a, alpha*255]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    bb = img.split()[3].getbbox()
    img = img.crop(bb)
    img.save(dst)
    cov = (np.asarray(img)[:,:,3] > 40).mean()
    print(dst, img.size, 'coverage %.2f' % cov)

cut('assets/car_rear.png', 'assets/car_rear_cut.png')
cut('assets/car_jet.png', 'assets/car_jet_cut.png')
