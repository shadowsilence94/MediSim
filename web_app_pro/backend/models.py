import torch
import torch.nn as nn
from torchvision import models

class MediSimFusionModel(nn.Module):
    def __init__(self, vocab_size, num_classes):
        super().__init__()
        # Image Encoder (ResNet-18)
        # Keep initialization lightweight for hosted runtimes; custom checkpoint
        # loading in main.py will populate final weights.
        self.resnet = models.resnet18(weights=None)
        self.resnet.fc = nn.Linear(512, 128)
        
        # Text Encoder (biLSTM)
        self.embedding = nn.Embedding(vocab_size, 64)
        self.lstm = nn.LSTM(64, 64, bidirectional=True, batch_first=True)
        self.text_fc = nn.Linear(128, 128)
        
        # Fusion & Classification
        self.classifier = nn.Sequential(
            nn.Linear(128 + 128, 64),
            nn.ReLU(),
            nn.Linear(64, num_classes)
        )
        
    def forward(self, img, text):
        # image: (batch, 3, 224, 224)
        v_feat = self.resnet(img)
        
        # text: (batch, seq_len)
        embedded = self.embedding(text)
        _, (hn, _) = self.lstm(embedded)
        # Concatenate forward and backward hidden states
        t_feat = torch.cat((hn[-2], hn[-1]), dim=1)
        t_feat = self.text_fc(t_feat)
        
        # Fusion
        fused = torch.cat((v_feat, t_feat), dim=1)
        return self.classifier(fused)

def get_model(vocab_size, num_classes, device="cpu"):
    model = MediSimFusionModel(vocab_size=vocab_size, num_classes=num_classes)
    return model.to(device)
