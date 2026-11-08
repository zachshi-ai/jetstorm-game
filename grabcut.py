import cv2, numpy as np, os
def cut(src, dst, iters=7):
    img = cv2.imread(src, cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    bm = np.zeros((1, 65), np.float64)
    # generous rect: everything inside is probable foreground
    m = int(min(h, w) * 0.02)
    rect = (m, m, w - 2*m, h - 2*m)
    bgd, fgd = np.zeros((1,65), np.float64), np.zeros((1,65), np.float64)
    cv2.grabCut(img, mask, rect, bgd, fgd, iters, cv2.GC_INIT_WITH_RECT)
    a = np.where((mask == 2) | (mask == 0), 0, 1).astype('uint8') * 255
    # clean small holes / specks
    k = np.ones((3, 3), np.uint8)
    a = cv2.morphologyEx(a, cv2.MORPH_CLOSE, k, iterations=2)
    a = cv2.morphologyEx(a, cv2.MORPH_OPEN, k, iterations=1)
    # keep largest component
    n, lab, stats, _ = cv2.connectedComponentsWithStats((a > 127).astype(np.uint8), 8)
    if n > 1:
        idx = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        a = ((lab == idx).astype(np.uint8)) * 255
    a = cv2.GaussianBlur(a, (3, 3), 0.8)
    rgba = cv2.cvtColor(img, cv2.COLOR_BGR2RGBA)
    rgba[:, :, 3] = a
    ys, xs = np.where(a > 20)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    crop = rgba[y0:y1+1, x0:x1+1]
    cv2.imwrite(dst, crop)
    print(dst, crop.shape[1], 'x', crop.shape[0], 'coverage', round((crop[:,:,3]>40).mean(), 2))

cut('assets/car_rear.png', 'assets/car_rear_cut.png')
cut('assets/car_jet.png', 'assets/car_jet_cut.png')
