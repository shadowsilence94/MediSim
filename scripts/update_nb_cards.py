import json
import os

nb_path = "../notebooks/03_multimodal_fusion_training.ipynb"
with open(nb_path, "r", encoding="utf-8") as f:
    nb = json.load(f)

# The new HTML Cards code
card_source = [
    "from IPython.display import display, HTML\n",
    "\n",
    "html_cards = \"\"\"\n",
    "<div style=\"display:flex; flex-direction:column; gap:20px; font-family:sans-serif; margin-top: 20px;\">\n",
    "  <div style=\"display:flex; gap:20px; justify-content:center;\">\n",
    "    <div style=\"background:#f8f9fa; padding:20px; border-radius:10px; text-align:center; flex:1; box-shadow: 0 4px 6px rgba(0,0,0,0.05);\">\n",
    "      <h3 style=\"margin:0; color:#6c757d; font-size:16px; text-transform:uppercase; letter-spacing:1px;\">Baseline Acc</h3>\n",
    "      <h1 style=\"color:#343a40; margin:10px 0 0 0; font-size:36px;\">46.04%</h1>\n",
    "    </div>\n",
    "    <div style=\"background:#f8f9fa; padding:20px; border-radius:10px; text-align:center; flex:1; box-shadow: 0 4px 6px rgba(0,0,0,0.05);\">\n",
    "      <h3 style=\"margin:0; color:#6c757d; font-size:16px; text-transform:uppercase; letter-spacing:1px;\">Baseline F1</h3>\n",
    "      <h1 style=\"color:#343a40; margin:10px 0 0 0; font-size:36px;\">43.52%</h1>\n",
    "    </div>\n",
    "    <div style=\"background:#f8f9fa; padding:20px; border-radius:10px; text-align:center; flex:1; box-shadow: 0 4px 6px rgba(0,0,0,0.05);\">\n",
    "      <h3 style=\"margin:0; color:#6c757d; font-size:16px; text-transform:uppercase; letter-spacing:1px;\">Baseline P/R</h3>\n",
    "      <h1 style=\"color:#343a40; margin:10px 0 0 0; font-size:36px;\">43.1 / 46.0</h1>\n",
    "    </div>\n",
    "  </div>\n",
    "  \n",
    "  <div style=\"display:flex; gap:20px; justify-content:center;\">\n",
    "    <div style=\"background:#e3f2fd; padding:20px; border-radius:10px; text-align:center; flex:1; box-shadow: 0 4px 12px rgba(33,150,243,0.15); border: 2px solid #bbdefb;\">\n",
    "      <h3 style=\"margin:0; color:#1976d2; font-size:16px; text-transform:uppercase; letter-spacing:1px;\">Fusion Acc</h3>\n",
    "      <h1 style=\"color:#0d47a1; margin:10px 0 0 0; font-size:36px;\">51.08%</h1>\n",
    "    </div>\n",
    "    <div style=\"background:#e3f2fd; padding:20px; border-radius:10px; text-align:center; flex:1; box-shadow: 0 4px 12px rgba(33,150,243,0.15); border: 2px solid #bbdefb;\">\n",
    "      <h3 style=\"margin:0; color:#1976d2; font-size:16px; text-transform:uppercase; letter-spacing:1px;\">Fusion F1</h3>\n",
    "      <h1 style=\"color:#0d47a1; margin:10px 0 0 0; font-size:36px;\">46.82%</h1>\n",
    "    </div>\n",
    "    <div style=\"background:#e3f2fd; padding:20px; border-radius:10px; text-align:center; flex:1; box-shadow: 0 4px 12px rgba(33,150,243,0.15); border: 2px solid #bbdefb;\">\n",
    "      <h3 style=\"margin:0; color:#1976d2; font-size:16px; text-transform:uppercase; letter-spacing:1px;\">Fusion P/R</h3>\n",
    "      <h1 style=\"color:#0d47a1; margin:10px 0 0 0; font-size:36px;\">44.9 / 51.1</h1>\n",
    "    </div>\n",
    "  </div>\n",
    "</div>\n",
    "\"\"\"\n",
    "display(HTML(html_cards))\n"
]

# Find and replace the last cell (which should be the comparison cell)
found = False
for i, cell in enumerate(nb["cells"]):
    if "".join(cell.get("source", [])).startswith("# --- Baseline vs Fusion Comparison Visualization ---"):
        nb["cells"][i]["source"] = card_source
        found = True

# If it wasn't found (maybe they reloaded an older version again?), append it
if not found:
    nb["cells"].append({
     "cell_type": "code",
     "execution_count": None,
     "metadata": {},
     "outputs": [],
     "source": card_source
    })

with open(nb_path, "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=1)

print("Updated with HTML cards successfully.")
