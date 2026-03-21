#!/usr/bin/env python3
import argparse
import json
import os
import random
import re
import sys
from collections import Counter
from dataclasses import dataclass

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from PIL import Image
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import transforms


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(ROOT_DIR, "web_app_pro", "backend")
if BACKEND_DIR not in sys.path:
    sys.path.append(BACKEND_DIR)

from models import get_model  # noqa: E402


@dataclass
class TrainConfig:
    data_csv: str
    image_dir: str
    output_dir: str
    epochs: int
    batch_size: int
    lr: float
    max_len: int
    min_freq: int
    seed: int
    use_weighted_sampler: bool


def set_seed(seed: int):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def clean_text(text: str) -> str:
    text = str(text or "").lower()
    text = re.sub(r"\b(xxxx|xx|x)\b", " ", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def build_text_field(df: pd.DataFrame) -> pd.Series:
    cols = [c for c in ["indication", "findings", "impression"] if c in df.columns]
    if not cols:
        return pd.Series([""] * len(df))
    merged = df[cols].fillna("").agg(" ".join, axis=1)
    return merged.map(clean_text)


def build_vocab(texts, min_freq: int = 2):
    counter = Counter()
    for text in texts:
        counter.update(text.split())

    vocab = {"<pad>": 0, "<unk>": 1}
    for token, freq in counter.items():
        if freq >= min_freq:
            vocab[token] = len(vocab)
    return vocab


def encode_text(text: str, vocab: dict, max_len: int):
    ids = [vocab.get(tok, vocab["<unk>"]) for tok in text.split()][:max_len]
    ids += [vocab["<pad>"]] * (max_len - len(ids))
    return ids


class FusionDataset(Dataset):
    def __init__(self, df, image_dir, vocab, label_encoder, transform, max_len):
        self.df = df.reset_index(drop=True)
        self.image_dir = image_dir
        self.vocab = vocab
        self.label_encoder = label_encoder
        self.transform = transform
        self.max_len = max_len

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = os.path.join(self.image_dir, row["filename"])

        img = Image.open(img_path).convert("RGB")
        img = self.transform(img)

        text_ids = encode_text(row["text_input"], self.vocab, self.max_len)
        text_tensor = torch.tensor(text_ids, dtype=torch.long)

        label_id = int(self.label_encoder.transform([row["label"]])[0])
        label_tensor = torch.tensor(label_id, dtype=torch.long)

        return img, text_tensor, label_tensor


def make_dataloaders(df, cfg: TrainConfig, vocab, label_encoder):
    train_df, temp_df = train_test_split(
        df,
        test_size=0.30,
        random_state=cfg.seed,
        stratify=df["label"],
    )
    val_df, test_df = train_test_split(
        temp_df,
        test_size=0.50,
        random_state=cfg.seed,
        stratify=temp_df["label"],
    )

    tfm = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )

    train_ds = FusionDataset(train_df, cfg.image_dir, vocab, label_encoder, tfm, cfg.max_len)
    val_ds = FusionDataset(val_df, cfg.image_dir, vocab, label_encoder, tfm, cfg.max_len)
    test_ds = FusionDataset(test_df, cfg.image_dir, vocab, label_encoder, tfm, cfg.max_len)

    if cfg.use_weighted_sampler:
        class_counts = train_df["label"].value_counts()
        weights = train_df["label"].map(lambda x: 1.0 / class_counts[x]).values
        sampler = WeightedRandomSampler(weights=torch.tensor(weights, dtype=torch.double), num_samples=len(weights), replacement=True)
        train_loader = DataLoader(train_ds, batch_size=cfg.batch_size, sampler=sampler)
    else:
        train_loader = DataLoader(train_ds, batch_size=cfg.batch_size, shuffle=True)

    val_loader = DataLoader(val_ds, batch_size=cfg.batch_size, shuffle=False)
    test_loader = DataLoader(test_ds, batch_size=cfg.batch_size, shuffle=False)
    return train_loader, val_loader, test_loader, train_df


def evaluate(model, loader, device):
    model.eval()
    y_true, y_pred = [], []
    with torch.no_grad():
        for imgs, txt, y in loader:
            imgs = imgs.to(device)
            txt = txt.to(device)
            y = y.to(device)
            logits = model(imgs, txt)
            preds = torch.argmax(logits, dim=1)
            y_true.extend(y.cpu().numpy().tolist())
            y_pred.extend(preds.cpu().numpy().tolist())

    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, average="weighted", zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, average="weighted", zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
        "samples": len(y_true),
    }


def train(cfg: TrainConfig):
    set_seed(cfg.seed)

    df = pd.read_csv(cfg.data_csv)
    expected = {"filename", "label"}
    if not expected.issubset(set(df.columns)):
        raise ValueError(f"{cfg.data_csv} must contain columns: {sorted(expected)}")

    df = df.copy()
    df["text_input"] = build_text_field(df)
    df = df[df["filename"].notna() & df["label"].notna()].copy()

    df["img_exists"] = df["filename"].map(lambda f: os.path.exists(os.path.join(cfg.image_dir, f)))
    missing = int((~df["img_exists"]).sum())
    if missing > 0:
        print(f"Dropping {missing} rows with missing image files.")
        df = df[df["img_exists"]].copy()

    vocab = build_vocab(df["text_input"].tolist(), min_freq=cfg.min_freq)
    label_encoder = LabelEncoder()
    label_encoder.fit(df["label"].astype(str))

    device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    model = get_model(vocab_size=len(vocab), num_classes=len(label_encoder.classes_), device=device)

    train_loader, val_loader, test_loader, train_df = make_dataloaders(df, cfg, vocab, label_encoder)

    # Weighted loss to improve minority classes.
    train_counts = train_df["label"].value_counts()
    class_weight_values = []
    for cls in label_encoder.classes_:
        class_weight_values.append(1.0 / float(train_counts.get(cls, 1.0)))
    class_weights = torch.tensor(class_weight_values, dtype=torch.float32, device=device)

    criterion = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg.lr)

    best_val_f1 = -1.0
    best_state = None
    epoch_loss, epoch_acc = [], []

    for epoch in range(cfg.epochs):
        model.train()
        running_loss = 0.0
        correct = 0
        total = 0

        for imgs, txt, y in train_loader:
            imgs = imgs.to(device)
            txt = txt.to(device)
            y = y.to(device)

            optimizer.zero_grad()
            logits = model(imgs, txt)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()

            running_loss += loss.item() * y.size(0)
            preds = torch.argmax(logits, dim=1)
            correct += int((preds == y).sum().item())
            total += int(y.size(0))

        train_loss = running_loss / max(total, 1)
        train_acc = correct / max(total, 1)
        val_metrics = evaluate(model, val_loader, device)

        epoch_loss.append(train_loss)
        epoch_acc.append(train_acc)

        print(
            f"Epoch {epoch + 1}/{cfg.epochs} | "
            f"train_loss={train_loss:.4f} train_acc={train_acc:.4f} "
            f"val_f1={val_metrics['f1']:.4f}"
        )

        if val_metrics["f1"] > best_val_f1:
            best_val_f1 = val_metrics["f1"]
            best_state = {k: v.cpu() for k, v in model.state_dict().items()}

    if best_state is not None:
        model.load_state_dict(best_state)

    test_metrics = evaluate(model, test_loader, device)
    os.makedirs(cfg.output_dir, exist_ok=True)

    model_path = os.path.join(cfg.output_dir, "medisim_diagnostic_model_retrained.pth")
    vocab_path = os.path.join(cfg.output_dir, "vocab_retrained.pth")
    encoder_path = os.path.join(cfg.output_dir, "label_encoder_retrained.pth")
    insights_path = os.path.join(cfg.output_dir, "retrained_fusion_insights.json")

    torch.save(model.state_dict(), model_path)
    torch.save(vocab, vocab_path)
    torch.save(label_encoder, encoder_path)

    insights = {
        "retrained_multimodal_fusion": {
            "summary": test_metrics,
            "epoch_loss": epoch_loss,
            "epoch_accuracy": epoch_acc,
            "class_names": list(label_encoder.classes_),
            "config": {
                "epochs": cfg.epochs,
                "batch_size": cfg.batch_size,
                "lr": cfg.lr,
                "max_len": cfg.max_len,
                "min_freq": cfg.min_freq,
                "seed": cfg.seed,
                "weighted_sampler": cfg.use_weighted_sampler,
            },
        }
    }

    with open(insights_path, "w", encoding="utf-8") as f:
        json.dump(insights, f, indent=2)

    print("\nRetraining complete.")
    print(f"Model: {model_path}")
    print(f"Vocab: {vocab_path}")
    print(f"Label encoder: {encoder_path}")
    print(f"Insights: {insights_path}")
    print(f"Test metrics: {test_metrics}")


def parse_args():
    parser = argparse.ArgumentParser(description="Retrain MediSim diagnostic model with cleaned text and class balancing.")
    parser.add_argument("--data-csv", default=os.path.join(ROOT_DIR, "data", "processed_metadata.csv"))
    parser.add_argument("--image-dir", default=os.path.join(ROOT_DIR, "data", "images", "images_normalized"))
    parser.add_argument("--output-dir", default=os.path.join(ROOT_DIR, "data"))
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--max-len", type=int, default=60)
    parser.add_argument("--min-freq", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--no-weighted-sampler", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    cfg = TrainConfig(
        data_csv=args.data_csv,
        image_dir=args.image_dir,
        output_dir=args.output_dir,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        max_len=args.max_len,
        min_freq=args.min_freq,
        seed=args.seed,
        use_weighted_sampler=not args.no_weighted_sampler,
    )
    train(cfg)


if __name__ == "__main__":
    main()
