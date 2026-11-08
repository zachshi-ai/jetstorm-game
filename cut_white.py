import numpy as np
from PIL import Image, ImageFilter
def cut(src, dst, thr=232, feather=1.2):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    h, w, _ = a.shape
    L = a.min(axis=2)          # white bg => all channels high
    close = L > thr
    bgm = np.zeros((h, w), bool)
    bgm[0,:]=close[0,:]; bgm[-1,:]=close[-1,:]; bgm[:,0]=close[:,0]; bgm[:,-1]=close[:,-1]
    for _ in range(800):
        prev = bgm.copy()
        d = bgm.copy()
        d[1:,:] |= bgm[:-1,:]; d[:-1,:] |= bgm[1:,:]
        d[:,1:] |= bgm[:,:-1]; d[:,:-1] |= bgm[:,1:]
        bgm = d & close
        if np.array_equal(bgm, prev): break
    alpha = np.where(bgm, 0.0, 1.0)
    am = Image.fromarray((alpha*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather))
    alpha = np.asarray(am).astype(np.float32)/255.0
    # de-fringe: un-premultiply white halo
    for _ in range(1):
        pass
    out = np.dstack([a, alpha*255]).astype(np.uint8)
    img = Image.fromarray(out,'RGBA')
    bb = img.split()[3].getbbox(); img = img.crop(bb)
    arr = np.asarray(img).astype(np.float32)
    al = arr[:,:,3:4]/255.0
    # pull edge pixels away from white
    rgb = arr[:,:,:3]
    rgb = np.where(al < 0.98, np.clip((rgb - (1-al)*255*0.9)/np.maximum(al,0.15), 0, 255), rgb)
    arr[:,:,:3] = rgb
    Image.fromarray(arr.astype(np.uint8)).save(dst, optimize=True)
    print(dst, img.size, 'cov', round(float((np.asarray(img)[:,:,3]>40).mean()),2))
cut('assets/car_w.png','assets/car_sprite.png')
