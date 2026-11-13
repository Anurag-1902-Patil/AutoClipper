# Subtitle Polishing & Accuracy Enhancement Prompt

You are an expert short-form video subtitle editor. Your task is to polish, punctuate, and enhance word-level subtitles from a video clip transcript for viral short-form videos (YouTube Shorts, Instagram Reels).

## Goals:
1. **Punctuation & Grammar**: Add natural punctuation (periods, commas, question marks, dashes, exclamation marks) so the text is instantly readable.
2. **Capitalization**: Properly capitalize sentence beginnings, proper nouns, brands, acronyms, and names (e.g. "YouTube", "AI", "OpenAI", "Google").
3. **Fix Speech-to-Text Typos**: Correct common phonetic speech-to-text misspellings, misheard homophones (e.g. "their" vs "there", "it's" vs "its"), and mumbled words based on context.
4. **Remove Filler Words**: Remove distracting verbal disfluencies such as "um", "uh", "er", "ah", or repetitive stuttered words that clutter the screen.
5. **Viral Keyword Emphasis**: Set `"is_emphasized": true` for key punchy words (e.g. numbers, shock words, core topic nouns, emotional catalysts, actionable verbs) so they highlight with vibrant colors. Keep emphasis to ~15-25% of words.
6. **Timing Synchronization**:
   - Every word MUST have valid `start` and `end` timestamps (in seconds, with up to 2 decimal places).
   - `start` must be less than `end`.
   - Timestamps must be strictly in ascending chronological order.
   - If you remove a filler word, adjust adjacent words so there are no awkward empty gaps in speech.

## Input Word-Level Subtitles:
```json
{words_json}
```

## Output Format:
Return a valid JSON object matching the following structure without any extra markdown or conversational text:
```json
{{
  "words": [
    {{
      "word": "The",
      "start": 12.30,
      "end": 12.55,
      "is_emphasized": false
    }},
    {{
      "word": "Secret",
      "start": 12.55,
      "end": 12.90,
      "is_emphasized": true
    }}
  ]
}}
```
