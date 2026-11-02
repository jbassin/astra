"""The handout art crop: Homebrewery's image placement, translated.

In the Vol.1 CSS (``books/liturgy_vol1/liturgy_of_the_iridite_vol1.css``, "HALF PAGE ART")
an ``{{imageWrapper,<class>}}`` clips its image to a mask window of ``--maskWidth`` x
``--maskHeight`` CSS px, set by the class and overridable with ``--maskHeight:Npx`` in the
class list. The image sits at the window's top-left corner, shifted by the
``{top:Ypx,left:Xpx,width:Wpx}`` payload on its ``{{borderImage}}`` and drawn ``W`` px wide
(or ``height:Hpx`` tall) at its own aspect. So the part Homebrewery shows is a rectangle of
the image, :func:`mask_crop`, measured here in image-width units: the image is 1 wide and
``ih/iw`` tall.

handout.sty's frame is the mask scaled to the PDF page (:func:`window_size_pt`), but at most
as wide as its column (and with a fallback height when the mask is taller than the column),
so its aspect can differ; it fits that rectangle rather than stretching it: the smallest crop
of the frame's aspect that holds the whole rectangle, centred on it, shrunk to the image and
slid inside it. With no payload the frame cover-fits the image, centred, as before.

A caption's ``top:``/``left:`` payload is in page px too (the imageWrapper is not positioned,
so the page is its containing block); :func:`caption_place` turns it into a spot relative to
the image window, which sits ``3.8mm`` inside the mask frame's ``--maskLeft``/``--maskTop``.
"""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass
from pathlib import Path

#: ``.imageWrapper``'s defaults, then each window class's ``--maskWidth``/``--maskHeight``.
DEFAULT_MASK: tuple[float, float] = (332, 940)
MASKS: dict[str, tuple[float, float]] = {
    "leftSide": (332, 1048),
    "rightSide": (332, 1048),
    "fullSidebarRight": (332, 960),
    "fullSidebarLeft": (332, 960),
    "fullSidebarBottom": (714, 475),
    "narrowSidebarBottom": (714, 397),
    "fullSidebarTop": (714, 475),
    "chapterSidebarRight": (332, 802),
    "chapterSidebarLeft": (332, 802),
    "chapterSidebarLeftHalfTop": (332, 401),
    "chapterSidebarLeftHalfBottom": (332, 401),
    "chapterSidebarRightHalfTop": (332, 401),
    "chapterSidebarRightHalfBottom": (332, 401),
    "fullSidebarLeftHalfTop": (332, 480),
    "fullSidebarLeftHalfBottom": (332, 480),
    "fullSidebarRightHalfTop": (332, 480),
    "fullSidebarRightHalfBottom": (332, 480),
}
#: ``.imageWrapper``'s default ``--maskLeft``/``--maskTop``, then each window class's: where
#: the mask window's frame sits on Homebrewery's page, in CSS px from its top-left corner.
DEFAULT_ORIGIN: tuple[float, float] = (41, 29)
MASK_ORIGINS: dict[str, tuple[float, float]] = {
    "leftSide": (44, 29),
    "rightSide": (417, 29),
    "fullSidebarRight": (419, 17),
    "fullSidebarLeft": (38, 17),
    "fullSidebarBottom": (38, 502),
    "narrowSidebarBottom": (38, 580),
    "fullSidebarTop": (38, 17),
    "chapterSidebarRight": (419, 175),
    "chapterSidebarLeft": (38, 175),
    "chapterSidebarLeftHalfTop": (38, 175),
    "chapterSidebarLeftHalfBottom": (38, 576),
    "chapterSidebarRightHalfTop": (419, 175),
    "chapterSidebarRightHalfBottom": (419, 576),
    "fullSidebarLeftHalfTop": (38, 17),
    "fullSidebarLeftHalfBottom": (38, 497),
    "fullSidebarRightHalfTop": (419, 17),
    "fullSidebarRightHalfBottom": (419, 497),
}
#: Homebrewery's Letter page in CSS px, and the PDF points one CSS px is on the same page
#: (816px across 612pt).
PAGE_PX: tuple[float, float] = (816, 1056)
PT_PER_PX = 612 / 816
#: The image window's inset from the frame's corner (``.borderImage``'s ``3.8mm``), in px.
WINDOW_INSET_PX = 3.8 / 25.4 * 96
#: Where each window class puts the art on its page, as (slot, position, size). The slot is
#: ``one`` or ``two`` (a column) or ``band`` (across the text width); the position is the top
#: (``t``) or bottom (``b``) of it. A column art's size is ``full`` (it fills the column) or
#: ``half`` (it takes what the column's text leaves, within limits); a band's is ``band``.
SLOTS: dict[str, tuple[str, str, str]] = {
    "leftSide": ("one", "t", "full"),
    "rightSide": ("two", "t", "full"),
    "fullSidebarRight": ("two", "t", "full"),
    "fullSidebarLeft": ("one", "t", "full"),
    "fullSidebarBottom": ("band", "b", "band"),
    "narrowSidebarBottom": ("band", "b", "band"),
    "fullSidebarTop": ("band", "t", "band"),
    "chapterSidebarRight": ("two", "t", "full"),
    "chapterSidebarLeft": ("one", "t", "full"),
    "chapterSidebarLeftHalfTop": ("one", "t", "half"),
    "chapterSidebarLeftHalfBottom": ("one", "b", "half"),
    "chapterSidebarRightHalfTop": ("two", "t", "half"),
    "chapterSidebarRightHalfBottom": ("two", "b", "half"),
    "fullSidebarLeftHalfTop": ("one", "t", "half"),
    "fullSidebarLeftHalfBottom": ("one", "b", "half"),
    "fullSidebarRightHalfTop": ("two", "t", "half"),
    "fullSidebarRightHalfBottom": ("two", "b", "half"),
}
#: An imageWrapper with no window class: ``.imageWrapper``'s default window, right column.
DEFAULT_SLOT: tuple[str, str, str] = ("two", "t", "half")
#: The local image a lone ``{{imageWrapper}}`` falls back to, looked up in this order.
ART_NAMES: tuple[str, ...] = ("art.png", "art.jpg", "art.jpeg")
_BARE_NAME_RE = re.compile(r"\w[\w.+-]*\.(?:png|jpe?g)", re.IGNORECASE)
_PX_RE = re.compile(r"(-?[\w-]+)\s*:\s*(-?[\d.]+)px")


class ArtError(ValueError):
    """The art file or its placement cannot be read."""


@dataclass(frozen=True)
class Crop:
    """A rectangle of the image in image-width units (the image is 1 wide)."""

    x: float
    y: float
    width: float
    height: float


def mask_size(wrapper_classes: list[str]) -> tuple[float, float]:
    """The mask window in CSS px: the last window class wins, then ``--maskHeight``."""
    width, height = DEFAULT_MASK
    for cls in wrapper_classes:
        if cls in MASKS:
            width, height = MASKS[cls]
    for cls in wrapper_classes:
        for key, value in _PX_RE.findall(cls):
            if key == "--maskWidth":
                width = float(value)
            elif key == "--maskHeight":
                height = float(value)
    return width, height


def mask_origin(wrapper_classes: list[str]) -> tuple[float, float]:
    """The mask frame's (left, top) on the page in CSS px: the last window class wins, then
    ``--maskLeft``/``--maskTop``."""
    left, top = DEFAULT_ORIGIN
    for cls in wrapper_classes:
        if cls in MASK_ORIGINS:
            left, top = MASK_ORIGINS[cls]
    for cls in wrapper_classes:
        for key, value in _PX_RE.findall(cls):
            if key == "--maskLeft":
                left = float(value)
            elif key == "--maskTop":
                top = float(value)
    return left, top


def window_size_pt(wrapper_classes: list[str]) -> tuple[float, float]:
    """The image window's (width, height) in PDF points: the mask, scaled from Homebrewery's
    816px page to the 612pt one. handout.sty narrows it to the slot and falls back when it is
    taller than the room there."""
    width, height = mask_size(wrapper_classes)
    return width * PT_PER_PX, height * PT_PER_PX


@dataclass(frozen=True)
class CaptionPlace:
    """Where a caption sits in its image window, as fractions of the window.

    ``x_side`` is ``l`` (``x`` is the caption's left edge), ``r`` (its right edge) or ``""``
    (no position: the window's bottom corner on the caption's alignment side); ``y_side`` is
    ``t`` (``y`` is its top edge, measured down), ``b`` (its bottom edge) or ``""``."""

    x_side: str = ""
    x: float = 0.0
    y_side: str = ""
    y: float = 0.0


def caption_place(caption_classes: list[str], wrapper_classes: list[str]) -> CaptionPlace:
    """A ``{{caption,...,top:Ypx,left:Xpx}}``'s position (``top``/``bottom``/``left``/
    ``right``, CSS px on Homebrewery's page, since the imageWrapper is not positioned and
    the page is the captions' containing block) as fractions of the mask's image window."""
    pos = {key: float(value) for cls in caption_classes for key, value in _PX_RE.findall(cls)}
    left, top = mask_origin(wrapper_classes)
    width, height = mask_size(wrapper_classes)
    win_left, win_top = left + WINDOW_INSET_PX, top + WINDOW_INSET_PX
    x_side, x, y_side, y = "", 0.0, "", 0.0
    if "left" in pos:
        x_side, x = "l", (pos["left"] - win_left) / width
    elif "right" in pos:
        x_side, x = "r", (PAGE_PX[0] - pos["right"] - win_left) / width
    if "top" in pos:
        y_side, y = "t", (pos["top"] - win_top) / height
    elif "bottom" in pos:
        y_side, y = "b", (PAGE_PX[1] - pos["bottom"] - win_top) / height
    return CaptionPlace(x_side, x, y_side, y)


def slot_of(wrapper_classes: list[str]) -> tuple[str, str, str]:
    """(slot, position, size) for an imageWrapper's class list: the last window class wins."""
    slot = DEFAULT_SLOT
    for cls in wrapper_classes:
        slot = SLOTS.get(cls, slot)
    return slot


def find_art(handout_dir: Path) -> Path | None:
    """The folder's ``art.*`` file, if any."""
    for name in ART_NAMES:
        if (handout_dir / name).is_file():
            return handout_dir / name
    return None


def resolve_images(srcs: list[tuple[int, str]], handout_dir: Path | None) -> list[Path]:
    """The file for each image, from its (source line, ``![](...)`` target).

    A bare file name names that file in the handout folder. Anything else (a URL, a missing
    file) falls back to the folder's ``art.*``, but only when the handout has one image."""
    out: list[Path] = []
    for line, src in srcs:
        if handout_dir is not None and _BARE_NAME_RE.fullmatch(src):
            path = handout_dir / src
            if path.is_file():
                out.append(path)
                continue
        if len(srcs) > 1:
            raise ArtError(
                f"line {line}: ![]({src}) names no file in the handout folder; with several "
                "images, each needs the bare file name of an image there (like art-2.jpeg)"
            )
        fallback = find_art(handout_dir) if handout_dir is not None else None
        if fallback is None:
            raise ArtError(
                f"line {line}: the handout has an {{{{imageWrapper}}}}, but ![]({src}) names no "
                f"file in its folder and the folder has no {' / '.join(ART_NAMES)}"
            )
        out.append(fallback)
    return out


def parse_placement(payload: str) -> dict[str, float]:
    """``top:-100px,left:-250px,width:1501px`` -> ``{"top": -100, ...}`` (px values only)."""
    return {key: float(value) for key, value in _PX_RE.findall(payload)}


def mask_crop(
    placement: dict[str, float], mask: tuple[float, float], image_aspect: float
) -> Crop | None:
    """The rectangle of the image Homebrewery's mask window shows, or None without a
    ``width``/``height`` in the payload. ``image_aspect`` is height / width."""
    if "width" in placement:
        drawn_width = placement["width"]
    elif "height" in placement:
        drawn_width = placement["height"] / image_aspect
    else:
        return None
    if drawn_width <= 0:
        raise ArtError(f"image width {drawn_width}px in the placement payload")
    return Crop(
        x=-placement.get("left", 0.0) / drawn_width,
        y=-placement.get("top", 0.0) / drawn_width,
        width=mask[0] / drawn_width,
        height=mask[1] / drawn_width,
    )


def fit_crop(crop: Crop, frame_aspect: float, image_aspect: float) -> Crop:
    """The crop of aspect ``frame_aspect`` (height / width) that holds ``crop``, centred on
    it, shrunk to fit the image and slid inside it. handout.sty's ``\\ho@drawart`` does the
    same sums in pgfmath, since only TeX knows the frame's height."""
    if crop.height / crop.width > frame_aspect:
        width, height = crop.height / frame_aspect, crop.height
    else:
        width, height = crop.width, crop.width * frame_aspect
    scale = min(1.0, 1.0 / width, image_aspect / height)
    width, height = width * scale, height * scale
    cx, cy = crop.x + crop.width / 2, crop.y + crop.height / 2
    x = min(max(cx - width / 2, 0.0), 1.0 - width)
    y = min(max(cy - height / 2, 0.0), image_aspect - height)
    return Crop(x=x, y=y, width=width, height=height)


def image_size(path: Path) -> tuple[int, int]:
    """(width, height) in pixels of a PNG or JPEG, read from its header."""
    data = path.read_bytes()
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        width, height = struct.unpack(">II", data[16:24])
        return width, height
    if data.startswith(b"\xff\xd8"):
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            length = struct.unpack(">H", data[i + 2 : i + 4])[0]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE):
                height, width = struct.unpack(">HH", data[i + 5 : i + 9])
                return width, height
            i += 2 + length
    raise ArtError(f"{path.name}: not a PNG or JPEG this builder can size")
