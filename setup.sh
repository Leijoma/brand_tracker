#!/bin/bash

echo "🚀 Setting up BrandTracker..."

# Backend setup
echo ""
echo "📦 Setting up backend..."
cd backend

if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing Python dependencies..."
pip install -r requirements.txt

if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo ""
    echo "⚠️  IMPORTANT: Edit backend/.env and add your ANTHROPIC_API_KEY"
    echo ""
fi

cd ..

# Frontend setup
echo ""
echo "🎨 Setting up frontend..."
cd frontend

if [ ! -d "node_modules" ]; then
    echo "Installing Node.js dependencies..."
    npm install
fi

if [ ! -f ".env.local" ]; then
    echo "Creating .env.local file..."
    cp .env.local.example .env.local
fi

cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Add your ANTHROPIC_API_KEY to backend/.env"
echo "2. Start the backend: cd backend && source venv/bin/activate && uvicorn main:app --reload"
echo "3. Start the frontend: cd frontend && npm run dev"
echo "4. Open http://localhost:3000 in your browser"
echo ""
