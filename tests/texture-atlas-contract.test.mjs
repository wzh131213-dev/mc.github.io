import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('vanilla model resolver chooses a canonical default state instead of the alphabetically first variant', async () => {
  const builder = await read('scripts/build_texture_atlas.py')
  assert.match(builder, /def choose_default_variant\(variants\)/)
  assert.match(builder, /"axis": "y"/)
  assert.match(builder, /"facing": "north"/)
  assert.match(builder, /"half": "lower"/)
  assert.match(builder, /if "" in variants/)
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

test('special vanilla blocks resolve their real texture filenames instead of random color fallbacks', async () => {
  const builder = await read('scripts/build_texture_atlas.py')
  for (const name of ['lava_still', 'fire_0', 'piston_top', 'piston_side', 'glass_pane_top', 'wheat_stage0', 'carrots_stage0', 'potatoes_stage0', 'nether_portal']) {
    assert.ok(builder.includes(name), `missing special texture alias: ${name}`)
  }
  assert.match(builder, /SPECIAL_TEXTURE_ALIASES/)
  assert.match(builder, /name\.startswith\("waxed_"\)/)
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


test('atlas dimensions scale to fit all three face tiles for every registered block', async () => {
  const builder = await read('scripts/build_texture_atlas.py')
  const world = await read('world.ts')
  assert.match(builder, /GRID = math\.ceil\(math\.sqrt\(12 \+ len\(REGISTRY\["blocks"\]\) \* 3\)\)/)
  assert.match(world, /const TILE_COUNT = Math\.ceil\(Math\.sqrt\(12 \+ MINECRAFT_REGISTRY\.blocks\.length \* 3\)\)/)
  assert.doesNotMatch(builder, /GRID = 64/)
  assert.doesNotMatch(world, /const TILE_COUNT = 64/)
})
