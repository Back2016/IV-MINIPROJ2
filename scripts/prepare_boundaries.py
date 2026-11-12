"""Convert us-atlas 3.0.1 states-10m.json to offline boundaries for the dataset."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
atlas = json.loads(Path(sys.argv[1]).read_text())
states = {s["name"]: s["code"] for s in json.loads((root / "src/data.json").read_text())["states"]}
sx, sy = atlas["transform"]["scale"]
tx, ty = atlas["transform"]["translate"]
arcs = []
for arc in atlas["arcs"]:
    x = y = 0
    coordinates = []
    for dx, dy in arc:
        x += dx
        y += dy
        coordinates.append([round(x * sx + tx, 5), round(y * sy + ty, 5)])
    arcs.append(coordinates)

def ring(indices):
    points = []
    for i in indices:
        segment = arcs[i] if i >= 0 else arcs[~i][::-1]
        points.extend(segment if not points else segment[1:])
    assert points[0] == points[-1]
    return points

features = []
for geometry in atlas["objects"]["states"]["geometries"]:
    name = geometry["properties"]["name"]
    if name not in states:
        continue
    kind = geometry["type"]
    polygons = geometry["arcs"] if kind == "MultiPolygon" else [geometry["arcs"]]
    coordinates = [[ring(r) for r in polygon] for polygon in polygons]
    features.append({
        "type": "Feature", "id": states[name], "properties": {},
        "geometry": {"type": kind, "coordinates": coordinates if kind == "MultiPolygon" else coordinates[0]},
    })
assert {f["id"] for f in features} == set(states.values())
(root / "src/state-boundaries.json").write_text(
    json.dumps({"type": "FeatureCollection", "features": sorted(features, key=lambda f: f["id"])}, separators=(",", ":")) + "\n"
)
