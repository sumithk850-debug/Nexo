require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: MODEL, team: 'Nexo Mind Team' });
});

// ─── Normal Mode Chat (Streaming) ─────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are Nexo AI, a powerful intelligent assistant created by the Nexo Mind Team. 
You are knowledgeable, articulate, and helpful. You provide clear, accurate, and thoughtful responses. 
You support markdown formatting including code blocks with language tags. Be concise but thorough.
Always respond in the same language the user writes in.`
        },
        ...messages
      ],
      stream: true,
      max_tokens: 4096,
      temperature: 0.7
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Chat error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// ─── Creative Mode: Generate Files ────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are Nexo AI Creative Engine, an elite autonomous full-stack developer created by the Nexo Mind Team.

When given a prompt to build something, respond ONLY with a valid JSON object (no markdown, no explanation, no backticks) with this exact structure:
{
  "analysis": "Brief description of what you are building",
  "appName": "Short name for the app",
  "files": [
    {
      "filename": "index.html",
      "language": "html",
      "content": "COMPLETE FILE CONTENT - no placeholders, no TODOs, no ellipsis"
    }
  ]
}

STRICT RULES:
- All files must be 100% complete and functional
- App must work standalone in a browser with no server
- Use only vanilla HTML/CSS/JS or CDN libraries (include CDN links in HTML)
- UI must be visually premium with dark theme
- All interactive elements must work perfectly
- Inject this exact script at the very top of <body> in index.html:
  <script>window.onerror=function(m,s,l){window.parent&&window.parent.postMessage({type:'NEXO_ERROR',error:m+' (line '+l+')'},'*')};window.addEventListener('unhandledrejection',function(e){window.parent&&window.parent.postMessage({type:'NEXO_ERROR',error:(e.reason&&e.reason.message)||'Unhandled rejection'},'*')});</script>
- Output ONLY the raw JSON object`
        },
        { role: 'user', content: `Build this: ${prompt}` }
      ],
      max_tokens: 8000,
      temperature: 0.4
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    let parsed;
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse AI response', raw });
    }

    res.json(parsed);
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Creative Mode: Review & Fix Code ─────────────────────────────────────────
app.post('/api/review', async (req, res) => {
  const { files } = req.body;
  if (!files) return res.status(400).json({ error: 'files required' });

  try {
    const filesText = files.map(f => `=== ${f.filename} ===\n${f.content}`).join('\n\n');

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a senior code reviewer for Nexo AI. Review the given files for bugs, errors, missing logic, broken references, or incomplete implementations.

Respond ONLY with a raw JSON object (no markdown, no backticks):
{
  "hasIssues": true/false,
  "issues": ["description of issue 1", "description of issue 2"],
  "fixedFiles": [{ "filename": "...", "language": "...", "content": "COMPLETE FIXED CONTENT" }]
}

If no issues found: { "hasIssues": false, "issues": [], "fixedFiles": null }
Output ONLY the raw JSON.`
        },
        { role: 'user', content: `Review these files:\n\n${filesText}` }
      ],
      max_tokens: 8000,
      temperature: 0.2
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    let parsed;
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.json({ hasIssues: false, issues: [], fixedFiles: null });
    }

    res.json(parsed);
  } catch (err) {
    console.error('Review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Creative Mode: Fix Runtime Error ─────────────────────────────────────────
app.post('/api/fix', async (req, res) => {
  const { files, error } = req.body;
  if (!files || !error) return res.status(400).json({ error: 'files and error required' });

  try {
    const filesText = files.map(f => `=== ${f.filename} ===\n${f.content}`).join('\n\n');

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are an expert debugger for Nexo AI. Fix the runtime error in the given files.

Respond ONLY with a raw JSON object (no markdown, no backticks):
{
  "fixDescription": "What was wrong and what was fixed",
  "files": [{ "filename": "...", "language": "...", "content": "COMPLETE FIXED CONTENT" }]
}

All files must be complete. Output ONLY the raw JSON.`
        },
        {
          role: 'user',
          content: `Runtime error: "${error}"\n\nFiles:\n${filesText}`
        }
      ],
      max_tokens: 8000,
      temperature: 0.2
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    let parsed;
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse fix response' });
    }

    res.json(parsed);
  } catch (err) {
    console.error('Fix error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Fallback ─────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Nexo AI server running on port ${PORT}`);
  console.log(`🤖 Model: ${MODEL}`);
  console.log(`🔑 API Key: ${process.env.GROQ_API_KEY ? '✅ Loaded' : '❌ Missing!'}`);
});
