"""
YouTube Comment Sentiment Analyzer — FastAPI Backend
Google Cloud: Google AI Studio (Gemini) | Firestore | BigQuery | Cloud Storage
"""

import os
import json
import uuid
import csv
import io
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import httpx
import google.generativeai as genai
from google.cloud import firestore, bigquery, storage

# ── Config ────────────────────────────────────────────────────────────────────
GCP_PROJECT  = os.environ["GCP_PROJECT"]
YT_API_KEY   = os.environ["YOUTUBE_API_KEY"]
GEMINI_KEY   = os.environ["GEMINI_API_KEY"]
GCS_BUCKET   = os.environ["GCS_BUCKET"]
BQ_DATASET   = os.environ.get("BQ_DATASET", "yt_sentiment")
BQ_TABLE     = os.environ.get("BQ_TABLE",   "comment_analysis")
MAX_COMMENTS = int(os.environ.get("MAX_COMMENTS_CAP", "50"))

# ── Gemini (Google AI Studio) ─────────────────────────────────────────────────
genai.configure(api_key=GEMINI_KEY)
gemini = genai.GenerativeModel("gemini-2.0-flash")

# ── GCP Clients ───────────────────────────────────────────────────────────────
db        = firestore.Client(project=GCP_PROJECT)
bq_client = bigquery.Client(project=GCP_PROJECT)
gcs       = storage.Client(project=GCP_PROJECT)

app = FastAPI(title="YT Sentiment Analyzer")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)


# ── Pydantic Models ───────────────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    youtube_url: str
    max_comments: int = 20


class ExportRequest(BaseModel):
    session_id: str
    format: str = "json"


# ── Helpers ───────────────────────────────────────────────────────────────────
def extract_video_id(url: str) -> Optional[str]:
    import re
    patterns = [
        r"(?:v=)([A-Za-z0-9_-]{11})",
        r"youtu\.be/([A-Za-z0-9_-]{11})",
        r"embed/([A-Za-z0-9_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


async def fetch_video_info(video_id: str) -> dict:
    url = (
        f"https://www.googleapis.com/youtube/v3/videos"
        f"?part=snippet,statistics&id={video_id}&key={YT_API_KEY}"
    )
    async with httpx.AsyncClient() as client:
        r = await client.get(url, timeout=10)
    data = r.json()
    if "error" in data:
        raise HTTPException(400, data["error"].get("message", "YouTube API error"))
    items = data.get("items", [])
    if not items:
        raise HTTPException(404, "Video not found")
    v = items[0]
    return {
        "video_id":     video_id,
        "title":        v["snippet"]["title"],
        "channel":      v["snippet"]["channelTitle"],
        "thumbnail":    v["snippet"]["thumbnails"].get("medium", {}).get("url"),
        "view_count":   int(v["statistics"].get("viewCount",   0)),
        "like_count":   int(v["statistics"].get("likeCount",   0)),
        "comment_count":int(v["statistics"].get("commentCount",0)),
    }


async def fetch_comments(video_id: str, max_results: int) -> list[dict]:
    url = (
        f"https://www.googleapis.com/youtube/v3/commentThreads"
        f"?part=snippet&videoId={video_id}"
        f"&maxResults={min(max_results, MAX_COMMENTS)}"
        f"&order=relevance&key={YT_API_KEY}"
    )
    async with httpx.AsyncClient() as client:
        r = await client.get(url, timeout=15)
    data = r.json()
    if "error" in data:
        raise HTTPException(400, data["error"].get("message", "Failed to fetch comments"))
    results = []
    for item in data.get("items", []):
        snip = item["snippet"]["topLevelComment"]["snippet"]
        results.append({
            "text":        snip.get("textDisplay", "").replace("<br>", " "),
            "author":      snip.get("authorDisplayName", ""),
            "likes":       snip.get("likeCount", 0),
            "reply_count": item["snippet"].get("totalReplyCount", 0),
            "published_at":snip.get("publishedAt", ""),
        })
    return results


def analyze_with_gemini(comments: list[dict]) -> list[dict]:
    numbered = "\n".join(
        f'{i+1}. "{c["text"][:300].replace(chr(34), chr(39))}"'
        for i, c in enumerate(comments)
    )
    prompt = f"""You are a YouTube comment sentiment analyzer.
Analyze each comment and return ONLY a valid JSON array.
No markdown, no backticks, no explanation — just the raw JSON array.

For each comment return these exact fields:
- "sentiment": "positive" or "neutral" or "negative"
- "score": a float between 0.0 and 1.0 for confidence
- "topics": array of 1 to 3 short keyword strings
- "reply_suggestion": a polite professional YouTube creator reply
- "content_improvement": one specific actionable improvement tip
- "engagement_tip": one tip to convert this commenter into a loyal fan

Comments to analyze:
{numbered}

Return ONLY the JSON array, nothing else."""

    response = gemini.generate_content(prompt)
    raw = response.text.strip()
    # Strip markdown code fences if present
    raw = raw.replace("```json", "").replace("```", "").strip()
    parsed = json.loads(raw)
    return [
        {
            **parsed[i],
            "author":       c["author"],
            "likes":        c["likes"],
            "reply_count":  c["reply_count"],
            "original_text":c["text"],
            "published_at": c["published_at"],
        }
        for i, c in enumerate(comments)
        if i < len(parsed)
    ]


def save_to_firestore(session_id: str, video_info: dict, results: list[dict]):
    counts = {"positive": 0, "neutral": 0, "negative": 0}
    for r in results:
        s = r.get("sentiment", "neutral")
        counts[s] = counts.get(s, 0) + 1
    db.collection("sentiment_sessions").document(session_id).set({
        "session_id": session_id,
        "created_at": datetime.now(timezone.utc),
        "video_info": video_info,
        "total":      len(results),
        "counts":     counts,
        "results":    results,
    })


def save_to_bigquery(session_id: str, video_info: dict, results: list[dict]):
    table_ref = f"{GCP_PROJECT}.{BQ_DATASET}.{BQ_TABLE}"
    rows = [{
        "session_id":          session_id,
        "analyzed_at":         datetime.now(timezone.utc).isoformat(),
        "video_id":            video_info["video_id"],
        "video_title":         video_info["title"],
        "channel":             video_info["channel"],
        "comment_text":        r.get("original_text", ""),
        "author":              r.get("author", ""),
        "likes":               r.get("likes", 0),
        "reply_count":         r.get("reply_count", 0),
        "sentiment":           r.get("sentiment", ""),
        "confidence_score":    r.get("score", 0.0),
        "topics":              json.dumps(r.get("topics", [])),
        "reply_suggestion":    r.get("reply_suggestion", ""),
        "content_improvement": r.get("content_improvement", ""),
        "engagement_tip":      r.get("engagement_tip", ""),
    } for r in results]
    errors = bq_client.insert_rows_json(table_ref, rows)
    if errors:
        print(f"[BQ] Insert errors: {errors}")


def upload_to_gcs(session_id: str, video_info: dict, results: list[dict], fmt: str) -> str:
    bucket = gcs.bucket(GCS_BUCKET)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"reports/{session_id}/{timestamp}.{fmt}"

    if fmt == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            "author", "likes", "reply_count", "sentiment", "score",
            "topics", "original_text", "reply_suggestion",
            "content_improvement", "engagement_tip",
        ])
        writer.writeheader()
        for r in results:
            writer.writerow({
                "author":             r.get("author", ""),
                "likes":              r.get("likes", 0),
                "reply_count":        r.get("reply_count", 0),
                "sentiment":          r.get("sentiment", ""),
                "score":              r.get("score", 0),
                "topics":             ", ".join(r.get("topics", [])),
                "original_text":      r.get("original_text", ""),
                "reply_suggestion":   r.get("reply_suggestion", ""),
                "content_improvement":r.get("content_improvement", ""),
                "engagement_tip":     r.get("engagement_tip", ""),
            })
        content = output.getvalue().encode()
        content_type = "text/csv"
    else:
        payload = {"session_id": session_id, "video_info": video_info, "results": results}
        content = json.dumps(payload, indent=2, default=str).encode()
        content_type = "application/json"

    blob = bucket.blob(filename)
    blob.upload_from_string(content, content_type=content_type)
    blob.make_public()
    return blob.public_url


# ── API Routes ────────────────────────────────────────────────────────────────
@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    video_id = extract_video_id(req.youtube_url)
    if not video_id:
        raise HTTPException(400, "Invalid YouTube URL")
    video_info = await fetch_video_info(video_id)
    comments   = await fetch_comments(video_id, req.max_comments)
    if not comments:
        raise HTTPException(404, "No comments found for this video")
    results    = analyze_with_gemini(comments)
    session_id = str(uuid.uuid4())
    save_to_firestore(session_id, video_info, results)
    save_to_bigquery(session_id, video_info, results)
    return {"session_id": session_id, "video_info": video_info, "results": results}


@app.get("/api/history")
async def get_history(limit: int = 10):
    docs = (
        db.collection("sentiment_sessions")
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    sessions = []
    for doc in docs:
        d = doc.to_dict()
        sessions.append({
            "session_id":  d["session_id"],
            "created_at":  d["created_at"].isoformat() if hasattr(d["created_at"], "isoformat") else str(d["created_at"]),
            "video_title": d["video_info"]["title"],
            "channel":     d["video_info"]["channel"],
            "thumbnail":   d["video_info"].get("thumbnail"),
            "total":       d["total"],
            "counts":      d["counts"],
        })
    return {"sessions": sessions}


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    doc = db.collection("sentiment_sessions").document(session_id).get()
    if not doc.exists:
        raise HTTPException(404, "Session not found")
    d = doc.to_dict()
    d["created_at"] = d["created_at"].isoformat() if hasattr(d["created_at"], "isoformat") else str(d["created_at"])
    return d


@app.post("/api/export")
async def export(req: ExportRequest):
    doc = db.collection("sentiment_sessions").document(req.session_id).get()
    if not doc.exists:
        raise HTTPException(404, "Session not found")
    d   = doc.to_dict()
    url = upload_to_gcs(req.session_id, d["video_info"], d["results"], req.format)
    return {"url": url, "format": req.format}


@app.get("/api/health")
async def health():
    return {"status": "ok", "model": "gemini-2.0-flash", "project": GCP_PROJECT}


# Serve React frontend
if os.path.exists("/app/frontend/dist"):
    app.mount("/", StaticFiles(directory="/app/frontend/dist", html=True), name="frontend")
