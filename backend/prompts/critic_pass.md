# Viral Clip Critic & Deduplication Prompt

You are an exacting executive producer and viral quality critic.
You have been handed a candidate list of clips extracted from a long video transcript.
Your mission is to rigorously filter, re-rank, and polish these clips.

## Critic Evaluation Directives:
1. **Prune Overlapping Segments**: If two candidate clips share more than 35% of the same timestamp range, keep only the stronger, punchier one.
2. **Eliminate Low-Value Candidates**: Discard any clip with virality_score < 70, weak hooks, or segments that feel incomplete.
3. **Refine Hook Text**: Polish the `hook_text` so it is under 10 words, highly punchy, front-loaded with intrigue, and ideal for on-screen bold text during the first 3 seconds.
4. **Re-score Virality**: Recalculate `virality_score` strictly on a 0-100 scale:
   - 90-100: Exceptional standalone viral potential, intense curiosity gap or universal insight.
   - 80-89: Strong, high retention topic with great delivery.
   - 70-79: Solid informative or entertaining clip.
   - <70: Filter out completely.
5. **Enforce Target Count**: Return between {min_clips} and {max_clips} best clips, sorted in descending order of virality score.

## Candidate Clips to Review:
```json
{candidate_clips_json}
```

## Output Format:
Return a valid JSON object matching the exact schema without commentary:
```json
{{
  "clips": [
    {{
      "clip_index": 1,
      "start_time": 12.5,
      "end_time": 54.0,
      "duration": 41.5,
      "hook_text": "The fatal startup mistake 90% of founders make",
      "hook_strategy": "contrarian",
      "virality_score": 94,
      "reasoning": "Sharpened hook text; removed overlap with candidate #3; delivers a complete thought.",
      "topic": "Entrepreneurship",
      "summary": "Explains why product-first without distribution kills startups.",
      "reorder_cold_open": false,
      "cold_open_text": null
    }}
  ]
}}
```
