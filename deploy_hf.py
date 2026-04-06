from huggingface_hub import HfApi
import os

api = HfApi()

ignore_patterns = [
    "reports/*",
    "notebooks/*",
    "scripts/*",
    ".git/*",
    "A7_MCP_Agent_Setup/*",
    "deploy_hf.py",
    "*.pptx",
    "*.xlsx",
    "*.zip"
]

try:
    url = api.upload_folder(
        folder_path=".",
        repo_id="shadowsilence/medisim",
        repo_type="space",
        ignore_patterns=ignore_patterns,
        commit_message="Deploying Phase 3 Triage Updates via API"
    )
    print(f"Success! Deployed to {url}")
except Exception as e:
    print(f"Error deploying: {e}")
