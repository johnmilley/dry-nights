"""Generate Dry Nights app icons (crescent moon on a night-blue field).

Pure-stdlib PNG writer so it runs anywhere. Re-run after design tweaks:
    python3 scripts/make_icons.py
"""

import struct
import zlib
from pathlib import Path

BG = (16, 20, 38)        # night blue, matches --bg dark theme
MOON = (249, 115, 22)    # warm orange, matches --dry
STAR = (238, 240, 250)


def make_icon(size: int) -> bytes:
    px = bytearray()
    cx, cy, r = 0.50, 0.52, 0.30           # main moon circle (relative coords)
    bx, by, br = 0.62, 0.42, 0.26          # "bite" circle that carves the crescent
    stars = [(0.70, 0.26, 0.030), (0.78, 0.40, 0.018), (0.26, 0.30, 0.020)]

    for y in range(size):
        for x in range(size):
            u, v = (x + 0.5) / size, (y + 0.5) / size
            color = BG
            in_moon = (u - cx) ** 2 + (v - cy) ** 2 <= r ** 2
            in_bite = (u - bx) ** 2 + (v - by) ** 2 <= br ** 2
            if in_moon and not in_bite:
                color = MOON
            else:
                for sx, sy, sr in stars:
                    if (u - sx) ** 2 + (v - sy) ** 2 <= sr ** 2:
                        color = STAR
                        break
            px.extend(color)
            px.append(255)

    raw = b''.join(b'\x00' + bytes(px[y * size * 4:(y + 1) * size * 4]) for y in range(size))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


def main() -> None:
    out = Path(__file__).resolve().parent.parent / 'icons'
    out.mkdir(exist_ok=True)
    for name, size in [('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)]:
        (out / name).write_bytes(make_icon(size))
        print(f'wrote icons/{name}')


if __name__ == '__main__':
    main()
