import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the backpack component and all backpack entry points are removed', async () => {
  const app = await read('App.tsx')
  const css = await read('index.css')
  await assert.rejects(read('Inventory.tsx'), { code: 'ENOENT' })
  assert.doesNotMatch(app, /import .*Inventory|inventoryOpen|openInventory|closeInventory|bagSlots|setBagSlots|createPortal|KeyE|E 背包/)
  assert.doesNotMatch(css, /inventory-launcher|inventory-overlay|inventory-panel/)
  assert.match(app, /localStorage\.removeItem\('mc-web-inventory:v1'\)/)
})

test('the nine-slot hotbar remains visible, selectable and persisted', async () => {
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
  assert.match(world, /export const HOTBAR = \[/)
})

test('world chunks are empty and do not generate terrain, trees, water or blocks', async () => {
  const world = await read('world.ts')
  assert.match(world, /private generateChunk\(cx: number, cz: number\) \{\s*\/\/ 当前版本保留世界\/渲染接口，但不再生成地形、树木、水体或任何方块。\s*return new Chunk\(cx, cz\)/)
  assert.match(world, /findSpawn\(\) \{\s*\/\/ 空世界中将玩家放在安全高度；由飞行模式维持移动，不依赖地面方块。\s*return \{ x: 0\.5, y: 80, z: 0\.5 \}/)
})

test('the empty-world player starts flying and mining or placement cannot recreate blocks', async () => {
  const engine = await read('engine.ts')
  assert.match(engine, /this\.fly = true/)
  assert.match(engine, /private act\(_kind: 'break' \| 'place'\): boolean \{\s*\/\/ 空世界版本仅保留快捷栏展示和切换，不允许破坏或放置方块。\s*return false/)
  assert.doesNotMatch(engine, /this\.animals\.spawnNear\(s\.x, s\.z\)/)
  assert.doesNotMatch(engine, /this\.monsters\.spawnNear\(s\.x, s\.z\)/)
})

test('modified-world saving remains available without restoring backpack storage', async () => {
  const world = await read('world.ts')
  const engine = await read('engine.ts')
  const app = await read('App.tsx')
  assert.match(world, /WORLD_SAVE_PREFIX = 'mc-web-world:v1:'/)
  assert.match(world, /save\(\): boolean/)
  assert.match(engine, /saveWorld\(\)/)
  assert.match(app, /eng\?\.saveWorld\(\)/)
})

test('the published 26.3 item and block registries remain available for hotbar icons', async () => {
  const registry = JSON.parse(await read('minecraft-26.3-registry.json'))
  const world = await read('world.ts')
  assert.equal(registry.version, '26.3')
  assert.equal(registry.items.length, 1657)
  assert.equal(registry.blocks.length, 1285)
  assert.match(world, /BLOCK_META_BY_ID/)
  assert.match(world, /BLOCK_ID_BY_NAME/)
  assert.match(world, /getBlockTiles\(b\)/)
})

test('the vanilla texture assets remain in the repository for the retained hotbar icons', async () => {
  const workflow = await read('.github/workflows/deploy.yml')
  const engine = await read('engine.ts')
  assert.ok(workflow.includes('scripts/build_fankuai_textures.py'))
  assert.match(engine, /fankuai\/blocks\//)
})

test('Pages deployment refuses to publish uncompiled branch source', async () => {
  const workflow = await read('.github/workflows/deploy.yml')
  assert.match(workflow, /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/pages" --jq '\.build_type'/)
  assert.match(workflow, /pages_source.*!= "workflow"/)
  assert.match(workflow, /Source to GitHub Actions/)
  assert.ok(workflow.includes('runs-on: ubuntu-26.04'))
  assert.ok(workflow.includes('uses: actions/upload-pages-artifact@v5'))
  assert.ok(workflow.includes('uses: actions/deploy-pages@v5'))
})

test('the production build uses the relative GitHub Pages base path', async () => {
  const vite = await read('vite.config.ts')
  assert.match(vite, /base: '\.\/'/)
})

test('title screen retains ME WORLD branding and the Minecraft disclaimer', async () => {
  const logo = await read('Logo.tsx')
  const app = await read('App.tsx')
  assert.ok(logo.includes("const WORD = 'me world'"))
  assert.ok(app.includes('Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.'))
})

test('starting the game does not force fullscreen or screen orientation', async () => {
  const app = await read('App.tsx')
  assert.doesNotMatch(app, /requestFullscreen|enterFullscreen|orientation\.lock/)
  assert.match(app, /const startGame = \(\) => \{[\s\S]*?go\('loading'\)/)
})

test('the renderer retains antialiasing and high-DPI output', async () => {
  const engine = await read('engine.ts')
  assert.match(engine, /new THREE\.WebGLRenderer\(\{ canvas, antialias: true \}\)/)
  assert.match(engine, /setPixelRatio\(Math\.min\(window\.devicePixelRatio \|\| 1, 2\)\)/)
  assert.doesNotMatch(engine, /touchMode \? 1\.35/)
})
