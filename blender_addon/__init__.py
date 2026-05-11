bl_info = {
    "name": "Polyhydra",
    "author": "polyhydra-web",
    "version": (1, 1, 0),
    "blender": (3, 0, 0),
    "location": "View3D > Sidebar > Polyhydra",
    "description": "Serves the Polyhydra web app and receives geometry via HTTP",
    "category": "Import-Export",
}

import bpy
import functools
import json
import os
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer, SimpleHTTPRequestHandler

RECEIVER_PORT = 8765
WEB_PORT = 8766
WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web')

_receiver: HTTPServer | None = None
_receiver_thread: threading.Thread | None = None
_web_server: HTTPServer | None = None
_web_thread: threading.Thread | None = None


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def hex_to_linear(hex_color: str) -> tuple[float, float, float]:
    hex_color = hex_color.lstrip('#')
    r = int(hex_color[0:2], 16) / 255.0
    g = int(hex_color[2:4], 16) / 255.0
    b = int(hex_color[4:6], 16) / 255.0
    def srgb(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return srgb(r), srgb(g), srgb(b)


def create_mesh_from_data(data: dict) -> None:
    verts_flat = data['vertices']
    faces = data['faces']
    colors = data.get('colors', [])

    verts = [
        (verts_flat[i], verts_flat[i + 1], verts_flat[i + 2])
        for i in range(0, len(verts_flat), 3)
    ]

    mesh = bpy.data.meshes.new('Polyhydra')
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    if colors:
        color_layer = mesh.vertex_colors.new(name='Col')
        for poly in mesh.polygons:
            hex_color = colors[poly.index] if poly.index < len(colors) else '#ffffff'
            r, g, b = hex_to_linear(hex_color)
            for loop_idx in poly.loop_indices:
                color_layer.data[loop_idx].color = (r, g, b, 1.0)

        mat = bpy.data.materials.new('PolyhydraColors')
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()

        vcol_node = nodes.new('ShaderNodeVertexColor')
        vcol_node.layer_name = 'Col'
        bsdf_node = nodes.new('ShaderNodeBsdfPrincipled')
        output_node = nodes.new('ShaderNodeOutputMaterial')
        links.new(vcol_node.outputs['Color'], bsdf_node.inputs['Base Color'])
        links.new(bsdf_node.outputs['BSDF'], output_node.inputs['Surface'])
        bsdf_node.location = (200, 0)
        output_node.location = (500, 0)

        mesh.materials.append(mat)

    obj = bpy.data.objects.new('Polyhydra', mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)

    return None  # unregisters bpy.app.timers callback


# ---------------------------------------------------------------------------
# Geometry receiver (port 8765)
# ---------------------------------------------------------------------------

class PolyhydraHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self) -> None:
        if self.path != '/polyhydra':
            self.send_response(404)
            self._cors()
            self.end_headers()
            return

        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_response(400)
            self._cors()
            self.end_headers()
            return

        bpy.app.timers.register(lambda: create_mesh_from_data(data), first_interval=0.0)

        self.send_response(200)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def _cors(self) -> None:
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, format, *args) -> None:
        pass


# ---------------------------------------------------------------------------
# Static file server (port 8766)
# ---------------------------------------------------------------------------

class QuietStaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args) -> None:
        pass


# ---------------------------------------------------------------------------
# Operators
# ---------------------------------------------------------------------------

class POLYHYDRA_OT_open_browser(bpy.types.Operator):
    bl_idname = "polyhydra.open_browser"
    bl_label = "Open Polyhydra"
    bl_description = "Start both servers and open the web app in your browser"

    def execute(self, context):
        global _web_server, _web_thread, _receiver, _receiver_thread

        if not os.path.isdir(WEB_DIR):
            self.report({'ERROR'}, "Web files not found — run: npm run build:blender")
            return {'CANCELLED'}

        if _web_server is None:
            handler = functools.partial(QuietStaticHandler, directory=WEB_DIR)
            _web_server = HTTPServer(('localhost', WEB_PORT), handler)
            _web_thread = threading.Thread(target=_web_server.serve_forever, daemon=True)
            _web_thread.start()

        if _receiver is None:
            _receiver = HTTPServer(('localhost', RECEIVER_PORT), PolyhydraHandler)
            _receiver_thread = threading.Thread(target=_receiver.serve_forever, daemon=True)
            _receiver_thread.start()

        webbrowser.open(f"http://localhost:{WEB_PORT}")
        return {'FINISHED'}


class POLYHYDRA_OT_stop(bpy.types.Operator):
    bl_idname = "polyhydra.stop"
    bl_label = "Stop"
    bl_description = "Stop both servers"

    def execute(self, context):
        global _web_server, _web_thread, _receiver, _receiver_thread
        for srv in (_web_server, _receiver):
            if srv is not None:
                srv.shutdown()
        _web_server = _web_thread = _receiver = _receiver_thread = None
        return {'FINISHED'}


# ---------------------------------------------------------------------------
# Panel
# ---------------------------------------------------------------------------

class POLYHYDRA_PT_panel(bpy.types.Panel):
    bl_label = "Polyhydra"
    bl_idname = "POLYHYDRA_PT_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Polyhydra'

    def draw(self, context):
        layout = self.layout
        running = _web_server is not None

        if running:
            layout.label(text="Running — browser ready", icon='CHECKMARK')
            row = layout.row(align=True)
            row.operator("polyhydra.open_browser", text="Reopen Browser", icon='URL')
            row.operator("polyhydra.stop", text="Stop", icon='X')
        else:
            layout.operator("polyhydra.open_browser", icon='PLAY')


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

classes = (
    POLYHYDRA_OT_open_browser,
    POLYHYDRA_OT_stop,
    POLYHYDRA_PT_panel,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    global _receiver, _receiver_thread, _web_server, _web_thread
    for srv in (_receiver, _web_server):
        if srv is not None:
            srv.shutdown()
    _receiver = _receiver_thread = _web_server = _web_thread = None
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
