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
})

test('fankuai resolves each cardinal model face independently instead of collapsing all sides', async () => {
  const builder = await read('scripts/build_fankuai_textures.py')
  assert.match(builder, /for face in FACE_NAMES:/)
  assert.match(builder, /data = faces\.get\(face\)/)
  assert.match(builder, /result\[face\] = path/)
  assert.match(builder, /directional_refs\(name\)/)
  assert.match(builder, /"north"/)
  assert.match(builder, /"south"/)
  assert.match(builder, /"east"/)
  assert.match(builder, /"west"/)
})


test('runtime renders chunk-batched solid blocks with six independent directional materials', async () => {
  const engine = await read('engine.ts')
  const world = await read('world.ts')
  assert.match(engine, /BLOCK_FACE_ORDER = \['east', 'west', 'top', 'bottom', 'south', 'north'\]/)
  assert.match(engine, /fankuai\/blocks\/\$\{encodeURIComponent\(name\)\}\/\$\{face\}\.png/)
  assert.match(engine, /new THREE\.Mesh\(geometry, getBlockFaceMaterials\(blockId\)\)/)
  assert.match(world, /opaqueByBlock = new Map<number, MeshData\[\]\(\)/)
  assert.match(world, /Array\.from\(\{ length: 6 \}, \(\) => new MeshData\(\)\)/)
  assert.match(world, /const md = isWater \? water : blockFaces!\[faceIndex\]/)
})

test('inventory icons load standalone PNGs from the fankuai items directory', async () => {
  const inventory = await read('Inventory.tsx')
  assert.match(inventory, /new URL\('fankuai\/items\/', document\.baseURI\)/)
  assert.match(inventory, /itemTextureName\(name\)/)
})
