#!/usr/bin/env python3
"""Build a compact per-block atlas from the CC BY-SA 4.0 Fresh Textures pack (26.3)."""
import hashlib
import io
import json
import os
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = json.loads((ROOT / "minecraft-26.3-registry.json").read_text(encoding="utf-8"))
OUT = ROOT / "public" / "vanilla-block-atlas.png"
TILE = 16
GRID = 64
HEADERS = {"User-Agent": "mc.github.io texture-atlas-builder/1.0 (CC-BY-SA-4.0 attribution)"}

def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read()

def find_pack():
    query = urllib.parse.urlencode({"game_versions": json.dumps(["26.3"])})
    versions = json.loads(get("https://api.modrinth.com/v2/project/fresh-textures/version?" + query))
    if not versions:
        raise RuntimeError("Modrinth returned no Fresh Textures release for Minecraft 26.3")
    versions.sort(key=lambda v: v.get("date_published", ""), reverse=True)
    version = versions[0]
    files = version.get("files", [])
    if not files:
        raise RuntimeError("Fresh Textures version has no downloadable files")
    file = next((f for f in files if f.get("primary")), files[0])
    payload = get(file["url"])
    expected = file.get("hashes", {}).get("sha512")
    if expected and hashlib.sha512(payload).hexdigest() != expected:
        raise RuntimeError("Fresh Textures SHA-512 verification failed")
    return zipfile.ZipFile(io.BytesIO(payload)), version.get("version_number", "unknown")

def load_textures(pack):
    result = {}
    for name in pack.namelist():
        prefix = "assets/minecraft/textures/block/"
        if name.startswith(prefix) and name.lower().endswith(".png"):
            key = name[len(prefix):-4]
            try:
                image = Image.open(io.BytesIO(pack.read(name))).convert("RGBA")
                result[key] = image.resize((TILE, TILE), Image.Resampling.NEAREST)
            except Exception:
                continue
    return result

def fallback(name, face):
    digest = hashlib.sha256((name + ":" + str(face)).encode()).digest()
    base = [55 + digest[0] % 150, 55 + digest[1] % 150, 55 + digest[2] % 150]
    image = Image.new("RGBA", (TILE, TILE), (*base, 255))
    draw = ImageDraw.Draw(image)
    kind = digest[3] % 5
    for y in range(TILE):
        for x in range(TILE):
            if kind == 0 and (x + y) % 5 == 0:
                draw.point((x, y), fill=tuple(max(0, c - 35) for c in base) + (255,))
            elif kind == 1 and (x % 4 == 0 or y % 4 == 0):
                draw.point((x, y), fill=tuple(max(0, c - 30) for c in base) + (255,))
            elif kind == 2 and (x * 3 + y * 5 + digest[4]) % 11 == 0:
                draw.point((x, y), fill=tuple(min(255, c + 35) for c in base) + (255,))
            elif kind == 3 and x in (0, 15) or kind == 3 and y in (0, 15):
                draw.point((x, y), fill=(220, 220, 220, 255))
    return image

def pick(textures, name, face):
    suffixes = {"top": ("_top", "_end"), "bottom": ("_bottom", "_end"), "side": ("_side", "_front", "_all")}
    direct = [name + suffix for suffix in suffixes[face]] + [name]
    for candidate in direct:
        if candidate in textures:
            return textures[candidate]
    # Slabs, stairs, walls, doors, signs and redstone variants usually share their material texture.
    base = name
    for suffix in ("_stairs", "_slab", "_wall", "_fence_gate", "_fence", "_button", "_pressure_plate", "_door", "_trapdoor", "_sign", "_hanging_sign", "_wall_sign", "_head", "_skull", "_banner", "_bed", "_carpet"):
        if base.endswith(suffix):
            base = base[:-len(suffix)]
            break
    candidates = [base, base.replace("_planks", "_planks"), base.replace("_block", ""), "stone"]
    for candidate in candidates:
        if candidate in textures:
            return textures[candidate]
    return None

def main():
    pack, version = find_pack()
    textures = load_textures(pack)
    if len(textures) < 80:
        raise RuntimeError(f"Texture pack extraction suspiciously small: {len(textures)} textures")
    atlas = Image.new("RGBA", (GRID * TILE, GRID * TILE), (0, 0, 0, 0))
    # Stable legacy tiles keep existing worlds visually consistent.
    legacy = [
        ("grass_block_top", "grass_block_side", "dirt"),
        ("dirt", "dirt", "dirt"),
        ("stone", "stone", "stone"),
        ("sand", "sand", "sand"),
        ("water_still", "water_still", "water_flow"),
        ("oak_log_top", "oak_log", "oak_log_top"),
        ("oak_leaves", "oak_leaves", "oak_leaves"),
        ("oak_planks", "oak_planks", "oak_planks"),
        ("cobblestone", "cobblestone", "cobblestone"),
        ("glass", "glass", "glass"),
    ]
    # Legacy block tile IDs: 0 grass top, 1 grass side, 2 dirt, 3 stone, 4 sand,
    # 5 water, 6 oak log side, 7 oak log top, 8 leaves, 9 planks, 10 cobble, 11 glass.
    legacy_sources = ["grass_block_top","grass_block_side","dirt","stone","sand","water_still","oak_log","oak_log_top","oak_leaves","oak_planks","cobblestone","glass"]
    for index, key in enumerate(legacy_sources):
        image = textures.get(key) or fallback("legacy_" + key, index % 3)
        atlas.paste(image, ((index % GRID) * TILE, (index // GRID) * TILE), image)
    matched = 0
    for index, block in enumerate(REGISTRY["blocks"]):
        name = block["name"]
        for face_index, face in enumerate(("top", "bottom", "side")):
            image = pick(textures, name, face)
            if image is not None:
                matched += 1
            else:
                image = fallback(name, face_index)
            tile = 12 + index * 3 + face_index
            atlas.paste(image, ((tile % GRID) * TILE, (tile // GRID) * TILE), image)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT, optimize=True)
    print(f"Fresh Textures {version} (CC BY-SA 4.0): {len(textures)} source textures")
    print(f"Mapped {matched}/{len(REGISTRY['blocks']) * 3} block faces; unique fallback faces generated for missing names")
    print(f"Atlas: {OUT} ({atlas.width}x{atlas.height})")

if __name__ == "__main__":
    main()
