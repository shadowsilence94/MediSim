import json

nb_path = "../notebooks/03_multimodal_fusion_training.ipynb"
with open(nb_path, "r", encoding="utf-8") as f:
    nb = json.load(f)

for cell in nb.get("cells", []):
    source = cell.get("source", [])
    for i in range(len(source)):
        source[i] = source[i].replace("biLSTM", "Transformer")
    cell["source"] = source

with open(nb_path, "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=1)

print("Replaced biLSTM with Transformer successfully.")
