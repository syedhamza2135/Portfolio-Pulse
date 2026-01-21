"""
Portfolio Pulse Sentiment Analysis Service

This FastAPI service provides AI-powered sentiment analysis for financial news
using the FinBERT model (ProsusAI/finbert). It processes news articles and
returns sentiment scores ranging from -1 (negative) to +1 (positive).

Features:
- Single article analysis
- Batch article processing
- Rate limiting
- Health monitoring
- GPU acceleration (if available)

@module main
@requires fastapi
@requires transformers
@requires torch
"""

import time
import torch
import logging
import asyncio

from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from pydantic import BaseModel, Field, field_validator
from transformers import AutoTokenizer, AutoModelForSequenceClassification

# ============================================================================
# Configuration & Logging
# ============================================================================

# Configure structured logging for production
# In production, consider using JSON formatter for log aggregation
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# FinBERT model - Pre-trained on financial news
# Provides sentiment analysis specifically tuned for financial text
MODEL_NAME = "ProsusAI/finbert"

# Device selection: Use GPU if available for faster inference
# Falls back to CPU if CUDA is not available
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ============================================================================
# Global State Management
# ============================================================================

class ModelState:
    """
    Global state container for the sentiment analysis model.
    
    This class holds the loaded model and tokenizer to avoid reloading
    on every request. The model is loaded once during application startup
    and reused for all inference requests.
    
    Attributes:
        tokenizer: HuggingFace tokenizer for text preprocessing
        model: FinBERT model for sentiment classification
        startup_time: Timestamp when the service started (for uptime tracking)
    """
    tokenizer: Any = None
    model: Any = None
    startup_time: Optional[float] = None

# Global state instance
state = ModelState()

# ============================================================================
# Application Lifespan Management
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages application startup and shutdown lifecycle.
    
    Startup:
    - Loads FinBERT model and tokenizer
    - Runs model loading in background thread to avoid blocking
    - Sets model to evaluation mode (no training)
    
    Shutdown:
    - Cleans up thread pool
    - Clears GPU memory cache (if using CUDA)
    
    Args:
        app: FastAPI application instance
        
    Yields:
        None (control returns to FastAPI)
        
    Raises:
        RuntimeError: If model loading fails (critical error)
    """
    state.startup_time = time.time()
    
    # Load model in background thread to avoid blocking startup
    # This allows the service to start quickly while model loads
    loop = asyncio.get_event_loop()
    executor = ThreadPoolExecutor(max_workers=1)
    
    try:
        logger.info(f"Loading {MODEL_NAME} on {DEVICE}...")
        
        def load_model():
            """
            Internal function to load model synchronously.
            Runs in thread pool to avoid blocking event loop.
            """
            # Load tokenizer (fast version for better performance)
            tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, use_fast=True)
            
            # Load model and move to appropriate device (GPU/CPU)
            model = AutoModelForSequenceClassification.from_pretrained(
                MODEL_NAME,
                low_cpu_mem_usage=True
                ).to(DEVICE)
            
            # Warm up with dummy input to precompile
            dummy_input = tokenizer("test", return_tensors="pt").to(DEVICE)
            with torch.no_grad():
                _ = model(**dummy_input)

            # Set to evaluation mode (disables dropout, batch norm updates)
            model.eval()
            
            return tokenizer, model
        
        # Run model loading in thread pool to prevent blocking
        state.tokenizer, state.model = await loop.run_in_executor(
            executor, load_model
        )
        
        logger.info("✓ Model loaded successfully")
    except Exception as e:
        logger.error(f"❌ Critical failure during startup: {e}")
        # Re-raise as RuntimeError to prevent service from starting with broken model
        raise RuntimeError(e)
    
    # Application is ready - yield control to FastAPI
    yield
    
    # Cleanup on shutdown
    executor.shutdown(wait=True)
    
    # Clear GPU memory cache if using CUDA
    # Prevents memory leaks in containerized environments
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        logger.info("GPU memory cache cleared")

# ============================================================================
# FastAPI Application Setup
# ============================================================================

# Create FastAPI application with lifespan management
app = FastAPI(
    title="PortfolioPulse Sentiment",
    description="AI-powered sentiment analysis service for financial news",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Configuration
# PRODUCTION NOTE: Replace "*" with specific origins for security
# Example: allow_origins=["https://api.portfoliopulse.com"]
# @todo Implement CORS whitelist in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Rate Limiting Configuration
# ============================================================================

# Initialize rate limiter using client IP address as key
# This prevents abuse while allowing legitimate usage
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

async def rate_limit_handler(request: Request, exc: Exception):
    """
    Custom handler for rate limit exceeded errors.
    
    Returns a user-friendly error message when rate limit is exceeded.
    This is more informative than the default slowapi response.
    
    Args:
        request: FastAPI request object
        exc: RateLimitExceeded exception
        
    Returns:
        JSONResponse with 429 status and error message
    """
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please try again later."},
    )

# Register rate limit exception handler
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
# ============================================================================
# Request/Response Schemas
# ============================================================================

class SentimentRequest(BaseModel):
    """
    Request schema for single article sentiment analysis.
    
    Attributes:
        text: Article text to analyze (1-2000 characters)
        
    Validation:
        - Text cannot be empty or whitespace only
        - Rejects inputs with excessive repetition (potential spam)
        - Rejects inputs with invalid UTF-8 encoding
    """
    text: str = Field(..., min_length=1, max_length=2000)

    @field_validator('text')
    @classmethod
    def validate_text(cls, v: str):
        """
        Validates input text to prevent abuse and ensure quality.
        
        Checks:
        1. Text is not empty after stripping whitespace
        2. Text has sufficient character diversity (prevents spam)
        3. Text has valid UTF-8 encoding
        
        Args:
            v: Input text string
            
        Returns:
            Validated and stripped text
            
        Raises:
            ValueError: If validation fails
        """
        if not v.strip():
            raise ValueError('Text cannot be empty')
        
        # Strip whitespace
        v = v.strip()
        
        # Reject pathological inputs (e.g., "AAAAA..." spam)
        # Less than 5% unique characters indicates likely spam
        if len(set(v)) < len(v) / 20:
            raise ValueError('Text contains excessive repetition')
        
        # Check for suspicious Unicode patterns
        # Normal text should not have >4x byte expansion
        if len(v.encode('utf-8')) > len(v) * 4:
            raise ValueError('Text contains invalid encoding')
        
        return v

class SentimentResponse(BaseModel):
    """
    Response schema for sentiment analysis results.
    
    Attributes:
        sentiment: Sentiment score (-1 to +1, where +1 is most positive)
        confidence: Model confidence in prediction (0 to 1)
        label: Human-readable label ("positive", "negative", "neutral")
        processing_time: Time taken for inference in seconds
    """
    sentiment: float
    confidence: float
    label: str
    processing_time: float

class BatchSentimentRequest(BaseModel):
    """
    Request schema for batch sentiment analysis.
    
    Attributes:
        texts: List of texts to analyze (max 50 per request)
        
    Note:
        Batch processing is more efficient than individual requests
        but limited to 50 items to prevent timeout issues.
    """
    texts: List[str] = Field(..., max_length=50)

# ============================================================================
# Utility Functions
# ============================================================================

def get_prediction_details(probs: torch.Tensor):
    id2label = state.model.config.id2label

    results = []
    for score in probs.detach().cpu().tolist():
        max_idx = score.index(max(score))
        label = id2label[max_idx].lower()

        positive = score[list(id2label.values()).index("positive")]
        negative = score[list(id2label.values()).index("negative")]

        sentiment_score = positive - negative

        results.append({
            "sentiment": round(sentiment_score, 3),
            "confidence": round(max(score), 3),
            "label": label
        })

    return results

# ============================================================================
# API Endpoints
# ============================================================================

@app.post("/analyze", response_model=SentimentResponse)
@limiter.limit("30/minute")  # Rate limit: 30 requests per minute per IP
async def analyze(request: Request, sentiment_request: SentimentRequest):
    """
    Analyzes sentiment of a single text/article.
    
    This endpoint processes one article at a time and returns:
    - Sentiment score (-1 to +1)
    - Confidence level (0 to 1)
    - Human-readable label
    - Processing time
    
    Args:
        request: FastAPI request object (for rate limiting)
        sentiment_request: SentimentRequest containing text to analyze
        
    Returns:
        SentimentResponse with analysis results
        
    Raises:
        HTTPException 503: If model is not loaded yet
        HTTPException 400: If text is too large
        HTTPException 500: If inference fails
        HTTPException 429: If rate limit exceeded
    """
    # Check if model is loaded
    if state.tokenizer is None or state.model is None:
        raise HTTPException(
            status_code=503, 
            detail="Model is loading. Please try again in a moment."
        )

    start_time = time.time()
    try:
        # Additional size check after encoding
        # Prevents memory issues with very large inputs
        text_bytes = sentiment_request.text.encode('utf-8')
        if len(text_bytes) > 8000:  # 8KB max
            raise HTTPException(
                status_code=400, 
                detail="Text too large after encoding (max 8KB)"
            )
        
        # Tokenize input text
        # - return_tensors="pt": Returns PyTorch tensors
        # - truncation=True: Truncates to max_length if needed
        # - max_length=512: FinBERT's maximum sequence length
        # - padding=False: No padding needed for single inference
        inputs = state.tokenizer(
            sentiment_request.text, 
            return_tensors="pt", 
            truncation=True, 
            max_length=512,
            padding=False
        ).to(DEVICE)

        # Run inference
        # torch.no_grad() disables gradient computation (faster, less memory)
        with torch.no_grad():
            outputs = state.model(**inputs)
            # Apply softmax to get probabilities
            probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
        
        # Extract prediction details
        prediction = get_prediction_details(probs)[0]
        prediction["processing_time"] = round(time.time() - start_time, 4)
        
        return prediction

    except HTTPException:
        # Re-raise HTTP exceptions (they're already properly formatted)
        raise
    except Exception as e:
        # Log error for debugging
        logger.error(f"Inference error: {e}", exc_info=True)
        # Return generic error to avoid exposing internal details
        raise HTTPException(
            status_code=500, 
            detail="Analysis failed. Please try again later."
        )

@app.post("/batch-analyze")
async def batch_analyze(request: BatchSentimentRequest):
    """
    Analyzes sentiment for multiple texts/articles in a single request.
    
    This endpoint is more efficient than multiple single requests because:
    - Model processes all texts in one batch
    - Reduces overhead from multiple API calls
    - Better GPU utilization (if available)
    
    Args:
        request: BatchSentimentRequest containing list of texts (max 50)
        
    Returns:
        Dictionary with:
        - results: List of sentiment analysis results
        - count: Number of texts analyzed
        - processing_time: Total processing time in seconds
        
    Raises:
        HTTPException 503: If model is not loaded yet
        HTTPException 500: If batch inference fails
    """
    # Check if model is loaded
    if state.tokenizer is None or state.model is None:
        raise HTTPException(
            status_code=503, 
            detail="Model is loading. Please try again in a moment."
        )
    
    start_time = time.time()
    try:
        # Tokenize all texts together
        # padding=True: Pads shorter sequences to match longest
        # This is required for batch processing
        inputs = state.tokenizer(
            request.texts, 
            return_tensors="pt", 
            padding=True,  # Padding required for batch
            truncation=True, 
            max_length=512
        ).to(DEVICE)

        # Run batch inference
        with torch.no_grad():
            outputs = state.model(**inputs)
            probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
        
        # Extract predictions for all items
        results = get_prediction_details(probs)
        
        return {
            "results": results,
            "count": len(results),
            "processing_time": round(time.time() - start_time, 3)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch inference error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail="Batch analysis failed. Please try again later."
        )

@app.get("/health")
async def health():
    """
    Health check endpoint for monitoring and load balancers.
    
    Returns service status, model information, and system metrics.
    This endpoint is used by:
    - Kubernetes liveness/readiness probes
    - Monitoring systems (Prometheus, etc.)
    - Load balancers for health checks
    
    Returns:
        Dictionary containing:
        - status: "healthy" or "initializing"
        - model_loaded: Whether model is ready for inference
        - model_name: Name of the loaded model
        - device: Computing device (CPU or CUDA)
        - uptime_seconds: Service uptime in seconds
        - uptime_formatted: Human-readable uptime
        - memory_usage_mb: GPU memory usage (if using CUDA)
        - timestamp: Current Unix timestamp
    """
    # Calculate uptime
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

# ============================================================================
# Application Entry Point
# ============================================================================

if __name__ == "__main__":
    """
    Development server entry point.
    
    For production, use a proper ASGI server like:
    - uvicorn with multiple workers
    - gunicorn with uvicorn workers
    - Docker with proper process management
    
    Example production command:
    uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
    """
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)