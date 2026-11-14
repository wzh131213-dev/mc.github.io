import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('vanilla model resolver chooses a canonical default state instead of the alphabetically first variant', async () => {
  const builder = await read('scripts/build_texture_atlas.py')
  assert.match(builder, /def choose_default_variant\(variants\)/)
  assert.match(builder, /axis=y/)
  assert.match(builder, /facing=north/)
  assert.match(builder, /half=lower/)
  assert.match(builder, /variants\.get\(""\)/)
})

test('atlas model resolver maps actual element face textures and inherits parent model elements', async () => {
  const builder = await read('scripts/build_texture_atlas.py')
  assert.match(builder, /def model_face_textures\(/)
  assert.match(builder, /model\.get\("elements"\)/)
  assert.match(builder, /face_data\.get\("texture"\)/)
  assert.match(builder, /parent_faces/)
  assert.match(builder, /"up"/)
  assert.match(builder, /"down"/)
  assert.match(builder, /"north"/)
})

test('atlas build reports unresolved vanilla blocks rather than silently hiding random fallback usage', async () => {
  const builder = await read('scripts/build_texture_atlas.py')
  assert.match(builder, /unmapped_blocks/)
  assert.match(builder, /Unmapped block textures/)
  assert.match(builder, /fallback_count/)
})

test('legacy core block textures are resolved from their exact vanilla model faces', async () => {
  const builder = await read('scripts/build_texture_atlas.py')
  assert.match(builder, /"grass_block_top":/)
  assert.match(builder, /"grass_block_side":/)
  assert.match(builder, /"oak_log_top"/)
  assert.match(builder, /"stone"/)
  assert.match(builder, /"dirt"/)
})
