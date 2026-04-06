import os
import sys
import torch
import torch.nn as nn
from torchvision import transforms
from torch.utils.data import DataLoader, Dataset
import pandas as pd
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from transformers import AutoTokenizer

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(os.path.join(ROOT_DIR, "web_app_pro", "backend"))
from models import get_model
from PIL import Image

class TransformerDataset(Dataset):
    def __init__(self, df, img_dir, tokenizer, transform, max_len=60):
        self.df = df.reset_index(drop=True)
        self.img_dir = img_dir
        self.tokenizer = tokenizer
        self.transform = transform
        self.max_len = max_len

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = os.path.join(self.img_dir, row['filename'])
        img = Image.open(img_path).convert('RGB')
        if self.transform:
            img = self.transform(img)

        # text
        text = str(row['findings'])
        encoded = self.tokenizer(text, padding='max_length', truncation=True, max_length=self.max_len, return_tensors='pt')
        
        return img, encoded['input_ids'].squeeze(0), encoded['attention_mask'].squeeze(0), torch.tensor(row['label_idx'], dtype=torch.long)


def main():
    device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Using device: {device}")

    data_csv = os.path.join(ROOT_DIR, "data", "processed_metadata.csv")
    img_dir = os.path.join(ROOT_DIR, "data", "images", "images_normalized")
    save_dir = os.path.join(ROOT_DIR, "data")
    
    df = pd.read_csv(data_csv)
    df = df[df['filename'].notna() & df['label'].notna()]
    df['img_exists'] = df['filename'].map(lambda f: os.path.exists(os.path.join(img_dir, f)))
    df = df[df['img_exists']].copy()

    label_enc = LabelEncoder()
    df['label_idx'] = label_enc.fit_transform(df['label'])

    train_df, test_df = train_test_split(df, test_size=0.2, random_state=42, stratify=df['label'])

    tokenizer = AutoTokenizer.from_pretrained("emilyalsentzer/Bio_ClinicalBERT")
    
    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    train_ds = TransformerDataset(train_df, img_dir, tokenizer, transform)
    train_loader = DataLoader(train_ds, batch_size=32, shuffle=True)

    model = get_model(num_classes=len(label_enc.classes_), device=device, text_model_name="emilyalsentzer/Bio_ClinicalBERT").to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=1e-3)

    epochs = 3
    for epoch in range(epochs):
        model.train()
        running_loss = 0.0
        for imgs, input_ids, att_mask, labels in train_loader:
            imgs, input_ids, att_mask, labels = imgs.to(device), input_ids.to(device), att_mask.to(device), labels.to(device)
            
            optimizer.zero_grad()
            outputs = model(imgs, input_ids, att_mask)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item()
        
        print(f"Epoch {epoch+1}/{epochs} - Loss: {running_loss/len(train_loader):.4f}")

    # Save format
    torch.save(model.state_dict(), os.path.join(save_dir, "medisim_diagnostic_model.pth"))
    torch.save(label_enc, os.path.join(save_dir, "label_encoder.pth"))
    print("Training finished. Models saved to data/")

if __name__ == "__main__":
    main()
