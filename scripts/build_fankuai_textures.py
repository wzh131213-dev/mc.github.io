#!/usr/bin/env python3
"""Export every Minecraft 26.3 block face and item as independent files in public/fankuai/."""
import io
import json
import os
import shutil
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

from build_texture_atlas import ROOT, REGISTRY, TILE, load_textures, pick, fallback, get, load_vanilla_model_resolver

FACE_NAMES = ("top", "bottom", "north", "south", "east", "west")
OUT = ROOT / "public" / "fankuai"


def main():
    texture_root = Path(os.environ.get("MINECRAFT_TEXTURES_DIR", ROOT / "assets" / "minecraft" / "textures"))
    textures = load_textures(texture_root)
    if len(textures) < 80:
        raise RuntimeError(f"Texture pack extraction suspiciously small: {len(textures)} textures")

    # Resolve exact directional texture references from vanilla blockstate/model JSON.
    manifest = json.loads(get("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"))
    release = next((entry for entry in manifest["versions"] if entry.get("id") == "26.3"), None)
    if release is None:
        raise RuntimeError("Mojang version manifest does not contain Java 26.3")
    version_json = json.loads(get(release["url"]))
    jar = zipfile.ZipFile(io.BytesIO(get(version_json["downloads"]["client"]["url"])))
    model_cache = {}

    def model(model_id):
        if not model_id:
            return {}
        namespace, _, path = model_id.partition(":")
        if not _:
            namespace, path = "minecraft", model_id
        if namespace != "minecraft":
            return {}
        try:
            return json.loads(jar.read(f"assets/{namespace}/models/{path}.json"))
        except (KeyError, json.JSONDecodeError):
            return {}

    def textures_for(model_id, stack=()):
        if not model_id:
            return {}
        key = model_id if ":" in model_id else f"minecraft:{model_id}"
        if key in stack:
            return {}
        if key in model_cache:
            return model_cache[key]
        current = model(key)
        merged = dict(textures_for(current.get("parent"), stack + (key,)))
        merged.update(current.get("textures", {}))
        model_cache[key] = merged
        return merged

    def resolve(ref, slots):
        seen = set()
        while isinstance(ref, str) and ref.startswith("#"):
            token = ref[1:]
            if token in seen:
                return None
            seen.add(token)
            ref = slots.get(token)
        if not isinstance(ref, str):
            return None
        namespace, sep, path = ref.partition(":")
        if sep and namespace != "minecraft":
            return None
        if not sep:
            path = ref
        return path[6:] if path.startswith("block/") else None

    def choose_variant(variants):
        if "" in variants:
            return variants[""]
        preferred = {"axis":"y","facing":"north","half":"lower","hinge":"left","part":"single","type":"bottom","age":"0","stage":"0","lit":"false","open":"false","powered":"false","waterlogged":"false","persistent":"false","snowy":"false","rotation":"0"}
        def score(key):
            states = dict(part.split("=", 1) for part in key.split(",") if "=" in part)
            return sum(states.get(k) == v for k, v in preferred.items())
        return variants[max(sorted(variants), key=score)]

    def directional_refs(block_name):
        try:
            state = json.loads(jar.read(f"assets/minecraft/blockstates/{block_name}.json"))
        except (KeyError, json.JSONDecodeError):
            return {}
        choices = []
        variants = state.get("variants")
        if isinstance(variants, dict) and variants:
            selected = choose_variant(variants)
            choices.extend(selected if isinstance(selected, list) else [selected])
        elif isinstance(state.get("multipart"), list):
            for part in state["multipart"]:
                apply = part.get("apply", {})
                choices.extend(apply if isinstance(apply, list) else [apply])
        result = {}
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            model_id = choice.get("model")
            slots = textures_for(model_id)
            definition = model(model_id)
            elements = definition.get("elements")
            if not isinstance(elements, list):
                # Parent models such as cube_all/cube_column expose conventional slots.
                for face, slot_names in {
                    "top":("up","top","end","all"),
                    "bottom":("down","bottom","end","all"),
                    "north":("side","all","front"),
                    "south":("side","all","front"),
                    "east":("side","all","front"),
                    "west":("side","all","front"),
                }.items():
                    ref = next((slots.get(slot) for slot in slot_names if slots.get(slot)), None)
                    path = resolve(ref, slots)
                    if path and face not in result:
                        result[face] = path
                continue
            for element in elements:
                faces = element.get("faces", {})
                if not isinstance(faces, dict):
                    continue
                for face in FACE_NAMES:
                    data = faces.get(face)
                    if isinstance(data, dict):
                        path = resolve(data.get("texture"), slots)
                        if path and face not in result:
                            result[face] = path
                if "all" in faces:
                    path = resolve(faces["all"].get("texture") if isinstance(faces["all"], dict) else None, slots)
                    if path:
                        for face in FACE_NAMES:
                            result.setdefault(face, path)
        return result

    if OUT.exists():
        shutil.rmtree(OUT)
    block_root = OUT / "blocks"
    item_out = OUT / "items"
    counts = {"blocks": 0, "block_face_files": 0, "items": 0, "vanilla_faces": 0, "fallback_faces": 0}
    manifest_blocks = {}
    for block in REGISTRY["blocks"]:
        name = block["name"]
        target = block_root / name
        target.mkdir(parents=True, exist_ok=True)
        refs = directional_refs(name)
        saved = {}
        for face_index, face in enumerate(FACE_NAMES):
            key = refs.get(face)
            image = textures.get(key) if key else None
            if image is None:
                # Reuse the model-resolved side texture only when the model has no
                # directional UV distinction; each output face remains its own file.
                if face in ("north", "south", "east", "west"):
                    side_key = refs.get("north") or refs.get("south") or refs.get("east") or refs.get("west")
                    image = textures.get(side_key) if side_key else None
                if image is None:
                    image = pick(textures, name, "top" if face == "top" else "bottom" if face == "bottom" else "side", key)
            if image is None:
                image = fallback(name, 0 if face == "top" else 1 if face == "bottom" else 2)
                counts["fallback_faces"] += 1
            else:
                counts["vanilla_faces"] += 1
            filename = f"{face}.png"
            image.save(target / filename, optimize=True)
            saved[face] = f"blocks/{name}/{filename}"
            counts["block_face_files"] += 1
        manifest_blocks[name] = saved
        counts["blocks"] += 1

    if not (texture_root / "item").is_dir():
        raise RuntimeError(f"Missing vanilla item texture directory: {texture_root / 'item'}")
    shutil.copytree(texture_root / "item", item_out)
    counts["items"] = sum(1 for path in item_out.rglob("*.png"))
    report = {
        "minecraft_version": "26.3",
        "layout": "one PNG per block face; item PNGs retain original individual files",
        "face_order": list(FACE_NAMES),
        "counts": counts,
        "blocks": manifest_blocks,
    }
    (OUT / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(counts, ensure_ascii=False))
    print(f"Independent texture files exported to {OUT}")


if __name__ == "__main__":
    main()
