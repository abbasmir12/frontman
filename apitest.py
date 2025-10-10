import os
from huggingface_hub import InferenceClient

def main():
    # Make sure you set your HF API token first:
    # Linux/macOS: export HF_TOKEN="your_token_here"
    # Windows (PowerShell): $env:HF_TOKEN="your_token_here"

    hf_token = os.getenv("HF_TOKEN")
    if not hf_token:
        raise ValueError("HF_TOKEN environment variable not set. Please set it with your Hugging Face token.")

    # Initialize client
    client = InferenceClient(
        provider="auto",
        api_key=hf_token,
    )

    # Text to embed
    text = "Today is a sunny day and I will get some ice cream."

    # Run feature extraction (embeddings)
    result = client.feature_extraction(
        text,
        model="Qwen/Qwen3-Embedding-8B",
    )

    # Print embeddings length + first 10 dims
    print(f"Embedding vector length: {len(result)}")
    print("First 10 dimensions:", result[:10])

if __name__ == "__main__":
    main()
