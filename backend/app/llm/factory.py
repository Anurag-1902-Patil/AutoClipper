from typing import Optional
from backend.app.config import settings
from backend.app.llm.base import LLMProvider
from backend.app.llm.gemini_provider import GeminiProvider
from backend.app.llm.anthropic_provider import AnthropicProvider
from backend.app.llm.openai_provider import OpenAIProvider

def get_llm_provider(
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
    model_name: Optional[str] = None
) -> LLMProvider:
    """
    Factory to instantiate the desired LLM provider (Gemini, Claude, or OpenAI).
    Falls back to settings/.env defaults.
    """
    name = (provider_name or settings.LLM_PROVIDER or "gemini").lower()

    if name in ["gemini", "google"]:
        model = model_name or settings.GEMINI_MODEL
        return GeminiProvider(api_key=api_key or settings.GEMINI_API_KEY, model_name=model)
    elif name in ["anthropic", "claude"]:
        model = model_name or settings.ANTHROPIC_MODEL
        return AnthropicProvider(api_key=api_key or settings.ANTHROPIC_API_KEY, model_name=model)
    elif name in ["openai", "chatgpt"]:
        model = model_name or settings.OPENAI_MODEL
        return OpenAIProvider(api_key=api_key or settings.OPENAI_API_KEY, model_name=model)
    else:
        raise ValueError(f"Unsupported LLM provider: {provider_name}. Choose from 'gemini', 'anthropic', 'openai'.")
