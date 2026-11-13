import os
from typing import Tuple, Optional
import requests
from backend.app.llm.base import LLMProvider

class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: Optional[str] = None, model_name: str = "gpt-4o-mini"):
        super().__init__(model_name=model_name)
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is not set in environment or settings.")

    def _call_api(self, prompt: str, system_instruction: Optional[str] = None) -> Tuple[str, int, int]:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model_name,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": 0.4,
        }

        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        if not resp.ok:
            raise RuntimeError(f"OpenAI API error ({resp.status_code}): {resp.text}")

        data = resp.json()
        choices = data.get("choices", [])
        if not choices:
            raise RuntimeError(f"No choices returned by OpenAI: {data}")

        text = choices[0].get("message", {}).get("content", "")
        usage = data.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", max(1, len(prompt) // 4))
        completion_tokens = usage.get("completion_tokens", max(1, len(text) // 4))

        return text, prompt_tokens, completion_tokens
