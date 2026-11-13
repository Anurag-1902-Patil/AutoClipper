import os
from typing import Tuple, Optional
import requests
from backend.app.llm.base import LLMProvider

class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: Optional[str] = None, model_name: str = "claude-3-5-haiku-20241022"):
        super().__init__(model_name=model_name)
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY is not set in environment or settings.")

    def _call_api(self, prompt: str, system_instruction: Optional[str] = None) -> Tuple[str, int, int]:
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        
        payload = {
            "model": self.model_name,
            "max_tokens": 4096,
            "temperature": 0.4,
            "messages": [{"role": "user", "content": prompt}]
        }
        if system_instruction:
            payload["system"] = system_instruction

        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        if not resp.ok:
            raise RuntimeError(f"Anthropic API error ({resp.status_code}): {resp.text}")

        data = resp.json()
        content_blocks = data.get("content", [])
        text = "".join(b.get("text", "") for b in content_blocks if b.get("type") == "text")

        usage = data.get("usage", {})
        prompt_tokens = usage.get("input_tokens", max(1, len(prompt) // 4))
        completion_tokens = usage.get("output_tokens", max(1, len(text) // 4))

        return text, prompt_tokens, completion_tokens
