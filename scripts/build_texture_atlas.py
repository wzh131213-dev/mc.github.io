#!/usr/bin/env python3
"""Build a compact per-block atlas from the CC BY-SA 4.0 Fresh Textures pack (26.3)."""
import hashlib
import io
import json
import shutil
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = json.loads((ROOT / "minecraft-26.3-registry.json").read_text(encoding="utf-8"))
OUT = ROOT / "public" / "vanilla-block-atlas.png"
CREDITS_OUT = ROOT / "public" / "TEXTURE_CREDITS.md"
TILE = 16
GRID = 64
HEADERS = {"User-Agent": "mc.github.io texture-atlas-builder/1.0 (CC-BY-SA-4.0 attribution)"}

def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read()

def load_textures(texture_root):
    """Load exact vanilla 26.3 block PNGs from InventivetalentDev/minecraft-assets."""
    block_root = Path(texture_root) / "block"
    if not block_root.is_dir():
        raise RuntimeError(f"Missing vanilla block texture directory: {block_root}")
    result = {}
    for path in block_root.rglob("*.png"):
        key = path.relative_to(block_root).with_suffix("").as_posix()
        try:
            image = Image.open(path).convert("RGBA")
            result[key] = image.resize((TILE, TILE), Image.Resampling.NEAREST)
        except Exception as exc:
            print(f"Skipping unreadable texture {path}: {exc}")
    return result

def legacy_fallback(key):
    """Use recognizable Minecraft-like colors when a pack omits a core legacy tile."""
    palettes = {
        "grass_block_top": ((92, 150, 62), "grass"),
        "grass_block_side": ((126, 91, 55), "grass_side"),
        "dirt": ((121, 85, 58), "dirt"),
        "stone": ((126, 128, 130), "stone"),
        "sand": ((218, 202, 145), "sand"),
        "water_still": ((48, 105, 176), "water"),
        "water_flow": ((48, 105, 176), "water"),
        "oak_log": ((111, 78, 46), "wood"),
        "oak_log_top": ((151, 119, 78), "rings"),
        "oak_leaves": ((55, 133, 55), "leaves"),
        "leaves": ((55, 133, 55), "leaves"),
        "oak_planks": ((157, 119, 75), "planks"),
        "cobblestone": ((119, 119, 119), "stone"),
        "glass": ((180, 213, 218), "glass"),
    }
    base, pattern = palettes.get(key, ((120, 120, 120), "stone"))
    image = Image.new("RGBA", (TILE, TILE), (*base, 255))
    draw = ImageDraw.Draw(image)
    if pattern in ("grass", "grass_side"):
        for x in range(TILE):
            for y in range(TILE):
                if pattern == "grass" or y < 4:
                    if (x * 7 + y * 11) % 9 < 3:
                        draw.point((x, y), fill=(75, 126, 49, 255))
                elif (x + y * 3) % 7 == 0:
                    draw.point((x, y), fill=(91, 62, 39, 255))
    elif pattern == "leaves":
        for y in range(TILE):
            for x in range(TILE):
                if (x * 5 + y * 3) % 13 < 3:
                    draw.point((x, y), fill=(35, 105, 42, 255))
                elif (x * 2 + y) % 17 == 0:
                    draw.point((x, y), fill=(108, 164, 64, 255))
    elif pattern == "rings":
        for y in range(TILE):
            for x in range(TILE):
                if max(abs(x - 7.5), abs(y - 7.5)) % 3 < 1:
                    draw.point((x, y), fill=(177, 145, 99, 255))
    elif pattern == "planks":
        for y in (3, 7, 11, 15):
            draw.line((0, y, 15, y), fill=(112, 82, 51, 255))
    elif pattern == "glass":
        draw.rectangle((0, 0, 15, 15), outline=(225, 240, 242, 255), width=2)
        draw.line((3, 3, 7, 3), fill=(240, 248, 248, 255))
    elif pattern == "stone":
        for x in range(0, TILE, 4):
            draw.line((x, 0, x, 15), fill=(105, 107, 109, 255))
    return image

def load_vanilla_model_resolver():
    """Read 26.3 blockstate/model JSON from Mojang's client jar; only texture IDs are used."""
    manifest = json.loads(get("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"))
    release = next((entry for entry in manifest["versions"] if entry.get("id") == "26.3"), None)
    if release is None:
        raise RuntimeError("Mojang version manifest does not contain Java 26.3")
    version_json = json.loads(get(release["url"]))
    client_url = version_json["downloads"]["client"]["url"]
    jar = zipfile.ZipFile(io.BytesIO(get(client_url)))
    model_cache = {}

    def model_textures(model_id, stack=()):
        if not model_id:
            return {}
        if ":" in model_id:
            namespace, model_path = model_id.split(":", 1)
        else:
            namespace, model_path = "minecraft", model_id
        if namespace != "minecraft":
            return {}
        key = f"{namespace}:{model_path}"
        if key in model_cache:
            return model_cache[key]
        if key in stack:
            return {}
        file_path = f"assets/{namespace}/models/{model_path}.json"
        try:
            model = json.loads(jar.read(file_path))
        except (KeyError, json.JSONDecodeError):
            model_cache[key] = {}
            return {}
        inherited = dict(model_textures(model.get("parent"), stack + (key,)))
        inherited.update(model.get("textures", {}))
        model_cache[key] = inherited
        return inherited

    def resolve_ref(ref, textures):
        visited = set()
        while isinstance(ref, str) and ref.startswith("#"):
            token = ref[1:]
            if token in visited:
                return None
            visited.add(token)
            ref = textures.get(token)
        if not isinstance(ref, str):
            return None
        if ":" in ref:
            namespace, path = ref.split(":", 1)
            if namespace != "minecraft":
                return None
        else:
            path = ref
        if path.startswith("block/"):
            return path[len("block/"):]
        return None

    def faces_for(block_name):
        try:
            state = json.loads(jar.read(f"assets/minecraft/blockstates/{block_name}.json"))
        except (KeyError, json.JSONDecodeError):
            return {}
        model_ids = []
        variants = state.get("variants")
        if isinstance(variants, dict) and variants:
            first = variants[sorted(variants.keys())[0]]
            choices = first if isinstance(first, list) else [first]
            model_ids.extend(choice.get("model") for choice in choices if isinstance(choice, dict))
        multipart = state.get("multipart")
        if isinstance(multipart, list):
            for part in multipart:
                apply = part.get("apply", {})
                choices = apply if isinstance(apply, list) else [apply]
                model_ids.extend(choice.get("model") for choice in choices if isinstance(choice, dict))
        output = {}
        for model_id in model_ids:
            textures = model_textures(model_id)
            for face, keys in {
                "top": ("up", "top", "end", "all", "side", "front"),
                "bottom": ("down", "bottom", "end", "all", "side", "front"),
                "side": ("north", "side", "all", "front", "south", "east", "west"),
            }.items():
                if face in output:
                    continue
                for texture_key in keys:
                    resolved = resolve_ref(textures.get(texture_key), textures)
                    if resolved:
                        output[face] = resolved
                        break
        return output

    return faces_for


def pick(textures, name, face, model_texture=None):
    suffixes = {"top": ("_top", "_end"), "bottom": ("_bottom", "_end"), "side": ("_side", "_front", "_all")}
    aliases = ([model_texture] if model_texture else []) + [name]
    # Wall-mounted variants reuse the corresponding standing block texture.
    aliases.append(name.replace("_wall_", "_"))
    if name.startswith("potted_"):
        aliases.append(name[len("potted_"):])
    # Strip the longest suffix first so oak_wall_sign does not become oak_wall.
    suffixes_to_strip = (
        "_wall_hanging_sign", "_wall_coral_fan", "_wall_banner", "_wall_head",
        "_wall_skull", "_wall_torch", "_wall_sign", "_hanging_sign", "_standing_sign",
        "_fence_gate", "_pressure_plate", "_trapdoor", "_stairs", "_slab", "_fence",
        "_button", "_door", "_sign", "_head", "_skull", "_banner", "_bed", "_carpet",
        "_coral_fan", "_wall",
    )
    for alias in tuple(aliases):
        base = alias
        for suffix in suffixes_to_strip:
            if base.endswith(suffix):
                base = base[:-len(suffix)]
                break
        aliases.extend((base, base + "_planks", base + "_log", base + "_block", base.replace("_block", "")))
    seen = set()
    for alias in aliases:
        if not alias or alias in seen:
            continue
        seen.add(alias)
        for candidate in tuple(alias + suffix for suffix in suffixes[face]) + (alias,):
            if candidate in textures:
                return textures[candidate]
    return None

def main():
    texture_root = Path(__import__("os").environ.get("MINECRAFT_TEXTURES_DIR", ROOT / "assets" / "minecraft" / "textures"))
    textures = load_textures(texture_root)
    version = "26.3"
    vanilla_faces = load_vanilla_model_resolver()
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
    legacy_aliases = {
        "grass_block_top": ("grass_block_top", "grass_block"),
        "grass_block_side": ("grass_block_side", "grass_side"),
        "water_still": ("water_still", "water_still"),
        "oak_leaves": ("oak_leaves", "leaves", "oak_leaves_opaque"),
    }
    for index, key in enumerate(legacy_sources):
        candidates = legacy_aliases.get(key, (key,))
        image = next((textures[candidate] for candidate in candidates if candidate in textures), None)
        if image is None:
            image = legacy_fallback(key)
            print(f"Core texture missing: {key}; using semantic fallback")
        # Do not use the image as its own paste mask: that multiplies alpha twice
        # and makes transparent foliage/item edges unexpectedly dark.
        atlas.paste(image, ((index % GRID) * TILE, (index // GRID) * TILE))
    matched = 0
    for index, block in enumerate(REGISTRY["blocks"]):
        name = block["name"]
        for face_index, face in enumerate(("top", "bottom", "side")):
            model_texture = vanilla_faces(name).get(face)
            image = pick(textures, name, face, model_texture)
            if image is not None:
                matched += 1
            else:
                image = fallback(name, face_index)
            tile = 12 + index * 3 + face_index
            atlas.paste(image, ((tile % GRID) * TILE, (tile // GRID) * TILE))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT, optimize=True)
    item_root = texture_root / "item"
    item_out = ROOT / "public" / "minecraft-item-textures"
    if not item_root.is_dir():
        raise RuntimeError(f"Missing vanilla item texture directory: {item_root}")
    if item_out.exists():
        shutil.rmtree(item_out)
    shutil.copytree(item_root, item_out)
    item_count = sum(1 for path in item_out.rglob("*.png"))
    shutil.copyfile(ROOT / "TEXTURE_CREDITS.md", CREDITS_OUT)
    print(f"InventivetalentDev minecraft-assets {version}: {len(textures)} vanilla block textures; {item_count} item textures")
    print(f"Mapped {matched}/{len(REGISTRY["blocks"]) * 3} block faces from vanilla model references")
    print(f"Atlas: {OUT} ({atlas.width}x{atlas.height})")

if __name__ == "__main__":
    main()
