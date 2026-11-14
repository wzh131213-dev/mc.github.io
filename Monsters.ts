import * as THREE from 'three'
import { GRASS, World } from './world'

type MonsterKind =
  | 'zombie' | 'skeleton' | 'creeper' | 'spider' | 'enderman'
  | 'witch' | 'slime' | 'blaze' | 'ghast' | 'ender_dragon'

type Monster = {
  kind: MonsterKind
  group: THREE.Group
  head: THREE.Group
  limbs: THREE.Group[]
  phase: number
  baseY: number
  direction: number
  turnAt: number
}

const ROSTER: MonsterKind[] = [
  'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
  'witch', 'slime', 'blaze', 'ghast', 'ender_dragon',
]

const COLORS: Record<MonsterKind, { body: number; head: number; detail: number }> = {
  zombie: { body: 0x426f55, head: 0x6d9a72, detail: 0x344d9a },
  skeleton: { body: 0xd8d5c8, head: 0xe8e5d9, detail: 0x625c50 },
  creeper: { body: 0x4b9b45, head: 0x55aa4d, detail: 0x17271b },
  spider: { body: 0x302522, head: 0x4a2924, detail: 0xb51f19 },
  enderman: { body: 0x171321, head: 0x21192c, detail: 0xc28bff },
  witch: { body: 0x55415f, head: 0x927b78, detail: 0x302532 },
  slime: { body: 0x68c84d, head: 0x8be36b, detail: 0x183d20 },
  blaze: { body: 0xd69a32, head: 0xf0c15b, detail: 0xffdf78 },
  ghast: { body: 0xe8e5dc, head: 0xf4f0e7, detail: 0x342b2c },
  ender_dragon: { body: 0x211b2d, head: 0x34263f, detail: 0xb04be0 },
}

function cube(
  parent: THREE.Group,
  size: [number, number, number],
  pos: [number, number, number],
  color: number,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  )
  mesh.position.set(...pos)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function limb(parent: THREE.Group, x: number, z: number, color: number, length = 0.72) {
  const pivot = new THREE.Group()
  pivot.position.set(x, 1.05, z)
  cube(pivot, [0.22, length, 0.22], [0, -length / 2, 0], color)
  parent.add(pivot)
  return pivot
}

function buildMonster(kind: MonsterKind) {
  const color = COLORS[kind]
  const group = new THREE.Group()
  const head = new THREE.Group()
  const limbs: THREE.Group[] = []

  switch (kind) {
    case 'zombie':
    case 'skeleton':
    case 'enderman':
    case 'witch': {
      const tall = kind === 'enderman'
      const scale = tall ? 1.42 : 1
      cube(group, [0.62, 0.78, 0.34], [0, 1.18, 0], color.body)
      head.position.set(0, 1.82, -0.02)
      cube(head, [0.58, 0.58, 0.58], [0, 0, 0], color.head)
      if (kind === 'zombie' || kind === 'skeleton') {
        cube(head, [0.12, 0.07, 0.04], [-0.15, 0.02, -0.3], kind === 'zombie' ? 0x253b25 : 0x332b27)
        cube(head, [0.12, 0.07, 0.04], [0.15, 0.02, -0.3], kind === 'zombie' ? 0x253b25 : 0x332b27)
      } else if (kind === 'enderman') {
        cube(head, [0.08, 0.055, 0.04], [-0.15, 0, -0.3], color.detail)
        cube(head, [0.08, 0.055, 0.04], [0.15, 0, -0.3], color.detail)
      } else {
        cube(head, [0.72, 0.14, 0.72], [0, 0.34, 0], 0x30242f)
        cube(head, [0.1, 0.12, 0.1], [0.3, -0.12, -0.3], 0x8b5548)
        cube(head, [0.1, 0.12, 0.1], [-0.3, -0.12, -0.3], 0x8b5548)
        cube(group, [0.7, 0.72, 0.42], [0, 0.68, 0], 0x49394f)
      }
      group.add(head)
      for (const x of [-0.43, 0.43]) {
        const arm = limb(group, x, 0, kind === 'zombie' ? 0x426f55 : color.body, 0.72)
        if (kind === 'zombie' || kind === 'skeleton') arm.rotation.z = x < 0 ? -0.72 : 0.72
        limbs.push(arm)
      }
      for (const x of [-0.19, 0.19]) limbs.push(limb(group, x, 0, color.detail, 0.72))
      group.scale.setScalar(scale)
      break
    }
    case 'creeper':
      cube(group, [0.66, 1.05, 0.48], [0, 1.12, 0], color.body)
      head.position.set(0, 1.92, -0.02)
      cube(head, [0.72, 0.72, 0.72], [0, 0, 0], color.head)
      cube(head, [0.16, 0.16, 0.05], [-0.18, 0.12, -0.38], color.detail)
      cube(head, [0.16, 0.16, 0.05], [0.18, 0.12, -0.38], color.detail)
      cube(head, [0.12, 0.32, 0.05], [-0.08, -0.18, -0.38], color.detail)
      cube(head, [0.12, 0.32, 0.05], [0.08, -0.18, -0.38], color.detail)
      group.add(head)
      for (const x of [-0.23, 0.23]) for (const z of [-0.18, 0.18]) {
        const leg = new THREE.Group()
        leg.position.set(x, 0.62, z)
        cube(leg, [0.24, 0.62, 0.24], [0, -0.31, 0], color.body)
        group.add(leg)
        limbs.push(leg)
      }
      break
    case 'spider':
      cube(group, [0.82, 0.42, 1.08], [0, 0.72, 0.12], color.body)
      head.position.set(0, 0.78, -0.68)
      cube(head, [0.58, 0.48, 0.5], [0, 0, 0], color.head)
      for (const x of [-0.2, 0.2]) cube(head, [0.12, 0.12, 0.06], [x, 0.04, -0.28], color.detail)
      group.add(head)
      for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
        const leg = new THREE.Group()
        leg.position.set(side * 0.3, 0.76, -0.48 + i * 0.32)
        const upper = cube(leg, [0.12, 0.12, 0.62], [side * 0.28, 0, 0], color.body)
        upper.rotation.y = side * (0.28 + i * 0.12)
        const lower = cube(leg, [0.1, 0.1, 0.55], [side * 0.56, -0.16, 0.12], color.body)
        lower.rotation.y = -side * 0.25
        group.add(leg)
        limbs.push(leg)
      }
      break
    case 'slime':
      cube(group, [0.9, 0.82, 0.9], [0, 0.58, 0], color.body)
      cube(group, [0.12, 0.12, 0.05], [-0.2, 0.68, -0.47], color.detail)
      cube(group, [0.12, 0.12, 0.05], [0.2, 0.68, -0.47], color.detail)
      cube(group, [0.22, 0.08, 0.05], [0, 0.4, -0.47], color.detail)
      cube(group, [0.96, 0.08, 0.96], [0, 1.02, 0], color.head)
      break
    case 'blaze':
      cube(group, [0.48, 0.62, 0.48], [0, 1.18, 0], color.body)
      for (const y of [0.72, 1.12, 1.52]) {
        for (let i = 0; i < 4; i++) {
          const angle = i * Math.PI / 2
          const rod = new THREE.Group()
          rod.position.set(Math.cos(angle) * 0.68, y, Math.sin(angle) * 0.68)
          cube(rod, [0.16, 0.5, 0.16], [0, 0, 0], color.detail)
          group.add(rod)
          limbs.push(rod)
        }
      }
      cube(group, [0.18, 0.18, 0.18], [0, 1.18, -0.29], color.head)
      break
    case 'ghast':
      cube(group, [1.5, 1.5, 1.5], [0, 1.2, 0], color.head)
      for (const x of [-0.34, 0.34]) {
        cube(group, [0.18, 0.18, 0.06], [x, 1.36, -0.78], 0x3a2929)
        cube(group, [0.12, 0.32, 0.06], [x, 1.05, -0.78], 0x8b2929)
      }
      for (let i = 0; i < 9; i++) {
        const tentacle = new THREE.Group()
        tentacle.position.set(((i % 3) - 1) * 0.42, 0.45, (Math.floor(i / 3) - 1) * 0.42)
        cube(tentacle, [0.12, 0.55 + (i % 2) * 0.2, 0.12], [0, -0.3, 0], color.body)
        group.add(tentacle)
        limbs.push(tentacle)
      }
      break
    case 'ender_dragon':
      cube(group, [0.9, 0.82, 2.2], [0, 1.45, 0.15], color.body)
      head.position.set(0, 1.72, -1.22)
      cube(head, [0.72, 0.58, 0.82], [0, 0, 0], color.head)
      cube(head, [0.16, 0.16, 0.1], [-0.2, 0.1, -0.44], color.detail)
      cube(head, [0.16, 0.16, 0.1], [0.2, 0.1, -0.44], color.detail)
      cube(head, [0.14, 0.42, 0.14], [-0.25, 0.48, 0.05], color.body)
      cube(head, [0.14, 0.42, 0.14], [0.25, 0.48, 0.05], color.body)
      group.add(head)
      for (const side of [-1, 1]) {
        const wing = new THREE.Group()
        wing.position.set(side * 0.42, 1.7, 0.1)
        const membrane = cube(wing, [0.12, 1.5, 1.8], [side * 0.72, 0, 0.25], color.detail)
        membrane.rotation.z = side * 0.45
        cube(wing, [0.16, 1.7, 0.16], [side * 0.72, 0, 0.25], color.body)
        group.add(wing)
        limbs.push(wing)
      }
      cube(group, [0.22, 0.22, 1.7], [0, 1.3, 1.75], color.body)
      for (const x of [-0.3, 0.3]) limbs.push(limb(group, x, 0.65, color.body, 0.65))
      group.scale.setScalar(1.45)
      break
  }

  return { group, head, limbs }
}

/** Independent block-built hostile mob models. This stage adds visuals and ambient motion, not combat AI. */
export class MonsterManager {
  private monsters: Monster[] = []

  constructor(private scene: THREE.Scene, private world: World) {}

  spawnNear(x: number, z: number) {
    if (this.monsters.length) return
    let placed = 0
    for (let ring = 20; ring <= 34 && placed < 6; ring += 2) {
      for (let i = 0; i < 32 && placed < 6; i++) {
        const angle = (i / 32) * Math.PI * 2 + ring * 0.17
        const px = Math.floor(x + Math.cos(angle) * ring)
        const pz = Math.floor(z + Math.sin(angle) * ring)
        const ground = this.world.heightAt(px, pz)
        if (this.world.get(px, ground, pz) !== GRASS) continue
        if (this.world.get(px, ground + 1, pz) !== 0 || this.world.get(px, ground + 2, pz) !== 0) continue
        const kind = ROSTER[(placed * 3 + Math.abs(px * 13 + pz * 7)) % ROSTER.length]
        const model = buildMonster(kind)
        const baseY = ground + 1
        model.group.position.set(px + 0.5, baseY, pz + 0.5)
        const direction = angle + Math.PI
        model.group.rotation.y = direction
        this.scene.add(model.group)
        this.monsters.push({
          ...model,
          kind,
          phase: placed * 1.37,
          baseY,
          direction,
          turnAt: 2.5 + placed,
        })
        placed++
      }
    }
  }

  update(dt: number, elapsed: number) {
    for (const monster of this.monsters) {
      const bob = Math.sin(elapsed * 2 + monster.phase)
      monster.turnAt -= dt
      if (monster.turnAt <= 0) {
        monster.direction += Math.sin(elapsed * 0.7 + monster.phase) * 0.45
        monster.group.rotation.y = monster.direction
        monster.turnAt = 4 + (monster.phase % 3)
      }
      if (monster.kind === 'slime') {
        monster.group.scale.y = 1 + Math.max(0, bob) * 0.16
      } else if (monster.kind === 'blaze' || monster.kind === 'ghast' || monster.kind === 'ender_dragon') {
        monster.group.position.y = monster.baseY + bob * 0.18
      }
      monster.head.rotation.x = monster.kind === 'ender_dragon' ? Math.sin(elapsed * 1.4) * 0.08 : 0
      monster.limbs.forEach((part, index) => {
        const amplitude = monster.kind === 'ender_dragon' ? 0.35 : monster.kind === 'spider' ? 0.18 : 0.1
        part.rotation.x = Math.sin(elapsed * 3 + monster.phase + index) * amplitude
      })
    }
  }

  dispose() {
    for (const monster of this.monsters) {
      this.scene.remove(monster.group)
      monster.group.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose()
          const materials = Array.isArray(node.material) ? node.material : [node.material]
          materials.forEach((material) => material.dispose())
        }
      })
    }
    this.monsters = []
  }
}
