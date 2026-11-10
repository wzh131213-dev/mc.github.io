import * as THREE from 'three'
import { GRASS, World } from './world'

type AnimalKind = 'cow' | 'pig' | 'sheep' | 'chicken'
type Animal = { group: THREE.Group; legs: THREE.Group[]; head: THREE.Group; phase: number; speed: number; direction: number; turnAt: number }

const palette: Record<AnimalKind, { body: number; head: number; detail: number }> = {
  cow: { body: 0xf1eee5, head: 0xeee7d9, detail: 0x49352d },
  pig: { body: 0xe99b9c, head: 0xf0aaaa, detail: 0xb86e75 },
  sheep: { body: 0xe9e7df, head: 0xd0b9a9, detail: 0x76645c },
  chicken: { body: 0xf4eee0, head: 0xf4eee0, detail: 0xd64c36 },
}

function cube(parent: THREE.Group, size: [number, number, number], pos: [number, number, number], color: number) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.92 }),
  )
  mesh.position.set(...pos)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

/** Procedural low-poly/blocky farm-animal models; no external model downloads required. */
function buildAnimal(kind: AnimalKind) {
  const colors = palette[kind]
  const group = new THREE.Group()
  const scale = kind === 'chicken' ? 0.58 : 1
  const bodySize: [number, number, number] = kind === 'chicken' ? [0.55, 0.62, 0.72] : kind === 'sheep' ? [0.92, 0.82, 1.18] : [0.86, 0.76, 1.18]
  cube(group, bodySize, [0, 0.88, 0], colors.body)
  const head = new THREE.Group()
  head.position.set(0, kind === 'chicken' ? 1.15 : 1.18, -0.58)
  group.add(head)
  cube(head, kind === 'chicken' ? [0.42, 0.42, 0.42] : [0.52, 0.52, 0.5], [0, 0, -0.12], colors.head)
  if (kind === 'cow') {
    cube(group, [0.94, 0.68, 1.2], [0, 0.9, 0], 0xeee9df)
    cube(head, [0.62, 0.2, 0.48], [0, -0.16, -0.26], 0x4a332b)
    for (const x of [-0.23, 0.23]) cube(head, [0.12, 0.18, 0.12], [x, 0.3, -0.1], 0xe7e0d3)
  }
  if (kind === 'pig') cube(head, [0.28, 0.18, 0.12], [0, -0.12, -0.38], 0xc56f78)
  if (kind === 'sheep') {
    for (const x of [-0.32, 0.32]) cube(group, [0.34, 0.34, 0.34], [x, 1.08, -0.05], 0xf7f5ee)
    cube(head, [0.12, 0.12, 0.08], [-0.15, 0.1, -0.36], 0x292323)
    cube(head, [0.12, 0.12, 0.08], [0.15, 0.1, -0.36], 0x292323)
  }
  if (kind === 'chicken') {
    cube(head, [0.16, 0.16, 0.12], [0, -0.12, -0.32], 0xe6a52f)
    cube(head, [0.14, 0.18, 0.1], [0, 0.27, -0.1], 0xc83e32)
    cube(group, [0.12, 0.34, 0.18], [0.34, 0.9, 0.05], 0xfaf6ed)
    cube(group, [0.12, 0.34, 0.18], [-0.34, 0.9, 0.05], 0xfaf6ed)
  }
  if (kind !== 'sheep') {
    for (const x of [-0.13, 0.13]) cube(head, [0.07, 0.07, 0.04], [x, 0.08, -0.38], 0x211c1a)
  }
  const legs: THREE.Group[] = []
  for (const x of [-0.27, 0.27]) for (const z of [-0.38, 0.38]) {
    const leg = new THREE.Group()
    leg.position.set(x, 0.55, z)
    cube(leg, kind === 'chicken' ? [0.1, 0.4, 0.1] : [0.2, 0.55, 0.2], [0, -0.24, 0], kind === 'chicken' ? 0xd49a38 : colors.detail)
    group.add(leg)
    legs.push(leg)
  }
  group.scale.setScalar(scale)
  return { group, head, legs }
}

export class AnimalManager {
  private animals: Animal[] = []
  private kinds: AnimalKind[] = ['cow', 'pig', 'sheep', 'chicken']

  constructor(private scene: THREE.Scene, private world: World) {}

  spawnNear(x: number, z: number) {
    if (this.animals.length) return
    let placed = 0
    for (let ring = 4; ring <= 13 && placed < 8; ring += 3) {
      for (let i = 0; i < 16 && placed < 8; i++) {
        const angle = (i / 16) * Math.PI * 2 + ring * 0.31
        const px = Math.floor(x + Math.cos(angle) * ring)
        const pz = Math.floor(z + Math.sin(angle) * ring)
        const ground = this.world.heightAt(px, pz)
        if (this.world.get(px, ground, pz) !== GRASS) continue
        if (this.world.get(px, ground + 1, pz) !== 0 || this.world.get(px, ground + 2, pz) !== 0) continue
        const kind = this.kinds[placed % this.kinds.length]
        const model = buildAnimal(kind)
        model.group.position.set(px + 0.5, ground + 1, pz + 0.5)
        const direction = angle + Math.PI
        model.group.rotation.y = direction
        this.scene.add(model.group)
        this.animals.push({ ...model, phase: placed * 1.7, speed: 0.45 + (placed % 3) * 0.12, direction, turnAt: 3 + placed })
        placed++
      }
    }
  }

  update(dt: number, elapsed: number) {
    for (const animal of this.animals) {
      const walking = Math.sin(elapsed * animal.speed + animal.phase)
      animal.head.rotation.x = Math.sin(elapsed * 1.4 + animal.phase) * 0.07
      animal.legs.forEach((leg, index) => { leg.rotation.x = walking * (index % 2 ? -0.34 : 0.34) })
      animal.group.position.y += Math.sin(elapsed * 2 + animal.phase) * 0.0008
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
