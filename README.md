# 🚀 Nexo AI — by Nexo Mind Team

A dual-mode AI assistant with autonomous app generation. Built with Groq + Llama 4 Scout.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Add your Groq API Key**
   ```bash
   cp .env.example .env
   # Edit .env and add your GROQ_API_KEY
   ```

3. **Run**
   ```bash
   npm start
   # or for development:
   npm run dev
   ```

4. Open `http://localhost:3000`

## Deploy to Vercel

1. Push to GitHub
2. Import repo in Vercel
3. Add `GROQ_API_KEY` in Vercel Environment Variables
4. Deploy ✅

## Features

- **Normal Mode** — Streaming AI chat with markdown rendering
- **Creative Mode** — Autonomous 7-step app generation pipeline
- Live preview with iframe sandboxing
- Runtime error detection + auto-fix
- Checkpoint system with build history
- File viewer with syntax highlighting

---
*Powered by Nexo Mind Team · Groq + Llama 4 Scout*
