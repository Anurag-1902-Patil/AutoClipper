import os
from typing import Tuple, Optional
import requests
from backend.app.llm.base import LLMProvider

class GeminiProvider(LLMProvider):
    def __init__(self, api_key: Optional[str] = None, model_name: str = "gemini-2.5-flash"):
        super().__init__(model_name=model_name)
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is not set in environment or settings.")

    def _call_api(self, prompt: str, system_instruction: Optional[str] = None) -> Tuple[str, int, int]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent?key={self.api_key}"
        
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.4,
                "responseMimeType": "application/json"
            }
        }
        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        resp = requests.post(url, json=payload, timeout=60)
        if not resp.ok:
            raise RuntimeError(f"Gemini API error ({resp.status_code}): {resp.text}")

        data = resp.json()
        candidates = data.get("candidates", [])
        if not candidates or "content" not in candidates[0]:
            raise RuntimeError(f"No content returned by Gemini: {data}")

        parts = candidates[0]["content"].get("parts", [])
        text = "".join(p.get("text", "") for p in parts)

        usage = data.get("usageMetadata", {})
        prompt_tokens = usage.get("promptTokenCount", max(1, len(prompt) // 4))
        completion_tokens = usage.get("candidatesTokenCount", max(1, len(text) // 4))

        return text, prompt_tokens, completion_tokens
