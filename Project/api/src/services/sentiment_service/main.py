from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import logging
from typing import Optional
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="PortfolioPulse Sentiment Service",
    description="Financial sentiment analysis using FinBERT",
    version="1.0.0"
)

# Enable CORS for Node.js backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response models
class SentimentRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000, description="Text to analyze")

class SentimentResponse(BaseModel):
    sentiment: float = Field(..., ge=-1.0, le=1.0, description="Sentiment score (-1 to +1)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model confidence")
    label: str = Field(..., description="Sentiment label (positive/neutral/negative)")
    processing_time: float = Field(..., description="Processing time in seconds")

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    version: str

# Global model variables (loaded on startup)
model = None
tokenizer = None
model_name = "ProsusAI/finbert"

@app.on_event("startup")
async def load_model():
    """
    Load FinBERT model on startup
    This ensures model is ready before accepting requests
    """
    global model, tokenizer
    
    try:
        logger.info(f"Loading FinBERT model: {model_name}")
        start_time = time.time()
        
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSequenceClassification.from_pretrained(model_name)
        
        # Set model to evaluation mode
        model.eval()
        
        load_time = time.time() - start_time
        logger.info(f"✓ Model loaded successfully in {load_time:.2f}s")
        
    except Exception as e:
        logger.error(f"Failed to load model: {str(e)}")
        raise RuntimeError(f"Model initialization failed: {str(e)}")

@app.get("/", response_model=dict)
async def root():
    """Root endpoint - service info"""
    return {
        "service": "PortfolioPulse Sentiment Analysis",
        "model": model_name,
        "status": "running",
        "endpoints": {
            "analyze": "/analyze (POST)",
            "health": "/health (GET)"
        }
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint for monitoring
    Used by Node.js backend to verify service availability
    """
    return HealthResponse(
        status="healthy" if model is not None else "unhealthy",
        model_loaded=model is not None,
        version="1.0.0"
    )

@app.post("/analyze", response_model=SentimentResponse)
async def analyze_sentiment(request: SentimentRequest):
    """
    Analyzes sentiment of financial text using FinBERT
    
    Returns:
        - sentiment: float between -1 (negative) and +1 (positive)
        - confidence: model's confidence in prediction (0-1)
        - label: human-readable label
    """
    if model is None or tokenizer is None:
        raise HTTPException(
            status_code=503, 
            detail="Model not loaded. Service is initializing."
        )
    
    try:
        start_time = time.time()
        
        # Tokenize input text
        inputs = tokenizer(
            request.text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True
        )
        
        # Run inference
        with torch.no_grad():
            outputs = model(**inputs)
            predictions = torch.nn.functional.softmax(outputs.logits, dim=-1)
        
        # FinBERT outputs: [negative, neutral, positive]
        scores = predictions[0].tolist()
        
        # Map to -1 to +1 scale
        # negative=0, neutral=1, positive=2
        sentiment_score = (scores[2] - scores[0])  # positive - negative
        confidence = max(scores)  # Highest probability
        
        # Determine label
        max_idx = scores.index(max(scores))
        labels = ["negative", "neutral", "positive"]
        label = labels[max_idx]
        
        processing_time = time.time() - start_time
        
        logger.info(f"Analyzed text (length: {len(request.text)}): {label} ({sentiment_score:.3f})")
        
        return SentimentResponse(
            sentiment=round(sentiment_score, 3),
            confidence=round(confidence, 3),
            label=label,
            processing_time=round(processing_time, 4)
        )
        
    except Exception as e:
        logger.error(f"Sentiment analysis error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}"
        )

@app.post("/batch-analyze")
async def batch_analyze_sentiment(texts: list[str]):
    """
    Analyzes sentiment for multiple texts in a single request
    More efficient than individual calls
    """
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if len(texts) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 texts per batch")
    
    try:
        results = []
        
        for text in texts:
            if not text or len(text.strip()) == 0:
                results.append({"sentiment": 0.0, "label": "neutral", "confidence": 0.0})
                continue
            
            # Reuse single analysis logic
            response = await analyze_sentiment(SentimentRequest(text=text))
            results.append({
                "sentiment": response.sentiment,
                "label": response.label,
                "confidence": response.confidence
            })
        
        return {"results": results, "count": len(results)}
        
    except Exception as e:
        logger.error(f"Batch analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    
    # Run with: python main.py
    # Or: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )