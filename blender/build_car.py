import bpy, bmesh, math, os
from mathutils import Vector

OUT = "/root/.openclaw/workspace/userdata/158615332235517952/assets/car.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------------------------------------------------------------- materials
def mat(name, base, metallic, rough, emission=None, emit_strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        m.blend_method = 'BLEND'
    return m

M_BODY  = mat("CarPaint",  (0.62, 0.65, 0.69), 1.0, 0.16)
M_GLASS = mat("Glass",     (0.02, 0.025, 0.03), 0.85, 0.045)
M_DARK  = mat("Trim",      (0.03, 0.033, 0.038), 0.35, 0.55)
M_TIRE  = mat("Tire",      (0.012, 0.012, 0.014), 0.02, 0.92)
M_RIM   = mat("Rim",       (0.55, 0.58, 0.62), 1.0, 0.22)
M_HEAD  = mat("HeadLight", (1, 1, 1), 0.0, 0.15, emission=(0.86, 0.93, 1.0), emit_strength=6.0)
M_TAIL  = mat("TailLight", (0.75, 0.05, 0.05), 0.0, 0.2, emission=(1.0, 0.06, 0.04), emit_strength=5.0)
M_JET   = mat("JetGlow",   (0.05, 0.5, 0.9), 0.1, 0.3, emission=(0.25, 0.8, 1.0), emit_strength=7.0)

# ---------------------------------------------------------------- body loft
# (y, half_width, z_bottom, z_top, superellipse exponent)
SECTIONS = [
    (-2.86, 0.66, 0.34, 0.86, 4.4),
    (-2.62, 0.80, 0.30, 1.02, 4.0),
    (-2.28, 0.90, 0.28, 1.20, 3.5),
    (-1.86, 0.945, 0.27, 1.36, 3.1),
    (-1.30, 0.960, 0.27, 1.48, 2.9),
    (-0.66, 0.965, 0.27, 1.53, 2.8),
    ( 0.06, 0.960, 0.27, 1.52, 2.8),
    ( 0.76, 0.940, 0.27, 1.40, 3.0),
    ( 1.42, 0.910, 0.28, 1.14, 3.3),
    ( 2.02, 0.865, 0.29, 0.92, 3.7),
    ( 2.55, 0.790, 0.31, 0.80, 4.2),
    ( 2.84, 0.700, 0.33, 0.74, 4.6),
]
SEG = 28

def ring(hw, zb, zt, n):
    cz, hz = (zb + zt) / 2.0, (zt - zb) / 2.0
    out = []
    for i in range(SEG):
        t = 2.0 * math.pi * i / SEG
        ct, st = math.cos(t), math.sin(t)
        x = hw * math.copysign(abs(ct) ** (2.0 / n), ct)
        z = cz + hz * math.copysign(abs(st) ** (2.0 / n), st)
        out.append((x, z))
    return out

verts, faces = [], []
for (y, hw, zb, zt, n) in SECTIONS:
    for (x, z) in ring(hw, zb, zt, n):
        verts.append((x, y, z))
NS = len(SECTIONS)
for i in range(NS - 1):
    for j in range(SEG):
        a = i * SEG + j
        b = i * SEG + (j + 1) % SEG
        c = (i + 1) * SEG + (j + 1) % SEG
        d = (i + 1) * SEG + j
        faces.append((a, b, c, d))
faces.append(tuple(range(SEG - 1, -1, -1)))                       # nose cap
faces.append(tuple((NS - 1) * SEG + j for j in range(SEG)))       # tail cap

me = bpy.data.meshes.new("Body")
me.from_pydata(verts, [], faces)
me.update()
body = bpy.data.objects.new("Body", me)
bpy.context.collection.objects.link(body)

# glass vs paint by face position
me.materials.append(M_BODY)
me.materials.append(M_GLASS)
for poly in me.polygons:
    c = poly.center
    n = poly.normal
    roof_glass = c.z > 1.24 and n.z > 0.22 and (-2.05 < c.y < 1.35)
    side_glass = c.z > 1.13 and abs(n.x) > 0.70 and (-1.60 < c.y < 0.95)
    if roof_glass or side_glass:
        poly.material_index = 1

bpy.context.view_layer.objects.active = body
body.select_set(True)

# smoothing + subdivision
mod = body.modifiers.new("Subsurf", 'SUBSURF')
mod.levels = 2
mod.render_levels = 2
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.shade_smooth()

# ---------------------------------------------------------------- wheel arches (boolean)
AXLES = [1.74, -1.76]
WHEEL_R, WHEEL_W = 0.375, 0.26
cutters = []
for ay in AXLES:
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=WHEEL_R + 0.075, depth=0.9,
                                            location=(sx * 0.95, ay, WHEEL_R + 0.02),
                                            rotation=(0, math.radians(90), 0))
        cutters.append(bpy.context.object)

bpy.context.view_layer.objects.active = body
for c in cutters:
    b = body.modifiers.new("Bool", 'BOOLEAN')
    b.operation = 'DIFFERENCE'
    b.object = c
    b.solver = 'EXACT'
    bpy.ops.object.modifier_apply(modifier=b.name)
for c in cutters:
    bpy.data.objects.remove(c, do_unlink=True)

# ---------------------------------------------------------------- wheels
def add_wheel(y, sx):
    parts = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=WHEEL_R, depth=WHEEL_W,
                                        location=(sx * 0.90, y, WHEEL_R),
                                        rotation=(0, math.radians(90), 0))
    t = bpy.context.object
    t.name = "Tire"
    t.data.materials.append(M_TIRE)
    bpy.ops.object.shade_smooth()
    be = t.modifiers.new("Bevel", 'BEVEL')
    be.width = 0.05
    be.segments = 3
    bpy.ops.object.modifier_apply(modifier=be.name)
    parts.append(t)

    bpy.ops.mesh.primitive_cylinder_add(vertices=36, radius=WHEEL_R * 0.66, depth=WHEEL_W + 0.02,
                                        location=(sx * 0.905, y, WHEEL_R),
                                        rotation=(0, math.radians(90), 0))
    r = bpy.context.object
    r.name = "Rim"
    r.data.materials.append(M_RIM)
    bpy.ops.object.shade_smooth()
    parts.append(r)

    for k in range(5):
        ang = 2 * math.pi * k / 5
        bpy.ops.mesh.primitive_cube_add(size=1, location=(sx * 0.925,
                                                          y + math.cos(ang) * 0.11,
                                                          WHEEL_R + math.sin(ang) * 0.11))
        sp = bpy.context.object
        sp.scale = (0.075, 0.055, 0.115)
        sp.rotation_euler = (ang, 0, 0)
        sp.data.materials.append(M_RIM)
        parts.append(sp)
    return parts

wheel_parts = []
for ay in AXLES:
    for sx in (-1, 1):
        wheel_parts += add_wheel(ay, sx)

# ---------------------------------------------------------------- light bars
def box(name, loc, scale, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    return o

box("HeadRecess", (0, 2.845, 0.70), (1.42, 0.05, 0.10), M_DARK)
box("HeadBar",    (0, 2.858, 0.70), (1.30, 0.04, 0.045), M_HEAD)
box("TailRecess", (0, -2.865, 0.90), (1.34, 0.05, 0.12), M_DARK)
box("TailBar",    (0, -2.878, 0.90), (1.26, 0.035, 0.05), M_TAIL)
box("TailBar2",   (0, -2.872, 1.00), (1.06, 0.03, 0.022), M_TAIL)

# ---------------------------------------------------------------- mirrors / trim
for sx in (-1, 1):
    box("MirrorArm", (sx * 1.00, 0.62, 1.06), (0.14, 0.045, 0.035), M_DARK)
    box("Mirror",    (sx * 1.10, 0.62, 1.08), (0.10, 0.13, 0.075), M_BODY)
    box("Sill",      (sx * 0.955, 0.0, 0.46), (0.03, 2.9, 0.10), M_DARK)

for sx in (-1, 1):
    box("HandleF", (sx * 0.965, 0.42, 0.99), (0.035, 0.19, 0.045), M_DARK)
    box("HandleR", (sx * 0.965, -0.95, 0.99), (0.035, 0.19, 0.045), M_DARK)
for sx in (-1, 1):
    box("WaistLine", (sx * 0.972, -0.30, 0.95), (0.012, 4.6, 0.014), M_DARK)
box("Wiper", (0, 1.60, 1.09), (0.86, 0.035, 0.02), M_DARK, rot=(0, math.radians(12), 0))
box("RoofSensor", (0, 0.05, 1.505), (0.14, 0.20, 0.04), M_DARK)

# ---------------------------------------------------------------- jet pods
for sx in (-0.52, 0.0, 0.52):
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.145, depth=0.42,
                                        location=(sx, -2.72, 0.58),
                                        rotation=(math.radians(90), 0, 0))
    p = bpy.context.object
    p.name = "JetPod"
    p.data.materials.append(M_DARK)
    bpy.ops.object.shade_smooth()

    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.115, depth=0.02,
                                        location=(sx, -2.93, 0.58),
                                        rotation=(math.radians(90), 0, 0))
    g = bpy.context.object
    g.name = "JetGlow"
    g.data.materials.append(M_JET)

# ---------------------------------------------------------------- parent to empty
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.parent_set(type='OBJECT', keep_transform=True)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB',
                          export_apply=True, export_yup=True,
                          export_materials='EXPORT')
print("EXPORTED", OUT, os.path.getsize(OUT))
