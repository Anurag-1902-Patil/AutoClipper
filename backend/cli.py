import sys
import argparse
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.services.ingest_service import fetch_metadata, download_video, extract_video_id
from backend.app.services.transcript_service import get_transcript
from backend.app.services.clip_finder import find_clips
from backend.app.llm.factory import get_llm_provider
from backend.app.core.cost_tracker import CostTracker

from backend.app.services.video_processor import render_clip_mp4
from backend.app.models.schemas import CandidateClip
from backend.app.services.subtitle_generator import BUILTIN_PRESETS

def run_cut(
    url: str,
    start_time: float,
    end_time: float,
    hook_text: str = "WATCH THIS MOMENT",
    preset_id: str = "hormozi",
    framing: str = "auto_face"
):
    print(f"\n==========================================")
    print(f"[Milestone 3] Video Processing & Subtitles")
    print(f"==========================================")
    print(f"[*] Processing Video: {url}")
    print(f"[*] Interval:         {start_time:.2f}s -> {end_time:.2f}s (Duration: {end_time - start_time:.2f}s)")
    print(f"[*] Subtitle Preset:  {preset_id}")
    print(f"[*] Framing Mode:     {framing}")
    print(f"[*] Hook Text:        \"{hook_text}\"")

    video_id = extract_video_id(url)
    video_file = download_video(url)
    transcript = get_transcript(video_id)

    clip = CandidateClip(
        clip_index=1,
        start_time=start_time,
        end_time=end_time,
        duration=round(end_time - start_time, 2),
        hook_text=hook_text,
        hook_strategy="bold_claim",
        virality_score=90,
        reasoning="Manual cut test",
        topic="General",
        summary="Test clip"
    )

    preset = BUILTIN_PRESETS.get(preset_id, BUILTIN_PRESETS["hormozi"])
    output_mp4 = Path("storage/output") / f"test_clip_{video_id}_{int(start_time)}.mp4"

    print("\n[*] Rendering vertical 9:16 (1080x1920) clip with FFmpeg + libass...")
    rendered = render_clip_mp4(
        source_video_path=video_file,
        clip=clip,
        words=transcript.words,
        output_path=output_mp4,
        preset=preset,
        framing_mode=framing,
        enable_hook_overlay=True,
        enable_loudnorm=True
    )

    size_mb = rendered.stat().st_size / (1024 * 1024)
    print(f"\n[OK] Video successfully rendered!")
    print(f"     Path: {rendered}")
    print(f"     Size: {size_mb:.2f} MB")
    print(f"\n[SUCCESS] Milestone 3 Cutting + Vertical Crop + Auto Subtitles completed!\n")

from backend.app.services.seo_service import generate_clip_seo

def run_seo(
    url: str,
    start_time: float,
    end_time: float,
    hook_text: str = "WATCH THIS MOMENT",
    provider_name: str = "gemini"
):
    print(f"\n==========================================")
    print(f"[Milestone 4] SEO & Social Metadata")
    print(f"==========================================")
    print(f"[*] Processing Video: {url}")
    print(f"[*] Interval:         {start_time:.2f}s -> {end_time:.2f}s")
    print(f"[*] LLM Provider:     {provider_name}")

    video_id = extract_video_id(url)
    transcript = get_transcript(video_id)

    clip = CandidateClip(
        clip_index=1,
        start_time=start_time,
        end_time=end_time,
        duration=round(end_time - start_time, 2),
        hook_text=hook_text,
        hook_strategy="curiosity_gap",
        virality_score=90,
        reasoning="SEO test",
        topic="Educational",
        summary="Clip highlight"
    )

    llm = get_llm_provider(provider_name=provider_name)
    cost_tracker = CostTracker(provider=provider_name)

    print("\n[*] Generating YouTube Shorts & Instagram Reels metadata...")
    seo = generate_clip_seo(clip, transcript.words, llm, cost_tracker)

    print("\n[+] YouTube Shorts Metadata:")
    print(f"    Title:       {seo.yt_title}")
    print(f"    Description: {seo.yt_description}")
    print(f"    Hashtags:    {' '.join(seo.yt_hashtags)}")
    print(f"    Tags:        {', '.join(seo.yt_tags)}")

    print("\n[+] Instagram Reels Metadata:")
    print(f"    Caption:\n{seo.ig_caption}")
    print(f"    Hashtags:    {' '.join(seo.ig_hashtags)}")

    print("\n[+] Publishing Hints:")
    print(f"    Thumbnail Frame:     {seo.thumbnail_timestamp:.2f}s (relative to clip)")
    print(f"    Best Time to Post:   {seo.best_time_to_post}")

    usage = cost_tracker.get_summary()
    print(f"\nCost: ${usage['estimated_cost_usd']:.5f} ({usage['total_tokens']} tokens)")
    print(f"\n[SUCCESS] Milestone 4 SEO generation completed successfully!\n")

def run_discover(url: str, provider_name: str = "gemini"):
    print(f"\n==========================================")
    print(f"[Milestone 2] LLM Clip Discovery Pipeline")
    print(f"==========================================")
    print(f"[*] Processing URL: {url}")
    print(f"[*] LLM Provider:   {provider_name}")
    
    video_id = extract_video_id(url)
    meta = fetch_metadata(url)
    print(f"[+] Video: {meta.title} ({meta.duration:.1f}s)")
    
    transcript = get_transcript(video_id)
    print(f"[+] Loaded transcript ({len(transcript.words)} words, {len(transcript.sentences)} sentences)")
    
    llm = get_llm_provider(provider_name=provider_name)
    cost_tracker = CostTracker(provider=provider_name)
    
    print("\n[*] Running 2-Pass Viral Clip Discovery (Discovery + Critic)...")
    clips = find_clips(
        metadata=meta,
        transcript=transcript,
        llm=llm,
        cost_tracker=cost_tracker,
        target_count=5,
        min_duration=10.0,
        max_duration=60.0
    )
    
    print(f"\n[+] Discovered {len(clips)} Curated Viral Clips:")
    for c in clips:
        print(f"\n--------------------------------------------------")
        print(f"  Clip #{c.clip_index}: [{c.start_time:.1f}s -> {c.end_time:.1f}s] (Duration: {c.duration:.1f}s)")
        print(f"  Virality Score: {c.virality_score}/100 | Strategy: {c.hook_strategy}")
        print(f"  Hook Text:      \"{c.hook_text}\"")
        print(f"  Topic:          {c.topic}")
        print(f"  Summary:        {c.summary}")
        print(f"  Reasoning:      {c.reasoning}")
        if c.reorder_cold_open:
            print(f"  Cold Open:      \"{c.cold_open_text}\"")

    usage = cost_tracker.get_summary()
    print(f"\n==========================================")
    print(f"Token & Cost Summary:")
    print(f"  Input Tokens:       {usage['input_tokens']}")
    print(f"  Output Tokens:      {usage['output_tokens']}")
    print(f"  Total Tokens:       {usage['total_tokens']}")
    print(f"  Estimated Cost USD: ${usage['estimated_cost_usd']:.5f}")
    print(f"==========================================")
    print(f"\n[SUCCESS] Milestone 2 Clip Discovery completed successfully!\n")

def run_ingest(url: str):
    print(f"\n==========================================")
    print(f"[Milestone 1] Ingest & Transcript Pipeline")
    print(f"==========================================")
    print(f"[*] Processing URL: {url}")
    
    video_id = extract_video_id(url)
    print(f"[+] Extracted Video ID: {video_id}")
    
    print("[*] Step 1: Fetching video metadata...")
    meta = fetch_metadata(url)
    print(f"    Title:    {meta.title}")
    print(f"    Channel:  {meta.channel}")
    print(f"    Duration: {meta.duration:.1f}s ({int(meta.duration // 60)}m {int(meta.duration % 60)}s)")
    print(f"    Chapters: {len(meta.chapters)} detected")
    
    print("\n[*] Step 2: Downloading / Checking cache for video...")
    video_file = download_video(url)
    size_mb = video_file.stat().st_size / (1024 * 1024)
    print(f"    [OK] Video ready at: {video_file} ({size_mb:.2f} MB)")
    
    print("\n[*] Step 3: Extracting transcript with word-level timestamps...")
    transcript = get_transcript(video_id)
    print(f"    [OK] Transcript extracted!")
    print(f"    Total words:     {len(transcript.words)}")
    print(f"    Total sentences: {len(transcript.sentences)}")
    
    print("\n[*] Sample Word-Level Timestamps (First 10 words):")
    for i, w in enumerate(transcript.words[:10]):
        print(f"    [{w.start:6.2f}s -> {w.end:6.2f}s] {w.word}")
        
    print("\n[*] Sample Sentence Groupings (First 2 sentences):")
    for i, s in enumerate(transcript.sentences[:2]):
        print(f"    ({s.start:5.2f}s - {s.end:5.2f}s): \"{s.text}\"")
        
    print("\n[SUCCESS] Milestone 1 Ingest + Transcript CLI completed successfully!\n")

def main():
    parser = argparse.ArgumentParser(description="AI Video Clipper CLI")
    subparsers = parser.add_subparsers(dest="command")
    
    ingest_parser = subparsers.add_parser("ingest", help="Ingest a YouTube video and extract transcript")
    ingest_parser.add_argument("url", help="YouTube video URL or Video ID")
    
    discover_parser = subparsers.add_parser("discover", help="Discover viral clips from transcript using LLM")
    discover_parser.add_argument("url", help="YouTube video URL or Video ID")
    discover_parser.add_argument("--provider", default="gemini", choices=["gemini", "anthropic", "openai"], help="LLM Provider")

    cut_parser = subparsers.add_parser("cut", help="Cut a clip, vertical-crop and burn animated subtitles")
    cut_parser.add_argument("url", help="YouTube video URL or Video ID")
    cut_parser.add_argument("--start", type=float, default=1.0, help="Start time in seconds")
    cut_parser.add_argument("--end", type=float, default=12.0, help="End time in seconds")
    cut_parser.add_argument("--hook", type=str, default="THE CRAZIEST THING HERE", help="Hook text overlay")
    cut_parser.add_argument("--preset", default="hormozi", choices=list(BUILTIN_PRESETS.keys()), help="Subtitle style preset")
    cut_parser.add_argument("--framing", default="auto_face", choices=["auto_face", "center", "blur_bg"], help="Framing mode")

    seo_parser = subparsers.add_parser("seo", help="Generate SEO metadata for a clip")
    seo_parser.add_argument("url", help="YouTube video URL or Video ID")
    seo_parser.add_argument("--start", type=float, default=1.0, help="Start time in seconds")
    seo_parser.add_argument("--end", type=float, default=10.0, help="End time in seconds")
    seo_parser.add_argument("--hook", type=str, default="WHY THIS HAPPENED", help="Hook text")
    seo_parser.add_argument("--provider", default="gemini", choices=["gemini", "anthropic", "openai"], help="LLM Provider")

    args = parser.parse_args()
    if args.command == "ingest":
        run_ingest(args.url)
    elif args.command == "discover":
        run_discover(args.url, provider_name=args.provider)
    elif args.command == "cut":
        run_cut(args.url, start_time=args.start, end_time=args.end, hook_text=args.hook, preset_id=args.preset, framing=args.framing)
    elif args.command == "seo":
        run_seo(args.url, start_time=args.start, end_time=args.end, hook_text=args.hook, provider_name=args.provider)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
