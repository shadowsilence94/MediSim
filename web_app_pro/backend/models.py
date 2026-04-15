import torch
import torch.nn as nn
from torchvision import models
from transformers import AutoModel

class MediSimFusionModel(nn.Module):
    def __init__(self, vocab_size=None, num_classes=15, text_model_name=None):
        super().__init__()
        # Image Encoder (ResNet-18)
        self.resnet = models.resnet18(weights=None)
        self.resnet.fc = nn.Linear(512, 128)
        
        self.use_transformer = text_model_name is not None
        
        if self.use_transformer:
            # Text Encoder (Pretrained Transformer)
            self.text_encoder = AutoModel.from_pretrained(text_model_name)
            self.text_fc = nn.Linear(self.text_encoder.config.hidden_size, 128)
        else:
            # Text Encoder (biLSTM)
            if vocab_size is None:
                raise ValueError("vocab_size must be provided if not using a transformer.")
            self.embedding = nn.Embedding(vocab_size, 64)
            self.lstm = nn.LSTM(64, 64, bidirectional=True, batch_first=True)
            self.text_fc = nn.Linear(128, 128)
        
        # Fusion & Classification
        self.classifier = nn.Sequential(
            nn.Linear(128 + 128, 64),
            nn.ReLU(),
            nn.Linear(64, num_classes)
        )
        
    def forward(self, img, text, att_mask=None):
        # image: (batch, 3, 224, 224)
        v_feat = self.resnet(img)
        
        if self.use_transformer:
            # text = input_ids: (batch, seq_len)
            outputs = self.text_encoder(input_ids=text, attention_mask=att_mask)
            # Extracted pooled representation
            if hasattr(outputs, 'pooler_output') and outputs.pooler_output is not None:
                t_feat = outputs.pooler_output
            else:
                t_feat = outputs.last_hidden_state[:, 0, :]
            t_feat = self.text_fc(t_feat)
        else:
            # text: (batch, seq_len)
            embedded = self.embedding(text)
            _, (hn, _) = self.lstm(embedded)
            # Concatenate forward and backward hidden states
            t_feat = torch.cat((hn[-2], hn[-1]), dim=1)
            t_feat = self.text_fc(t_feat)
        
        # Fusion
        fused = torch.cat((v_feat, t_feat), dim=1)
        return self.classifier(fused)

def get_model(vocab_size=None, num_classes=15, device="cpu", text_model_name=None):
    model = MediSimFusionModel(vocab_size=vocab_size, num_classes=num_classes, text_model_name=text_model_name)
    return model.to(device)
