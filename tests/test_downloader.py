import pytest
import httpx
import respx
from pathlib import Path
from _fetch.downloader import download_image, content_hash, safe_filename


@pytest.mark.asyncio
@respx.mock
async def test_download_image_saves_file(tmp_path):
    img_bytes = b"\xff\xd8\xff" + b"x" * 100
    respx.get("https://example.com/img.jpg").mock(
        return_value=httpx.Response(200, content=img_bytes, headers={"content-type": "image/jpeg"})
    )
    dest = tmp_path / "out.jpg"
    async with httpx.AsyncClient() as client:
        ok = await download_image("https://example.com/img.jpg", dest, client)
    assert ok is True
    assert dest.exists()
    assert dest.read_bytes() == img_bytes


@pytest.mark.asyncio
@respx.mock
async def test_download_image_rejects_non_image(tmp_path):
    respx.get("https://example.com/page.html").mock(
        return_value=httpx.Response(200, content=b"<html>", headers={"content-type": "text/html"})
    )
    dest = tmp_path / "bad.jpg"
    async with httpx.AsyncClient() as client:
        ok = await download_image("https://example.com/page.html", dest, client)
    assert ok is False
    assert not dest.exists()


@pytest.mark.asyncio
@respx.mock
async def test_download_image_rejects_404(tmp_path):
    respx.get("https://example.com/missing.jpg").mock(return_value=httpx.Response(404))
    dest = tmp_path / "missing.jpg"
    async with httpx.AsyncClient() as client:
        ok = await download_image("https://example.com/missing.jpg", dest, client)
    assert ok is False


def test_content_hash_consistent():
    data = b"hello world"
    assert content_hash(data) == content_hash(data)
    assert content_hash(data) != content_hash(b"other")
    assert len(content_hash(data)) == 16


def test_safe_filename_basic():
    name = safe_filename("https://example.com/file.jpg", "Eagle of Rome", 0)
    assert name.endswith(".jpg")
    assert "eagle" in name.lower()
    assert "000" in name


def test_safe_filename_strips_query_string():
    name = safe_filename("https://cdn.example.com/img.png?w=800&h=600", "Test", 1)
    assert name.endswith(".png")
