#!/bin/bash
# PortfolioPulse Development Setup Script

set -e

echo "╔═══════════════════════════════════════════════════════╗"
echo "║     PortfolioPulse - Development Environment Setup    ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 20+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "⚠ Node.js version $NODE_VERSION detected. Version 20+ recommended."
fi

echo "✓ Node.js $(node -v) detected"

# Check Python
if ! command -v python &> /dev/null && ! command -v python3 &> /dev/null; then
    echo "❌ Python not found. Please install Python 3.8+ first."
    exit 1
fi

PYTHON_CMD=$(command -v python3 || command -v python)
echo "✓ Python $($PYTHON_CMD --version) detected"

# Check MongoDB
if ! command -v mongod &> /dev/null; then
    echo "⚠ MongoDB not found locally. Using MongoDB Atlas is recommended."
else
    echo "✓ MongoDB detected"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Setting up API (Node.js backend)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd api

# Install Node dependencies
echo "Installing Node.js dependencies..."
npm install

# Create .env from example
if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "⚠ IMPORTANT: Edit api/.env and add your API keys!"
else
    echo "✓ .env file already exists"
fi

cd ..

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Setting up Sentiment Service (Python)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd sentiment_service

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    $PYTHON_CMD -m venv venv
fi

# Activate and install dependencies
echo "Installing Python dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Pre-download model
echo "Pre-downloading FinBERT model (this may take a few minutes)..."
$PYTHON_CMD -c "from transformers import AutoTokenizer, AutoModelForSequenceClassification; AutoTokenizer.from_pretrained('ProsusAI/finbert'); AutoModelForSequenceClassification.from_pretrained('ProsusAI/finbert')"

deactivate
cd ..

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║                  ✓ Setup Complete!                    ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""
echo "Next Steps:"
echo "1. Edit api/.env with your API keys:"
echo "   - MONGO_URI (MongoDB Atlas or local)"
echo "   - ALPHA_VANTAGE_API_KEY (get from alphavantage.co)"
echo "   - NEWSAPI_KEY (get from newsapi.org)"
echo "   - SENDGRID_API_KEY (optional, for email alerts)"
echo ""
echo "2. Start the services:"
echo "   Terminal 1: cd sentiment_service && ./start.sh"
echo "   Terminal 2: cd api && npm run dev"
echo ""
echo "3. Test the API:"
echo "   curl http://localhost:5000/api/health"
echo ""