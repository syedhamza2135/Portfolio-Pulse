import time
import torch
import logging
from typing import Any, Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from transformers import AutoTokenizer, AutoModelForSequenceClassification

# --- Configuration & Logging ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

MODEL_NAME = "ProsusAI/finbert"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# --- Global State Container ---
class ModelState:
    tokenizer: Any = None
    model: Any = None
    startup_time: Optional[float] = None

state = ModelState()

# --- Lifespan Management ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    state.startup_time = time.time()
    try:
        logger.info(f"Loading {MODEL_NAME} on {DEVICE}...")
        state.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, use_fast=True)
        state.model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME).to(DEVICE)
        state.model.eval()
        logger.info("✓ Model loaded successfully")
    except Exception as e:
        logger.error(f"❌ Critical failure during startup: {e}")
        raise RuntimeError(e)
    
    yield
    
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

app = FastAPI(title="PortfolioPulse Sentiment", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Schemas ---
class SentimentRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)

    @field_validator('text')
    @classmethod
    def validate_text(cls, v: str):
        if not v.strip():
            raise ValueError('Text cannot be empty')
        return v.strip()

class SentimentResponse(BaseModel):
    sentiment: float
    confidence: float
    label: str
    processing_time: float

class BatchSentimentRequest(BaseModel):
    texts: List[str] = Field(..., max_length=50)

# --- Utility Functions ---
def get_prediction_details(probs: torch.Tensor):
    """FinBERT specific mapping: 0:pos, 1:neg, 2:neu"""
    scores = probs.detach().cpu().tolist()
    labels = ["positive", "negative", "neutral"]
    
    results = []
    for score in scores:
        max_idx = score.index(max(score))
        # Positive score - Negative score
        sentiment_score = score[0] - score[1] 
        results.append({
            "sentiment": round(sentiment_score, 3),
            "confidence": round(max(score), 3),
            "label": labels[max_idx]
        })
    return results

# --- Endpoints ---
@app.post("/analyze", response_model=SentimentResponse)
async def analyze(request: SentimentRequest):
    if state.tokenizer is None or state.model is None:
        raise HTTPException(status_code=503, detail="Model is loading.")

    start_time = time.time()
    try:
        inputs = state.tokenizer(
            request.text, 
            return_tensors="pt", 
            truncation=True, 
            max_length=512
        ).to(DEVICE)

        with torch.no_grad():
            outputs = state.model(**inputs)
            probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
        
        prediction = get_prediction_details(probs)[0]
        prediction["processing_time"] = round(time.time() - start_time, 4)
        return prediction

    except Exception as e:
        logger.error(f"Inference error: {e}")
        raise HTTPException(status_code=500, detail="Analysis failed")

@app.post("/batch-analyze")
async def batch_analyze(request: BatchSentimentRequest):
    if state.tokenizer is None or state.model is None:
        raise HTTPException(status_code=503, detail="Model is loading.")
    
    start_time = time.time()
    try:
        inputs = state.tokenizer(
            request.texts, 
            return_tensors="pt", 
            padding=True, 
            truncation=True, 
            max_length=512
        ).to(DEVICE)

        with torch.no_grad():
            outputs = state.model(**inputs)
            probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
        
        results = get_prediction_details(probs)
        return {
            "results": results,
            "count": len(results),
            "processing_time": round(time.time() - start_time, 3)
        }
    except Exception as e:
        logger.error(f"Batch inference error: {e}")
        raise HTTPException(status_code=500, detail="Batch analysis failed")

@app.get("/health")
async def health():
    uptime = round(time.time() - state.startup_time, 2) if state.startup_time else 0
    
    return {
        "status": "healthy" if state.model else "initializing",
        "model_loaded": state.model is not None,
        "model_name": MODEL_NAME,
        "device": str(DEVICE),
        "uptime_seconds": uptime,
        "uptime_formatted": f"{uptime // 3600:.0f}h {(uptime % 3600) // 60:.0f}m",
        "memory_usage_mb": round(torch.cuda.memory_allocated() / 1024**2, 2) if torch.cuda.is_available() else 0,
        "timestamp": time.time()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)