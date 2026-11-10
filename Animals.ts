import * as THREE from 'three'
import { GRASS, WATER, World } from './world'

type AnimalKind =
  | 'cow' | 'pig' | 'sheep' | 'chicken'
  | 'wolf' | 'cat' | 'rabbit' | 'fox' | 'panda' | 'horse' | 'donkey' | 'mule' | 'llama' | 'camel'
  | 'fish' | 'squid' | 'dolphin' | 'turtle' | 'frog' | 'tadpole'
  | 'bee' | 'bat' | 'parrot' | 'polar_bear' | 'goat' | 'sniffer'
type Animal = {
  kind: AnimalKind; group: THREE.Group; legs: THREE.Group[]; head: THREE.Group
  phase: number; speed: number; direction: number; turnAt: number; baseY: number
}

const palette: Record<AnimalKind, { body: number; head: number; detail: number }> = {
  cow: { body: 0xf1eee5, head: 0xeee7d9, detail: 0x49352d },
  pig: { body: 0xe99b9c, head: 0xf0aaaa, detail: 0xb86e75 },
  sheep: { body: 0xe9e7df, head: 0xd0b9a9, detail: 0x76645c },
  chicken: { body: 0xf4eee0, head: 0xf4eee0, detail: 0xd64c36 },
  wolf: { body: 0x92999c, head: 0xb6b9b5, detail: 0x4c555b },
  cat: { body: 0xd99c57, head: 0xe7b36e, detail: 0x49372c },
  rabbit: { body: 0xe2d9cc, head: 0xf0e9df, detail: 0x9b6c69 },
  fox: { body: 0xc96b32, head: 0xe58a43, detail: 0xf0e8dc },
  panda: { body: 0xf0eee8, head: 0xf0eee8, detail: 0x252525 },
  horse: { body: 0x80502f, head: 0x9a6742, detail: 0x30251f },
  donkey: { body: 0x77716b, head: 0x928980, detail: 0x403a36 },
  mule: { body: 0x8b6550, head: 0xa47b62, detail: 0x40302a },
  llama: { body: 0xc7ad83, head: 0xd8c49e, detail: 0x755f48 },
  camel: { body: 0xb58a55, head: 0xc59a63, detail: 0x634a30 },
  fish: { body: 0xe58b35, head: 0xf2b04f, detail: 0x784b29 },
  squid: { body: 0x7553a5, head: 0x9876c4, detail: 0x4b3473 },
  dolphin: { body: 0x718e9d, head: 0x8caab5, detail: 0x405866 },
  turtle: { body: 0x648b4d, head: 0x8caa63, detail: 0x594c32 },
  frog: { body: 0x6baf4d, head: 0x84c85e, detail: 0x3b7136 },
  tadpole: { body: 0x292a35, head: 0x393b48, detail: 0x171820 },
  bee: { body: 0xe8b83d, head: 0x302a21, detail: 0x25211d },
  bat: { body: 0x51445c, head: 0x6b5b75, detail: 0x332a3b },
  parrot: { body: 0x2d9c65, head: 0x3cbf7d, detail: 0xe7b23f },
  polar_bear: { body: 0xe8e7df, head: 0xf2f0e8, detail: 0x383633 },
  goat: { body: 0xe4ded0, head: 0xd2c7b3, detail: 0x51473c },
  sniffer: { body: 0x9a5546, head: 0xb66b58, detail: 0x6e3933 },
}

const AQUATIC = new Set<AnimalKind>(['fish', 'squid', 'dolphin', 'turtle', 'tadpole'])
const FLYING = new Set<AnimalKind>(['bee', 'bat', 'parrot'])
const KINDS = Object.keys(palette) as AnimalKind[]

function cube(parent: THREE.Group, size: [number, number, number], pos: [number, number, number], color: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.92 }))
  mesh.position.set(...pos)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

/** Independent procedural voxel-style animal models; no external model assets are required. */
function buildAnimal(kind: AnimalKind) {
  const colors = palette[kind]
  const group = new THREE.Group()
  const aquatic = AQUATIC.has(kind)
  const small = ['chicken', 'rabbit', 'bee', 'bat', 'parrot', 'frog', 'tadpole', 'fish'].includes(kind)
  const scale = small ? 0.62 : ['horse', 'camel', 'polar_bear', 'sniffer'].includes(kind) ? 1.18 : 1
  const bodySize: [number, number, number] = aquatic
    ? kind === 'tadpole' ? [0.22, 0.22, 0.42] : kind === 'squid' ? [0.55, 0.75, 0.55] : [0.62, 0.48, 1.05]
    : kind === 'bee' || kind === 'bat' ? [0.56, 0.48, 0.62]
    : kind === 'sniffer' ? [1.05, 1.05, 1.3]
    : kind === 'sheep' ? [0.92, 0.82, 1.18] : [0.86, 0.76, 1.18]
  cube(group, bodySize, [0, aquatic ? 0.9 : 0.88, 0], colors.body)
  const head = new THREE.Group()
  head.position.set(0, aquatic ? 0.96 : kind === 'chicken' ? 1.15 : 1.18, -0.58)
  group.add(head)
  cube(head, kind === 'tadpole' ? [0.22, 0.22, 0.25] : [0.52, 0.52, 0.5], [0, 0, -0.12], colors.head)

  if (kind === 'cow') {
    cube(head, [0.62, 0.2, 0.48], [0, -0.16, -0.26], 0x4a332b)
    for (const x of [-0.23, 0.23]) cube(head, [0.12, 0.18, 0.12], [x, 0.3, -0.1], 0xe7e0d3)
    cube(group, [0.2, 0.25, 0.2], [0, 0.72, 0.58], 0x49352d)
  }
  if (kind === 'pig') cube(head, [0.28, 0.18, 0.12], [0, -0.12, -0.38], 0xc56f78)
  if (kind === 'sheep') for (const x of [-0.32, 0.32]) cube(group, [0.34, 0.34, 0.34], [x, 1.08, -0.05], 0xf7f5ee)
  if (kind === 'wolf' || kind === 'fox' || kind === 'cat') {
    cube(head, [0.16, 0.2, 0.16], [-0.18, 0.34, -0.08], colors.detail)
    cube(head, [0.16, 0.2, 0.16], [0.18, 0.34, -0.08], colors.detail)
    if (kind === 'fox' || kind === 'wolf') cube(head, [0.24, 0.2, 0.36], [0, -0.12, -0.36], colors.detail)
  }
  if (kind === 'rabbit') {
    cube(head, [0.13, 0.5, 0.12], [-0.16, 0.42, -0.05], colors.head)
    cube(head, [0.13, 0.5, 0.12], [0.16, 0.42, -0.05], colors.head)
  }
  if (kind === 'panda') {
    for (const x of [-0.22, 0.22]) cube(head, [0.18, 0.18, 0.08], [x, 0.1, -0.35], colors.detail)
  }
  if (kind === 'horse' || kind === 'donkey' || kind === 'mule' || kind === 'llama' || kind === 'camel' || kind === 'goat') {
    cube(head, [0.16, 0.18, 0.16], [-0.2, 0.3, -0.08], colors.detail)
    cube(head, [0.16, 0.18, 0.16], [0.2, 0.3, -0.08], colors.detail)
    if (kind === 'camel') cube(group, [0.38, 0.42, 0.38], [0, 1.43, 0.1], colors.detail)
    if (kind === 'llama') cube(group, [0.42, 0.45, 0.5], [0, 1.22, 0.05], colors.detail)
    if (kind === 'goat') {
      cube(head, [0.1, 0.28, 0.1], [-0.18, 0.52, -0.02], 0xe4d9bf)
      cube(head, [0.1, 0.28, 0.1], [0.18, 0.52, -0.02], 0xe4d9bf)
    }
  }
  if (kind === 'chicken') {
    cube(head, [0.16, 0.16, 0.12], [0, -0.12, -0.32], 0xe6a52f)
    cube(head, [0.14, 0.18, 0.1], [0, 0.27, -0.1], 0xc83e32)
    cube(group, [0.12, 0.34, 0.18], [0.34, 0.9, 0.05], 0xfaf6ed)
    cube(group, [0.12, 0.34, 0.18], [-0.34, 0.9, 0.05], 0xfaf6ed)
  }
  if (kind === 'bee' || kind === 'bat' || kind === 'parrot') {
    cube(group, [0.12, 0.08, 0.62], [0.38, 1.08, 0], kind === 'bee' ? 0xece7d8 : colors.detail)
    cube(group, [0.12, 0.08, 0.62], [-0.38, 1.08, 0], kind === 'bee' ? 0xece7d8 : colors.detail)
  }
  if (kind === 'turtle') cube(group, [0.9, 0.35, 0.95], [0, 1.12, 0], 0x536d37)
  if (kind === 'squid') for (let i = 0; i < 8; i++) cube(group, [0.09, 0.55, 0.09], [Math.cos(i * Math.PI / 4) * 0.3, 0.35, Math.sin(i * Math.PI / 4) * 0.3], colors.detail)
  if (kind === 'fish' || kind === 'dolphin') cube(group, [0.12, 0.35, 0.4], [0, 0.92, 0.62], colors.detail)
  if (kind === 'sniffer') {
    cube(head, [0.65, 0.28, 0.32], [0, -0.18, -0.32], 0x704238)
    cube(group, [0.34, 0.24, 0.4], [0, 0.48, 0.55], 0x6e3933)
  }
  if (!['sheep', 'tadpole'].includes(kind)) {
    for (const x of [-0.13, 0.13]) cube(head, [0.07, 0.07, 0.04], [x, 0.08, -0.38], 0x211c1a)
  }

  const legs: THREE.Group[] = []
  if (!aquatic && !['bee', 'bat', 'parrot'].includes(kind)) {
    for (const x of [-0.27, 0.27]) for (const z of [-0.38, 0.38]) {
      const leg = new THREE.Group()
      leg.position.set(x, 0.55, z)
      cube(leg, small ? [0.12, 0.34, 0.12] : [0.2, 0.55, 0.2], [0, small ? -0.16 : -0.24, 0], colors.detail)
      group.add(leg)
      legs.push(leg)
    }
  }
  group.scale.setScalar(scale)
  return { group, head, legs }
}

export class AnimalManager {
  private animals: Animal[] = []
  private kinds = KINDS

  constructor(private scene: THREE.Scene, private world: World) {}

  spawnNear(x: number, z: number) {
    if (this.animals.length) return
    let landPlaced = 0
    let waterPlaced = 0
    for (let ring = 4; ring <= 18 && (landPlaced < 8 || waterPlaced < 5); ring += 2) {
      for (let i = 0; i < 24 && (landPlaced < 8 || waterPlaced < 5); i++) {
        const angle = (i / 24) * Math.PI * 2 + ring * 0.31
        const px = Math.floor(x + Math.cos(angle) * ring)
        const pz = Math.floor(z + Math.sin(angle) * ring)
        const ground = this.world.heightAt(px, pz)
        const isWater = this.world.get(px, ground, pz) === WATER || this.world.get(px, ground - 1, pz) === WATER
        let kind: AnimalKind
        if (isWater) {
          if (waterPlaced >= 5) continue
          kind = (['fish', 'squid', 'dolphin', 'turtle', 'tadpole'] as AnimalKind[])[waterPlaced]
          const model = buildAnimal(kind)
          const baseY = ground + (kind === 'tadpole' ? 0.2 : 0.55)
          model.group.position.set(px + 0.5, baseY, pz + 0.5)
          this.scene.add(model.group)
          this.animals.push({ ...model, kind, phase: waterPlaced * 1.7, speed: 0.35, direction: angle, turnAt: 2 + waterPlaced, baseY })
          waterPlaced++
          continue
        }
        if (landPlaced >= 8 || this.world.get(px, ground, pz) !== GRASS) continue
        if (this.world.get(px, ground + 1, pz) !== 0 || this.world.get(px, ground + 2, pz) !== 0) continue
        kind = this.kinds.filter((candidate) => !AQUATIC.has(candidate))[landPlaced % (this.kinds.length - AQUATIC.size)]
        const model = buildAnimal(kind)
        const baseY = ground + 1
        model.group.position.set(px + 0.5, baseY, pz + 0.5)
        const direction = angle + Math.PI
        model.group.rotation.y = direction
        this.scene.add(model.group)
        this.animals.push({ ...model, kind, phase: landPlaced * 1.7, speed: 0.45 + (landPlaced % 3) * 0.12, direction, turnAt: 3 + landPlaced, baseY })
        landPlaced++
      }
    }
  }

  update(dt: number, elapsed: number) {
    for (const animal of this.animals) {
      const walking = Math.sin(elapsed * animal.speed + animal.phase)
      animal.head.rotation.x = Math.sin(elapsed * 1.4 + animal.phase) * 0.07
      animal.legs.forEach((leg, index) => { leg.rotation.x = walking * (index % 2 ? -0.34 : 0.34) })
      animal.group.position.y = animal.baseY + (FLYING.has(animal.kind) ? Math.sin(elapsed * 2 + animal.phase) * 0.16 : Math.sin(elapsed * 2 + animal.phase) * 0.0008)
      animal.turnAt -= dt
      if (animal.turnAt <= 0) {
        animal.direction += Math.sin(elapsed + animal.phase) * 0.55
        animal.group.rotation.y = animal.direction
        animal.turnAt = 3 + (animal.phase % 4)
      }
    }
  }

  dispose() {
    for (const animal of this.animals) {
      this.scene.remove(animal.group)
      animal.group.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose()
          const materials = Array.isArray(node.material) ? node.material : [node.material]
          materials.forEach((material) => material.dispose())
        }
      })
    }
    this.animals = []
  }
}
