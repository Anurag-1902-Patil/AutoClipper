from typing import Dict, Any

# Estimated pricing per 1M tokens (USD)
RATES = {
    "gemini": {
        "input": 0.075,
        "output": 0.30,
    },
    "openai": {
        "input": 0.15,
        "output": 0.60,
    },
    "anthropic": {
        "input": 0.80,
        "output": 4.00,
    }
}

class CostTracker:
    def __init__(self, provider: str = "gemini"):
        self.provider = provider.lower()
        self.input_tokens = 0
        self.output_tokens = 0
        
    def add_usage(self, prompt_tokens: int, completion_tokens: int):
        self.input_tokens += prompt_tokens
        self.output_tokens += completion_tokens
        
    def get_estimated_cost_usd(self) -> float:
        rate = RATES.get(self.provider, RATES["gemini"])
        cost = (self.input_tokens / 1_000_000 * rate["input"]) + (self.output_tokens / 1_000_000 * rate["output"])
        return round(cost, 6)
        
    def get_summary(self) -> Dict[str, Any]:
        return {
            "provider": self.provider,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.input_tokens + self.output_tokens,
            "estimated_cost_usd": self.get_estimated_cost_usd()
        }
