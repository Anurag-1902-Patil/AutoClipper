import re
import json
import logging
from abc import ABC, abstractmethod
from typing import Type, TypeVar, Tuple, Dict, Any, Optional
from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger("clipper.llm")

def clean_json_text(text: str) -> str:
    """Extract valid JSON from raw LLM output even if surrounded by markdown fences or notes."""
    text = text.strip()
    
    # Strip markdown backticks
    if "```json" in text:
        parts = text.split("```json")
        if len(parts) > 1:
            text = parts[1].split("```")[0].strip()
    elif "```" in text:
        parts = text.split("```")
        if len(parts) > 1:
            text = parts[1].split("```")[0].strip()

    # Find first { and last }
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        text = text[first_brace:last_brace + 1]

    # Remove trailing commas before closing braces/brackets
    text = re.sub(r',\s*([}\]])', r'\1', text)
    return text

class LLMProvider(ABC):
    def __init__(self, model_name: str):
        self.model_name = model_name

    @abstractmethod
    def _call_api(self, prompt: str, system_instruction: Optional[str] = None) -> Tuple[str, int, int]:
        """
        Executes low-level LLM call.
        Returns: (raw_response_text, prompt_tokens, completion_tokens)
        """
        pass

    def generate_structured(
        self,
        prompt: str,
        schema_class: Type[T],
        system_instruction: Optional[str] = None,
        max_retries: int = 2
    ) -> Tuple[T, Dict[str, Any]]:
        """
        Calls LLM and parses structured JSON output into a validated Pydantic model.
        Automatically retries with error feedback on failure.
        """
        current_prompt = prompt
        last_error = None
        total_prompt_tokens = 0
        total_completion_tokens = 0

        for attempt in range(max_retries + 1):
            raw_text, p_tok, c_tok = self._call_api(current_prompt, system_instruction)
            total_prompt_tokens += p_tok
            total_completion_tokens += c_tok

            try:
                cleaned = clean_json_text(raw_text)
                data = json.loads(cleaned)
                parsed = schema_class.model_validate(data)
                
                usage = {
                    "prompt_tokens": total_prompt_tokens,
                    "completion_tokens": total_completion_tokens,
                    "model": self.model_name,
                    "attempts": attempt + 1
                }
                return parsed, usage

            except (json.JSONDecodeError, ValidationError) as e:
                last_error = e
                logger.warning(f"LLM parse attempt {attempt + 1} failed: {e}. Retrying...")
                current_prompt = (
                    f"{prompt}\n\n"
                    f"IMPORTANT: Your previous output resulted in an error:\n{str(e)}\n"
                    f"Please output ONLY valid, parsable JSON matching the schema without markdown comments."
                )

        raise RuntimeError(f"Failed to generate valid structured output after {max_retries + 1} attempts. Last error: {last_error}")
