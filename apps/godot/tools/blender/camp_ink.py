"""Turns the passes Cycles renders into the painted look: flat light in three tones, soft contact shadows, brushy colour and
hand-wobbled ink lines. Works on the arrays only, so it runs in Blender's Python (numpy and OpenImageIO come with it)."""

import numpy as np
import OpenImageIO as oiio

INK = np.array([40, 27, 21], np.float32) / 255.0


def read(path):
    """The passes of a multilayer EXR as {"Pass.Channel": 2D array}."""
    out = {}
    f = oiio.ImageInput.open(path)
    n = 0
    while f.seek_subimage(n, 0):
        spec = f.spec()
        data = f.read_image(n, 0, 0, spec.nchannels, "float")
        data = np.asarray(data).reshape(spec.height, spec.width, spec.nchannels)
        for i, name in enumerate(spec.channelnames):
            # Every part of the file: "ViewLayer.Normal.X"; keep the last two names.
            key = ".".join(((spec.getattribute("name") or "") + "." + name).split(".")[-2:])
            out[key] = data[:, :, i]
        n += 1
    f.close()
    return out


def noise2(shape, size, seed):
    """Smooth noise in -1..1 with blobs about `size` px wide."""
    rng = np.random.default_rng(seed)
    gh, gw = int(shape[0] / size) + 4, int(shape[1] / size) + 4
    grid = rng.uniform(-1, 1, (gh, gw)).astype(np.float32)
    y, x = np.arange(shape[0]) / size + 1, np.arange(shape[1]) / size + 1
    y0, x0 = y.astype(int), x.astype(int)
    fy, fx = (y - y0).astype(np.float32), (x - x0).astype(np.float32)
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    a = grid[y0][:, x0] * (1 - fx) + grid[y0][:, x0 + 1] * fx
    b = grid[y0 + 1][:, x0] * (1 - fx) + grid[y0 + 1][:, x0 + 1] * fx
    return a * (1 - fy)[:, None] + b * fy[:, None]


def smooth(lo, hi, v):
    t = np.clip((v - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def blur(a, r):
    for axis in (0, 1):
        pad = [(r + 1, r) if i == axis else (0, 0) for i in range(a.ndim)]
        c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis, dtype=np.float64)
        n = c.shape[axis]
        hi = np.take(c, range(2 * r + 1, n), axis=axis)
        lo = np.take(c, range(0, n - 2 * r - 1), axis=axis)
        a = ((hi - lo) / (2 * r + 1)).astype(np.float32)
    return a


def edges(test):
    """A mask of the pixels whose right or lower neighbour differs by `test(dy, dx)`."""
    out = None
    for dy, dx in ((0, 1), (1, 0)):
        m = test(dy, dx)
        out = m if out is None else out | m
    return out


def near(mask, radius):
    """Distance in px to the closest set pixel, up to `radius`."""
    dist = np.full(mask.shape, radius + 1.0, np.float32)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            d = (dy * dy + dx * dx) ** 0.5
            if d <= radius:
                dist = np.where(np.roll(mask, (dy, dx), (0, 1)) & (dist > d), np.float32(d), dist)
    return dist


def warp(a, amount, size, seed):
    h, w = a.shape
    y, x = np.mgrid[0:h, 0:w]
    y = np.clip(np.rint(y + noise2(a.shape, size, seed) * amount), 0, h - 1).astype(int)
    x = np.clip(np.rint(x + noise2(a.shape, size, seed + 1) * amount), 0, w - 1).astype(int)
    return a[y, x]


def paint(path, scale, seed=3):
    """The finished picture as sRGB + alpha in 0..1; `scale` is render px per painting px."""
    p = read(path)
    z = np.minimum(p["Depth.Z"], 1e5)
    ids = np.rint(p["ink.X"] * 60000).astype(np.int32)
    normal = np.dstack([p["Normal." + c] for c in "XYZ"])
    albedo = np.dstack([p["Diffuse Color." + c] for c in "RGB"])
    light = p["Diffuse Direct.G"]
    ao = p["Ambient Occlusion.G"]
    alpha = np.clip(p["Combined.A"], 0, 1)
    shape = z.shape
    # Ids under the first step are ropes and grass: too thin to outline.
    thin = (ids > 0) & (ids < 600)
    thin_near = near(thin, 2) <= 2
    k = scale

    # Light in three tones, with a slightly uneven border between them.
    light = light / max(1e-6, np.percentile(light[alpha > 0.5], 99))
    wobble = noise2(shape, 14 * k, seed) * 0.03 + noise2(shape, 4 * k, seed + 1) * 0.02
    v = blur(light, max(1, int(k * 0.6))) + wobble
    mid, full = smooth(0.06, 0.15, v), smooth(0.45, 0.62, v)
    tone = (np.array([0.50, 0.43, 0.45], np.float32) * (1 - mid)[..., None]
            + np.array([0.76, 0.72, 0.71], np.float32) * (mid * (1 - full))[..., None]
            + np.array([1.0, 0.99, 0.96], np.float32) * (mid * full)[..., None])
    # Faces turned to the sky are a little paler than upright ones.
    tone = tone * (0.9 + 0.12 * smooth(0.2, 0.85, normal[..., 2]))[..., None]
    contact = blur(ao, int(1.5 * k))
    contact = contact / max(1e-6, np.percentile(contact[alpha > 0.5], 95))
    dark = 1 - smooth(0.15, 0.9, contact + noise2(shape, 9 * k, seed + 2) * 0.06)
    tone = tone * (1 - dark[..., None] * np.array([0.34, 0.42, 0.44], np.float32))
    srgb = np.where(albedo <= 0.0031308, albedo * 12.92, 1.055 * np.maximum(albedo, 1e-6) ** (1 / 2.4) - 0.055)
    wash = 1 + noise2(shape, 60 * k, seed + 4) * 0.035 + noise2(shape, 7 * k, seed + 5) * 0.02
    img = srgb * tone * wash[..., None]

    # Ink: heavy where something stands in front, light between touching parts, lighter still on sharp corners.
    def diff(a):
        return lambda dy, dx: np.roll(a, (-dy, -dx), (0, 1))
    zn, idn, nn = diff(z), diff(ids), diff(normal)
    gap = 14.0
    solid = ids > 0
    heavy = edges(lambda y, x: (np.abs(zn(y, x) - z) > gap) & (idn(y, x) != ids) | (np.abs(zn(y, x) - z) > 4 * gap)) & ~thin_near
    light_ = edges(lambda y, x: idn(y, x) != ids) & ~thin_near
    corner = edges(lambda y, x: (nn(y, x) * normal).sum(-1) < 0.45) & ~light_ & solid
    # Cracks drawn on the rock itself: the borders of a noise the material gives, kept only in patches.
    n, keep = p["crack.R"], p["crack.G"] > 0.5
    crack = edges(lambda y, x: ((diff(n)(y, x) > 0.5) != (n > 0.5)) & (idn(y, x) == ids)) & keep & solid
    for m in (heavy, light_, corner, crack):
        m[-1, :] = False
        m[:, -1] = False
    ink = np.zeros(shape, np.float32)
    fine = np.zeros(shape, np.float32)
    for i, (m, r, low) in enumerate(((heavy, 0.95, 0.95), (light_, 0.45, 0.8), (corner, 0.4, 0.7), (crack, 0.55, 0.8))):
        reach = int(np.ceil(r * k * 1.6)) + 1
        d = warp(near(m, reach), 0.9 * k, 9 * k, seed + 20 + i)
        width = r * k * (1 + 0.4 * noise2(shape, 16 * k, seed + 30 + i))
        line = np.clip(width - d + 0.6, 0, 1) * (low + (1 - low) * noise2(shape, 25 * k, seed + 40 + i))
        if m is heavy:
            ink = line
        else:
            fine = np.maximum(fine, line)
    # Inner lines take some of the colour they are drawn on.
    fine, ink = np.clip(fine, 0, 1)[..., None], np.clip(ink, 0, 1)
    img = img * (1 - fine) + (INK * 0.75 + img * 0.22) * fine
    img = img * (1 - ink[..., None]) + INK * ink[..., None]
    alpha = np.maximum(alpha, ink)
    return np.dstack([np.clip(img, 0, 1), alpha]).astype(np.float32)


def shrink(img, n):
    """Averages n x n blocks, weighting colour by alpha."""
    h, w = img.shape[0] // n * n, img.shape[1] // n * n
    a = img[:h, :w, 3:4]
    pre = np.dstack([img[:h, :w, :3] * a, a])
    pre = pre.reshape(h // n, n, w // n, n, 4).mean((1, 3))
    return np.dstack([pre[..., :3] / np.maximum(pre[..., 3:], 1e-6), pre[..., 3]])


def write(path, img):
    data = np.rint(np.clip(img, 0, 1) * 255).astype(np.uint8)
    out = oiio.ImageOutput.create(path)
    out.open(path, oiio.ImageSpec(data.shape[1], data.shape[0], data.shape[2], "uint8"))
    out.write_image(np.ascontiguousarray(data))
    out.close()
