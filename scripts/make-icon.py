#!/usr/bin/env python3
"""Generate build/icon.png (512x512) for the app and its AppImage.

Requires Pillow. Run from the repository root:
    python3 scripts/make-icon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 512
TOP = (111, 155, 255)
BOTTOM = (122, 76, 255)
OUT = Path(__file__).resolve().parent.parent / "build" / "icon.png"

FONT_CANDIDATES = [
    "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/liberation-sans-fonts/LiberationSans-Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default(size)


def rounded_gradient() -> Image.Image:
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gradient = Image.new("RGBA", (SIZE, SIZE))
    pixels = gradient.load()
    for y in range(SIZE):
        t = y / (SIZE - 1)
        color = (
            round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
            round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
            round(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
            255,
        )
        for x in range(SIZE):
            pixels[x, y] = color

    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, SIZE - 1, SIZE - 1), radius=112, fill=255
    )
    canvas.paste(gradient, (0, 0), mask)
    return canvas


def main() -> None:
    icon = rounded_gradient()
    draw = ImageDraw.Draw(icon)
    font = load_font(188)
    text = "CHD"
    # Manual letter spacing keeps the mark compact and even.
    spacing = 10
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x = (SIZE - total) / 2
    bbox = draw.textbbox((0, 0), text, font=font)
    y = (SIZE - (bbox[3] - bbox[1])) / 2 - bbox[1] - 6
    for ch, width in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=(255, 255, 255, 255))
        x += width + spacing

    OUT.parent.mkdir(parents=True, exist_ok=True)
    icon.save(OUT)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
