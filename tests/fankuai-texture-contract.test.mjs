import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('fankuai exports independent per-block six-face PNG files and standalone item PNGs', async () => {
  const builder = await read('scripts/build_fankuai_textures.py')
  assert.match(builder, /OUT = ROOT \/ "public" \/ "fankuai"/)
  assert.match(builder, /FACE_NAMES = \("top", "bottom", "north", "south", "east", "west"\)/)
  assert.match(builder, /target = block_root \/ name/)
  assert.match(builder, /image\.save\(target \/ filename, optimize=True\)/)
  assert.match(builder, /shutil\.copytree\(texture_root \/ "item", item_out\)/)
  assert.match(builder, /"blocks": manifest_blocks/)
  assert.match(builder, /"fallback_faces": counts\["fallback_faces"\]/)
})

test('fankuai keeps each cardinal side distinct when vanilla model JSON defines different face textures', async () => {
  const builder = await read('scripts/build_fankuai_textures.py')
  for (const face of ['north', 'south', 'east', 'west']) {
    assert.match(builder, new RegExp(`faces\\.get\\(face\\)`))
    assert.match(builder, new RegExp(`"\\${face}"`))
  }
  assert.match(builder, /for face in FACE_NAMES/)
  assert.match(builder, /directional_refs\(name\)/)
})
