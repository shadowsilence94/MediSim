import json
import os

nb_path = "../notebooks/03_multimodal_fusion_training.ipynb"
with open(nb_path, "r", encoding="utf-8") as f:
    nb = json.load(f)

for cell in nb.get("cells", []):
    if cell["cell_type"] == "code":
        source = "".join(cell["source"])
        
        # Add AutoTokenizer import
        if "from sklearn.preprocessing import LabelEncoder" in source:
            source = source.replace(
                "import collections\n",
                "import collections\nfrom transformers import AutoTokenizer\n"
            )
            
        # Update Dataset Class (Train from scratch version)
        if "class IU_XRayDataset(Dataset):" in source:
            source = source.replace(
                "def __init__(self, csv_file, img_dir, vocab=None, transform=None):",
                "def __init__(self, csv_file, img_dir, tokenizer=None, transform=None):"
            )
            source = source.replace(
                "self.vocab = vocab",
                "self.tokenizer = tokenizer"
            )
            old_getitem = """        text = self.df.iloc[idx]['findings']
        tokens = [self.vocab.get(w, 0) for w in str(text).split()][:50]
        tokens = tokens + [0] * (50 - len(tokens))
        return image, torch.tensor(tokens, dtype=torch.long), torch.tensor(self.df.iloc[idx]['label_idx'])"""
            
            new_getitem = """        text = str(self.df.iloc[idx]['findings'])
        encoded = self.tokenizer(text, padding='max_length', truncation=True, max_length=50, return_tensors='pt')
        return image, encoded['input_ids'].squeeze(0), encoded['attention_mask'].squeeze(0), torch.tensor(self.df.iloc[idx]['label_idx'])"""
            source = source.replace(old_getitem, new_getitem)
            
        # Update dataloader loop & evaluate loop inside compute_metrics
        if "def compute_metrics(" in source:
            source = source.replace(
                "        for images, texts, labels in loader:\n            outputs = model(images.to(device), texts.to(device))",
                "        for images, input_ids, att_masks, labels in loader:\n            outputs = model(images.to(device), input_ids.to(device), att_masks.to(device))"
            )
            
            # Update instantiation
            source = source.replace(
                "dataset = IU_XRayDataset(METADATA_PATH, IMAGES_DIR, vocab=vocab, transform=transform)",
                "tokenizer = AutoTokenizer.from_pretrained('emilyalsentzer/Bio_ClinicalBERT')\n    dataset = IU_XRayDataset(METADATA_PATH, IMAGES_DIR, tokenizer=tokenizer, transform=transform)"
            )
            
            source = source.replace(
                "model = get_model(vocab_size=len(vocab), num_classes=num_classes, device=device).to(device)",
                "model = get_model(num_classes=num_classes, device=device, text_model_name='emilyalsentzer/Bio_ClinicalBERT').to(device)"
            )
            
            source = source.replace(
                "for images, texts, labels in train_loader:",
                "for images, input_ids, att_masks, labels in train_loader:"
            )
            source = source.replace(
                "images, texts, labels = images.to(device), texts.to(device), labels.to(device)",
                "images, input_ids, att_masks, labels = images.to(device), input_ids.to(device), att_masks.to(device), labels.to(device)"
            )
            source = source.replace(
                "outputs = model(images, texts)",
                "outputs = model(images, input_ids, att_masks)"
            )

        # Update Retrained Pipeline version
        if "class FusionDataset(Dataset):" in source:
            source = source.replace("self.vocab = vocab", "self.tokenizer = vocab") # Keep signature compat
            source = source.replace(
                "text_ids = encode_text(row[\"text_input\"], self.vocab, self.max_len)\n        text_tensor = torch.tensor(text_ids, dtype=torch.long)",
                "encoded = self.tokenizer(str(row[\"text_input\"]), padding='max_length', truncation=True, max_length=self.max_len, return_tensors='pt')\n        text_tensor = encoded['input_ids'].squeeze(0)\n        att_mask = encoded['attention_mask'].squeeze(0)"
            )
            source = source.replace(
                "return img, text_tensor, label_tensor",
                "return img, text_tensor, att_mask, label_tensor"
            )

        if "def evaluate(model, loader, device):" in source:
            source = source.replace(
                "for imgs, txt, y in loader:",
                "for imgs, txt, mask, y in loader:"
            )
            source = source.replace(
                "txt = txt.to(device)",
                "txt = txt.to(device)\n            mask = mask.to(device)"
            )
            source = source.replace(
                "logits = model(imgs, txt)",
                "logits = model(imgs, txt, mask)"
            )

        if "def train_retrained_fusion(cfg: TrainConfig):" in source:
            # Change build_vocab to tokenizer download
            source = source.replace(
                "vocab = build_vocab(df[\"text_input\"].tolist(), min_freq=cfg.min_freq)",
                "from transformers import AutoTokenizer\n    vocab = AutoTokenizer.from_pretrained('emilyalsentzer/Bio_ClinicalBERT')" # reuse vocab var name
            )
            source = source.replace(
                "get_model(vocab_size=len(vocab)",
                "get_model(num_classes=len(label_encoder.classes_), text_model_name='emilyalsentzer/Bio_ClinicalBERT'"
            )
            # Update train loop
            source = source.replace(
                "for imgs, txt, y in train_loader:",
                "for imgs, txt, mask, y in train_loader:"
            )
            source = source.replace(
                "txt = txt.to(device)",
                "txt = txt.to(device)\n            mask = mask.to(device)"
            )
            source = source.replace(
                "logits = model(imgs, txt)",
                "logits = model(imgs, txt, mask)"
            )

        # Ensure correct formatting
        cell["source"] = [s + '\n' if not s.endswith('\n') else s for s in source.splitlines()]

with open(nb_path, "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=1)

print("Notebook updated successfully.")
