"""The handout art crop (``handout_art.py``): Homebrewery's mask window and borderImage
payload turned into a rectangle of the image, then fitted to the frame's aspect."""

from __future__ import annotations

import struct
from pathlib import Path

import pytest
from astra_assay import handout_art, handout_latex
from astra_assay.handout import parse_handout
from astra_assay.handout_art import Crop, fit_crop, mask_crop, mask_size, parse_placement

FIXTURE = Path(__file__).parent / "fixtures" / "handout"


def _close(a: Crop, b: Crop) -> None:
    for field in ("x", "y", "width", "height"):
        assert getattr(a, field) == pytest.approx(getattr(b, field)), field


def test_mask_size_from_the_class_list() -> None:
    assert mask_size([]) == handout_art.DEFAULT_MASK
    assert mask_size(["chapterSidebarRightHalfTop"]) == (332, 401)
    assert mask_size(["chapterSidebarRight"]) == (332, 802)
    assert mask_size(["chapterSidebarRightHalfTop", "--maskHeight:520px;"]) == (332, 520)


def test_parse_placement() -> None:
    assert parse_placement("top:-100px,left:-250px,width:1501px") == {
        "top": -100,
        "left": -250,
        "width": 1501,
    }
    assert parse_placement("top:-000px,left:-000px,width:350px") == {
        "top": 0,
        "left": 0,
        "width": 350,
    }
    assert parse_placement("") == {}


def test_mask_crop_iron_seraph() -> None:
    """1920x1501 drawn 1501px wide, shifted (-250, -100), in a 332x520 window."""
    crop = mask_crop({"top": -100, "left": -250, "width": 1501}, (332, 520), 1501 / 1920)
    assert crop is not None
    _close(crop, Crop(250 / 1501, 100 / 1501, 332 / 1501, 520 / 1501))
    # In source pixels: x 320-744, y 128-793 of the 1920-wide image.
    assert round(crop.x * 1920) == 320
    assert round((crop.x + crop.width) * 1920) == 744
    assert round(crop.y * 1920) == 128


def test_mask_crop_from_height_and_without_size() -> None:
    crop = mask_crop({"height": 600, "top": 0}, (332, 401), 1.5)
    assert crop is not None
    _close(crop, Crop(0, 0, 332 / 400, 401 / 400))  # 600px tall at aspect 1.5 is 400px wide
    assert mask_crop({"top": -40}, (332, 401), 1.5) is None
    with pytest.raises(handout_art.ArtError):
        mask_crop({"width": 0}, (332, 401), 1.5)


def test_fit_crop_taller_frame_keeps_width_and_centre() -> None:
    crop = Crop(0.2, 0.1, 0.2, 0.3)  # aspect 1.5
    fitted = fit_crop(crop, frame_aspect=2.0, image_aspect=1.0)
    _close(fitted, Crop(0.2, 0.05, 0.2, 0.4))


def test_fit_crop_wider_frame_keeps_height_and_centre() -> None:
    crop = Crop(0.4, 0.1, 0.2, 0.3)
    fitted = fit_crop(crop, frame_aspect=1.0, image_aspect=1.0)
    _close(fitted, Crop(0.35, 0.1, 0.3, 0.3))


def test_fit_crop_slides_inside_and_shrinks_to_the_image() -> None:
    # Centred at the image's top-left corner: slides to (0, 0).
    _close(fit_crop(Crop(-0.1, -0.1, 0.2, 0.2), 1.0, 1.0), Crop(0, 0, 0.2, 0.2))
    # Wider than the image: shrunk to its full width, keeping the frame's aspect.
    _close(fit_crop(Crop(0, 0, 0.95, 1.49), 1.6, 1.5), Crop(0.475 - 0.75 / 1.6, 0, 1.5 / 1.6, 1.5))


def test_image_size_png_and_jpeg(tmp_path: Path) -> None:
    assert handout_art.image_size(FIXTURE / "art.png") == (8, 12)
    sof0 = b"\xff\xc0" + struct.pack(">HBHHB", 11, 8, 1501, 1920, 3) + b"\x00" * 6
    jpeg = tmp_path / "art.jpeg"
    jpeg.write_bytes(b"\xff\xd8" + b"\xff\xe0" + struct.pack(">H", 4) + b"JF" + sof0)
    assert handout_art.image_size(jpeg) == (1920, 1501)
    bad = tmp_path / "art.gif"
    bad.write_bytes(b"GIF89a")
    with pytest.raises(handout_art.ArtError):
        handout_art.image_size(bad)


def test_fixture_emits_the_payload_crop() -> None:
    """The fixture's payload is Iron Seraph's, on an 8x12 image (aspect 1.5)."""
    handout = parse_handout((FIXTURE / "handout.md").read_text(encoding="utf-8"))
    assert handout.art is not None
    assert handout.art.placement == "top:-100px,left:-250px,width:1501px"
    tex = handout_latex.build_handout_tex(handout, FIXTURE / "art.png")
    assert "\\handoutartcrop{0.16656}{0.06662}{0.22119}{0.34644}{1.50000}" in tex


def test_no_payload_keeps_cover_fit() -> None:
    source = (FIXTURE / "handout.md").read_text(encoding="utf-8")
    source = source.replace(" {top:-100px,left:-250px,width:1501px}", "")
    tex = handout_latex.build_handout_tex(parse_handout(source), FIXTURE / "art.png")
    assert "\\handoutart{art.png}" in tex
    assert "\\handoutartcrop" not in tex
