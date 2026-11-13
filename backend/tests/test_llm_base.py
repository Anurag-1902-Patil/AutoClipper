import pytest
from pydantic import BaseModel
from backend.app.llm.base import clean_json_text

def test_clean_json_markdown():
    raw = "```json\n{\n  \"clips\": []\n}\n```"
    cleaned = clean_json_text(raw)
    assert cleaned == '{\n  "clips": []\n}'

def test_clean_json_trailing_comma():
    raw = '{"name": "test", "items": [1, 2, ], }'
    cleaned = clean_json_text(raw)
    assert cleaned == '{"name": "test", "items": [1, 2]}'
