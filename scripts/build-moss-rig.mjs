// Merges Meshy's per-animation GLBs (same skinned mesh + armature) into one GLB with named clips.
//
//   node scripts/build-moss-rig.mjs
//   npx @gltf-transform/cli optimize visuals/meshy/moss-rigged-merged.glb apps/web/public/assets/models/moss-rigged.glb \
//     --texture-compress webp --texture-size 1024 --compress meshopt --simplify false
import { NodeIO } from '@gltf-transform/core'

const io = new NodeIO()
const base = await io.read('visuals/meshy/moss-walk-raw.glb')
const sources = [{ file: 'visuals/meshy/moss-hop-raw.glb', name: 'hop' }]

const root = base.getRoot()
const nodesByName = new Map(root.listNodes().map((n) => [n.getName(), n]))
const buffer = root.listBuffers()[0]

const [walk] = root.listAnimations()
walk.setName('walk')

for (const { file, name } of sources) {
  const doc = await io.read(file)
  const [anim] = doc.getRoot().listAnimations()
  const out = base.createAnimation(name)
  for (const channel of anim.listChannels()) {
    const target = nodesByName.get(channel.getTargetNode()?.getName() ?? '')
    if (!target) throw new Error(`No node named ${channel.getTargetNode()?.getName()} in base GLB`)
    const sampler = channel.getSampler()
    const copy = (acc) =>
      base.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice()).setBuffer(buffer)
    const s = base
      .createAnimationSampler()
      .setInput(copy(sampler.getInput()))
      .setOutput(copy(sampler.getOutput()))
      .setInterpolation(sampler.getInterpolation())
    out.addSampler(s).addChannel(base.createAnimationChannel().setTargetNode(target).setTargetPath(channel.getTargetPath()).setSampler(s))
  }
}

await io.write('visuals/meshy/moss-rigged-merged.glb', base)
console.log('clips:', root.listAnimations().map((a) => a.getName()).join(', '))
