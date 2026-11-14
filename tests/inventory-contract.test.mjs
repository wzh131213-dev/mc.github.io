import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the backpack component and its entry points are removed', async () => {
  const app = await read('App.tsx')
  const css = await read('index.css')
  await assert.rejects(read('Inventory.tsx'), { code: 'ENOENT' })
  assert.doesNotMatch(app, /import .*Inventory|inventoryOpen|openInventory|closeInventory|bagSlots|setBagSlots|createPortal|KeyE|E 背包/)
  assert.doesNotMatch(css, /inventory-launcher|inventory-overlay|inventory-panel/)
  assert.match(app, /localStorage\.removeItem\('mc-web-inventory:v1'\)/)
})

test('the original nine-slot hotbar remains visible, selectable and persisted', async () => {
  const app = await read('App.tsx')
  const engine = await read('engine.ts')
  const world = await read('world.ts')
  assert.match(app, /const HOTBAR_STORAGE_KEY = 'mc-web-hotbar:v1'/)
  assert.match(app, /function readSavedHotbar\(\)/)
  assert.match(app, /window\.localStorage\.setItem\(HOTBAR_STORAGE_KEY/)
  assert.match(app, /hotbarBlocks\.map\(/)
  assert.match(app, /blockIcon\(b\)/)
  assert.match(engine, /hotbar = \[\.\.\.HOTBAR\]/)
  assert.match(engine, /selectSlot\(i: number\)/)
  assert.match(world, /export const HOTBAR = \[GRASS, DIRT, STONE, COBBLE, PLANKS, LOG, SAND, GLASS, LEAVES\]/)
})

test('only the original ten block types are registered in the game world', async () => {
  const world = await read('world.ts')
  assert.doesNotMatch(world, /MINECRAFT_REGISTRY|BLOCK_META_BY_ID|EXTRA_BLOCK_ID_BASE|BLOCK_ID_BY_NAME/)
  assert.match(world, /export const BLOCKS = \[GRASS, DIRT, STONE, SAND, WATER, LOG, LEAVES, PLANKS, COBBLE, GLASS\] as const/)
  assert.match(world, /const BLOCK_TILES: Record<number, \[number, number, number\]>/)
})

test('the original terrain, trees, water and block generation are restored', async () => {
  const world = await read('world.ts')
  assert.match(world, /private generateChunk\(cx: number, cz: number\)/)
  assert.match(world, /this\.heightAt\(/)
  assert.match(world, /this\.treeAt\(/)
  assert.match(world, /const TREE_MARGIN = 2/)
  assert.match(world, /findSpawn\(\)/)
  assert.doesNotMatch(world, /return new Chunk\(cx, cz\)\s*\}/)
})

test('normal mining and block placement are enabled again', async () => {
  const engine = await read('engine.ts')
  assert.match(engine, /private act\(kind: 'break' \| 'place'\): boolean/)
  assert.match(engine, /this\.raycast\(6, kind === 'break'\)/)
  assert.match(engine, /this\.world\.set\(/)
  assert.doesNotMatch(engine, /private act\(_kind/)
  assert.doesNotMatch(engine, /this\.fly = true/)
})

test('world saving and the original hotbar storage remain independent', async () => {
  const world = await read('world.ts')
  const engine = await read('engine.ts')
  const app = await read('App.tsx')
  assert.match(world, /WORLD_SAVE_PREFIX = 'mc-web-world:v1:'/)
  assert.match(world, /save\(\): boolean/)
  assert.match(engine, /saveWorld\(\)/)
  assert.match(app, /eng\?\.saveWorld\(\)/)
  assert.match(app, /localStorage\.removeItem\('mc-web-inventory:v1'\)/)
})

test('the title screen and mobile display settings remain intact', async () => {
  const logo = await read('Logo.tsx')
  const app = await read('App.tsx')
  assert.ok(logo.includes("const WORD = 'me world'"))
  assert.ok(app.includes('Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.'))
  assert.doesNotMatch(app, /requestFullscreen|enterFullscreen|orientation\.lock/)
})
