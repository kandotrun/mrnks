#!/usr/bin/env python3
"""Generate the production LINE rich-menu image for まるのこし."""

from pathlib import Path
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

WIDTH = 2500
HEIGHT = 843
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "rich-menu.png"


def find_font_path() -> Path:
    configured = os.environ.get("RICH_MENU_FONT", "").strip()
    candidates = [
        Path(configured) if configured else None,
        Path.home() / ".local/share/fonts/clinicalai-ci/NotoSansCJKjp-Regular.otf",
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJKjp-Regular.otf"),
    ]
    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate

    try:
        result = subprocess.run(
            ["fc-match", "-f", "%{file}\\n", "Noto Sans CJK JP"],
            check=True,
            capture_output=True,
            text=True,
        )
        matched = Path(result.stdout.splitlines()[0])
        if matched.exists():
            return matched
    except (FileNotFoundError, subprocess.CalledProcessError, IndexError):
        pass

    raise SystemExit("Japanese font not found. Set RICH_MENU_FONT to a Japanese OpenType/TrueType font.")


FONT_PATH = find_font_path()


def font(size: int) -> ImageFont.FreeTypeFont:
    if not FONT_PATH.exists():
        raise SystemExit(f"Japanese font not found: {FONT_PATH}")
    return ImageFont.truetype(str(FONT_PATH), size=size)


def rounded_gradient(
    image: Image.Image,
    box: tuple[int, int, int, int],
    top: tuple[int, int, int],
    bottom: tuple[int, int, int],
    radius: int,
) -> None:
    x1, y1, x2, y2 = box
    width = x2 - x1
    height = y2 - y1
    layer = Image.new("RGB", (width, height), top)
    layer_draw = ImageDraw.Draw(layer)
    for y in range(height):
        ratio = y / max(height - 1, 1)
        color = tuple(round(top[i] * (1 - ratio) + bottom[i] * ratio) for i in range(3))
        layer_draw.line((0, y, width, y), fill=color)
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=255)
    image.paste(layer, (x1, y1), mask)


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    image = Image.new("RGB", (WIDTH, HEIGHT), "#f5f5f5")
    draw = ImageDraw.Draw(image)

    # Bootstrap 2-like page background.
    for y in range(HEIGHT):
        ratio = y / (HEIGHT - 1)
        start = (250, 250, 250)
        end = (229, 229, 229)
        color = tuple(round(start[i] * (1 - ratio) + end[i] * ratio) for i in range(3))
        draw.line((0, y, WIDTH, y), fill=color)

    # Classic light navbar.
    for y in range(118):
        ratio = y / 117
        start = (255, 255, 255)
        end = (238, 238, 238)
        color = tuple(round(start[i] * (1 - ratio) + end[i] * ratio) for i in range(3))
        draw.line((0, y, WIDTH, y), fill=color)
    draw.rectangle((0, 116, WIDTH, 120), fill="#c9c9c9")
    draw.text((92, 25), "まるのこし", font=font(57), fill="#333333", stroke_width=1, stroke_fill="#ffffff")
    draw.text((470, 44), "LINEで使う家族アルバム", font=font(32), fill="#777777")

    # Content well.
    draw.rounded_rectangle((80, 165, 2420, 772), radius=18, fill="#f5f5f5", outline="#d0d0d0", width=4)
    draw.line((100, 190, 2400, 190), fill="#ffffff", width=4)

    # Bootstrap 2 success label.
    draw.rounded_rectangle((140, 225, 474, 289), radius=7, fill="#468847")
    draw.text((171, 236), "原本保存モード", font=font(31), fill="#ffffff")

    draw.text((140, 327), "写真と動画を、画質ごと残す。", font=font(88), fill="#333333", stroke_width=1, stroke_fill="#ffffff")
    draw.text((145, 455), "LINEから家族アルバムを開いて、原本のまま保存できます。", font=font(42), fill="#666666")

    # Simple photo-stack mark.
    draw.rounded_rectangle((156, 570, 302, 686), radius=10, fill="#ffffff", outline="#bcbcbc", width=5)
    draw.rounded_rectangle((181, 545, 327, 661), radius=10, fill="#ffffff", outline="#8d8d8d", width=5)
    draw.ellipse((205, 568, 239, 602), fill="#f4b942")
    draw.polygon(((200, 638), (244, 602), (275, 629), (306, 594), (306, 642)), fill="#5aa7d8")
    draw.text((359, 566), "家族の写真・動画を追加", font=font(43), fill="#444444")
    draw.text((361, 629), "タップするとアルバムが開きます", font=font(31), fill="#777777")

    # Classic beveled primary button.
    button_box = (1690, 330, 2280, 584)
    draw.rounded_rectangle((1702, 344, 2292, 598), radius=18, fill="#b4b4b4")
    rounded_gradient(image, button_box, (0, 136, 204), (0, 68, 204), radius=18)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(button_box, radius=18, outline="#003bb3", width=5)
    draw.line((1714, 347, 2256, 347), fill="#46b8da", width=4)
    draw.text((1792, 392), "アルバムを", font=font(61), fill="#ffffff", stroke_width=2, stroke_fill="#004099")
    draw.text((1857, 476), "開く  ›", font=font(65), fill="#ffffff", stroke_width=2, stroke_fill="#004099")

    image.save(OUTPUT, format="PNG", optimize=True)
    print(f"generated={OUTPUT}")
    print(f"size={image.width}x{image.height}")
    print(f"bytes={OUTPUT.stat().st_size}")


if __name__ == "__main__":
    main()
