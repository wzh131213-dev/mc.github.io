import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('hostile mob models include ten distinct vanilla-inspired voxel silhouettes', async () => {
  const monsters = await read('Monsters.ts')
  for (const kind of ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'slime', 'blaze', 'ghast', 'ender_dragon']) {
    assert.ok(monsters.includes(`'${kind}'`), `missing monster kind: ${kind}`)
  }
  assert.match(monsters, /buildMonster\(kind: MonsterKind\)/)
  assert.match(monsters, /case 'creeper'/)
  assert.match(monsters, /case 'spider'/)
  assert.match(monsters, /case 'blaze'/)
  assert.match(monsters, /case 'ghast'/)
  assert.match(monsters, /case 'ender_dragon'/)
})

test('monster manager spawns on valid land, animates models and disposes GPU resources', async () => {
  const monsters = await read('Monsters.ts')
  assert.match(monsters, /export class MonsterManager/)
  assert.match(monsters, /spawnNear\(x: number, z: number\)/)
  assert.match(monsters, /this\.world\.get\(px, ground, pz\) !== GRASS/)
  assert.match(monsters, /update\(dt: number, elapsed: number\)/)
  assert.match(monsters, /geometry\.dispose\(\)/)
  assert.match(monsters, /material\.dispose\(\)/)
})

test('game engine integrates monster spawn, frame updates and cleanup without removing animals', async () => {
  const engine = await read('engine.ts')
  assert.match(engine, /import \{ MonsterManager \} from '\.\/Monsters'/)
  assert.match(engine, /private monsters: MonsterManager/)
  assert.match(engine, /new MonsterManager\(this\.scene, this\.world\)/)
  assert.doesNotMatch(engine, /this\.monsters\.spawnNear\(s\.x, s\.z\)/)
  assert.match(engine, /this\.monsters\.update\(dt, this\.time\)/)
  assert.match(engine, /this\.monsters\.dispose\(\)/)
  assert.doesNotMatch(engine, /this\.animals\.spawnNear\(s\.x, s\.z\)/)
  assert.match(engine, /this\.animals\.update\(dt, this\.time\)/)
  assert.match(engine, /this\.animals\.dispose\(\)/)
})
