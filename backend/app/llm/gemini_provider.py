import os
import time
import logging
from typing import Tuple, Optional, List
import requests
from backend.app.llm.base import LLMProvider

logger = logging.getLogger("clipper.gemini")

class GeminiProvider(LLMProvider):
    def __init__(self, api_key: Optional[str] = None, model_name: str = "gemini-3.6-flash"):
        super().__init__(model_name=model_name)
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is not set in environment or settings.")

    def _call_api(self, prompt: str, system_instruction: Optional[str] = None) -> Tuple[str, int, int]:
        # Models to try in order if 503 high demand occurs
        models_to_try: List[str] = [self.model_name]
        if "3.6" in self.model_name:
            models_to_try.append("gemini-3.5-flash")
        elif "3.5" in self.model_name:
            models_to_try.append("gemini-3.6-flash")

        last_error_text = ""
        max_attempts_per_model = 3

        for model in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.4,
                    "responseMimeType": "application/json"
                }
            }
            if system_instruction:
                payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

            for attempt in range(max_attempts_per_model):
                try:
                    resp = requests.post(url, json=payload, timeout=90)
                    
                    if resp.status_code in [503, 429, 500]:
                        wait_sec = (attempt + 1) * 3
                        logger.warning(
                            f"Gemini {model} returned HTTP {resp.status_code} (Demand spike). "
                            f"Retrying in {wait_sec}s (attempt {attempt + 1}/{max_attempts_per_model})..."
                        )
                        time.sleep(wait_sec)
                        last_error_text = resp.text
                        continue

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

                except (requests.exceptions.RequestException, requests.exceptions.Timeout) as e:
                    logger.warning(f"Network error contacting Gemini ({e}). Retrying in 2s...")
                    time.sleep(2)
                    last_error_text = str(e)

        raise RuntimeError(f"Gemini API error (503): All retry attempts and fallback models exhausted. Last error: {last_error_text}")
