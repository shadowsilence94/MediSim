import json

nb_path = "../notebooks/03_multimodal_fusion_training.ipynb"
with open(nb_path, "r", encoding="utf-8") as f:
    nb = json.load(f)

# Filter out the cells that are part of the 'Retraining Upgrade'
new_cells = []
skip_mode = False
for cell in nb.get("cells", []):
    source = "".join(cell.get("source", []))
    
    if "## Retraining Upgrade (Notebook Workflow)" in source:
        skip_mode = True
        
    if not skip_mode:
        new_cells.append(cell)

nb["cells"] = new_cells

with open(nb_path, "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=1)

print(f"Removed {len(nb.get('cells', [])) - len(new_cells)} retraining cells.")
