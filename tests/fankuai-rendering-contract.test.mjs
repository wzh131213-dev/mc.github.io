import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('world creates separate solid-block geometries with six material groups', async () => {
  const world = await read('world.ts')
  assert.match(world, /const opaqueByBlock = new Map<number, MeshData\[\]>/)
  assert.match(world, /Array\.from\(\{ length: 6 \}, \(\) => new MeshData\(\)\)/)
  assert.match(world, /combineFaceGeometry\(faces\)/)
  assert.match(world, /return \{ opaque, water: water\.toGeometry\(\) \}/)
  assert.match(world, /isWater \? \(i === 1 \|\| i === 2 \? u1 : u0\)/)
})

test('engine loads each block face from its own fankuai PNG and shares materials between chunks', async () => {
  const engine = await read('engine.ts')
  assert.match(engine, /BLOCK_FACE_ORDER = \['east', 'west', 'top', 'bottom', 'south', 'north'\]/)
  assert.match(engine, /fankuai\/blocks\/\$\{encodeURIComponent\(name\)\}\/\$\{face\}\.png/)
  assert.match(engine, /blockMaterialCache\.get\(blockId\)/)
  assert.match(engine, /new THREE\.Mesh\(geometry, getBlockFaceMaterials\(blockId\)\)/)
  assert.match(engine, /opaque\?\.forEach\(\(mesh\) => mesh\.geometry\.dispose\(\)\)/)
})

test('water retains its existing atlas material and solid-block material loading has a fallback', async () => {
  const engine = await read('engine.ts')
  const world = await read('world.ts')
  assert.match(engine, /this\.waterMat = new THREE\.MeshStandardMaterial\(\{\s*map: tex,/)
  assert.match(engine, /material\.map = null/)
  assert.match(engine, /material\.color\.set\(0x999999\)/)
  assert.match(world, /isWater \? \(i === 1 \|\| i === 2 \? u1 : u0\)/)
})
