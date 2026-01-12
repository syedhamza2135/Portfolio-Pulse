# PortfolioPulse Backend

AI-powered investment tracking platform with sentiment analysis, risk scoring, and real-time portfolio monitoring.

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+ ([Download](https://nodejs.org/))
- **Python** 3.8+ ([Download](https://www.python.org/downloads/))
- **MongoDB** (Local or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas))

### 1. Automated Setup (Recommended)

```bash
# Clone the repository
git clone <your-repo-url>
cd portfoliopulse

# Run setup script (Linux/Mac)
chmod +x setup.sh
./setup.sh

# Windows users: Run setup manually (see Manual Setup below)
```

### 2. Configure Environment Variables

Edit `api/.env`:

```env
# Required
MONGO_URI=mongodb://localhost:27017/portfoliopulse
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
NODE_ENV=development

# API Keys (get free keys from these services)
ALPHA_VANTAGE_API_KEY=your_key_here  # https://www.alphavantage.co/support/#api-key
NEWSAPI_KEY=your_key_here            # https://newsapi.org/register
SENDGRID_API_KEY=SG.xxxxx            # https://signup.sendgrid.com/ (optional)
```

### 3. Start Services

**Terminal 1 - Python Sentiment Service:**
```bash
cd sentiment_service
./start.sh  # or start.bat on Windows
```

**Terminal 2 - Node.js API:**
```bash
cd api
npm run dev
```

### 4. Test API

```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "services": {
    "database": { "status": "healthy" },
    "sentiment": { "status": "healthy" }
  }
}
```

---

## 📁 Project Structure

```
portfoliopulse/
├── api/                          # Node.js Backend
│   ├── src/
│   │   ├── controllers/          # Business logic
│   │   ├── models/               # MongoDB schemas
│   │   ├── routes/               # API endpoints
│   │   ├── services/             # Core services (prices, sentiment, risk)
│   │   ├── middleware/           # Auth, rate limiting
│   │   ├── graphql/              # GraphQL schema & resolvers
│   │   ├── jobs/                 # Cron jobs (price updates, alerts)
│   │   └── index.js              # Entry point
│   ├── .env.example
│   └── package.json
│
├── sentiment_service/            # Python AI Service
│   ├── main.py                   # FastAPI server
│   ├── requirements.txt
│   └── start.sh / start.bat
│
└── setup.sh                      # Automated setup script
```

---

## 🔌 API Endpoints

### Authentication
```
POST   /api/auth/register         # Create account
POST   /api/auth/login            # Get JWT token
POST   /api/auth/refresh          # Refresh access token
```

### Portfolios
```
GET    /api/portfolios            # List user's portfolios
POST   /api/portfolios            # Create portfolio
GET    /api/portfolios/:id        # Get portfolio details
PUT    /api/portfolios/:id        # Update portfolio
DELETE /api/portfolios/:id        # Delete portfolio
GET    /api/portfolios/stats      # Aggregate statistics
```

### Holdings
```
GET    /api/holdings?portfolioId= # List holdings
POST   /api/holdings              # Add holding
PUT    /api/holdings/:id          # Update holding
DELETE /api/holdings/:id          # Remove holding
```

### Prices
```
GET    /api/prices/ticker/:ticker           # Get current price
POST   /api/prices/holdings/:id/refresh     # Update holding price
POST   /api/prices/portfolios/:id/refresh   # Update all portfolio prices
```

### Sentiment Analysis
```
GET    /api/sentiment/:ticker                    # Ticker sentiment
GET    /api/sentiment/portfolio/:portfolioId     # Portfolio sentiment
POST   /api/sentiment/analyze                    # Batch analysis
```

### Risk Metrics
```
GET    /api/risk/portfolio/:portfolioId          # Risk score
POST   /api/risk/portfolio/:portfolioId/calculate
POST   /api/risk/portfolio/:portfolioId/simulate # What-if analysis
```

### GraphQL
```
POST   /graphql                   # GraphQL queries & mutations
```

### Health Check
```
GET    /api/health                # Full health status
GET    /api/health/readiness      # K8s readiness probe
GET    /api/health/liveness       # K8s liveness probe
```

---

## 🔧 Development Commands

```bash
# API (Node.js)
cd api
npm run dev           # Start with hot reload
npm test              # Run tests
npm run lint          # Check code quality
npm run lint:fix      # Auto-fix linting issues

# Sentiment Service (Python)
cd sentiment_service
python main.py        # Start service
```

---

## 🛠 Manual Setup (Windows / Troubleshooting)

### API Setup
```bash
cd api
npm install
cp .env.example .env
# Edit .env with your values
npm run dev
```

### Python Service Setup
```bash
cd sentiment_service

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Linux/Mac)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start service
python main.py
```

---

## 📊 Features

✅ **Multi-Asset Tracking**: Stocks, ETFs, and cryptocurrencies  
✅ **AI Sentiment Analysis**: FinBERT model for financial news  
✅ **Risk Scoring**: Volatility, concentration, sector exposure metrics  
✅ **Real-Time Prices**: Alpha Vantage & CoinGecko integration  
✅ **Email Alerts**: Portfolio threshold notifications  
✅ **GraphQL & REST**: Hybrid API architecture  
✅ **Background Jobs**: Automated price updates, risk calculations  

---

## 🔒 Security Features

- JWT authentication with refresh tokens
- Rate limiting (5 login attempts / 15 min)
- Password hashing (bcrypt with 12 rounds)
- MongoDB injection prevention
- CORS protection
- Helmet.js security headers

---

## 🐛 Troubleshooting

### MongoDB Connection Issues
```bash
# Check if MongoDB is running
mongosh  # Should connect to mongodb://localhost:27017

# If using Atlas, verify:
# 1. IP whitelist includes your IP (or 0.0.0.0/0 for dev)
# 2. Database user credentials are correct
```

### Python Service Not Starting
```bash
# Check Python version
python --version  # Should be 3.8+

# Reinstall dependencies
pip install --upgrade pip
pip install -r requirements.txt --force-reinstall
```

### Port Already in Use
```bash
# Find and kill process on port 5000 (API)
lsof -ti:5000 | xargs kill -9

# Find and kill process on port 8000 (Python)
lsof -ti:8000 | xargs kill -9
```

---

## 📝 Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGO_URI` | ✅ | - | MongoDB connection string |
| `JWT_SECRET` | ✅ | - | Min 32 chars random string |
| `NODE_ENV` | ✅ | development | development/production |
| `PORT` | ❌ | 5000 | API server port |
| `ALPHA_VANTAGE_API_KEY` | ⚠️ | - | Stock price API |
| `NEWSAPI_KEY` | ⚠️ | - | News articles API |
| `SENDGRID_API_KEY` | ❌ | - | Email alerts |
| `PYTHON_SENTIMENT_URL` | ❌ | http://localhost:8000 | Sentiment service URL |

⚠️ = Required for full functionality

---

## 📦 Deployment

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Use MongoDB Atlas (not local MongoDB)
- [ ] Generate strong JWT secret (32+ chars)
- [ ] Enable rate limiting
- [ ] Configure CORS for your domain
- [ ] Set up environment variables in hosting platform
- [ ] Enable HTTPS
- [ ] Configure database backups

### Recommended Hosting
- **API**: Railway, Render, Heroku
- **Database**: MongoDB Atlas (free M0 tier)
- **Python Service**: Railway (containerized deployment)

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🤝 Contributing

Contributions welcome! Please open an issue first to discuss changes.

---

## 📧 Support

For issues, please open a GitHub issue with:
- Error message
- Steps to reproduce
- Environment (OS, Node version, Python version)