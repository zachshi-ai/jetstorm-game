import bpy, math, sys, os
from mathutils import Vector

glb = "/root/.openclaw/workspace/userdata/158615332235517952/assets/car.glb"
hdr = "/root/.openclaw/workspace/userdata/158615332235517952/hdri/venice_1k.hdr"
out = sys.argv[-1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)

# world with HDR
world = bpy.data.worlds.new("W")
bpy.context.scene.world = world
world.use_nodes = True
nt = world.node_tree
env = nt.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(hdr)
bg = nt.nodes["Background"]
bg.inputs["Strength"].default_value = 1.0
nt.links.new(env.outputs["Color"], bg.inputs["Color"])

# ground
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
g = bpy.context.object
gm = bpy.data.materials.new("Ground")
gm.use_nodes = True
b = gm.node_tree.nodes["Principled BSDF"]
b.inputs["Base Color"].default_value = (0.06, 0.06, 0.07, 1)
b.inputs["Roughness"].default_value = 0.45
g.data.materials.append(gm)

# lights
bpy.ops.object.light_add(type='AREA', location=(-4.5, 2.0, 4.0))
k = bpy.context.object
k.data.energy = 900
k.data.size = 5
k.rotation_euler = (math.radians(58), 0, math.radians(-125))

bpy.ops.object.light_add(type='AREA', location=(5.0, -3.0, 2.6))
f = bpy.context.object
f.data.energy = 320
f.data.size = 4
f.rotation_euler = (math.radians(70), 0, math.radians(120))

# camera: rear three-quarter, slightly above
cam_data = bpy.data.cameras.new("Cam")
cam_data.lens = 62
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (4.2, -6.6, 2.9)
target = Vector((0, -0.2, 0.85))
d = target - cam.location
cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
bpy.context.scene.camera = cam

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 64
sc.cycles.use_denoising = True
sc.cycles.device = 'CPU'
sc.render.resolution_x = 720
sc.render.resolution_y = 520
sc.render.film_transparent = False
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print("RENDERED", out)
