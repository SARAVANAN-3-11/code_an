const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── GROQ client ──
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

// ── TEST ROUTE — open /api/test in browser to confirm deployment ──
app.get('/api/test', (req, res) => {
  res.json({
    status: 'server is working',
    groqKey: process.env.GROQ_API_KEY ? 'SET ✓' : 'MISSING ✗ — add in Render Environment',
    time: new Date().toISOString()
  });
});

// ── ANALYZE ──
app.post('/api/analyze', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { code, language } = req.body;
    if (!code || !code.trim()) return res.status(400).json({ error: 'No code provided' });
    if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set in Render Environment Variables' });

    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 2048,
      messages: [
        {
          role: 'system',
          content: `You are an expert code quality engineer. Analyze code deeply for bugs, security vulnerabilities, style issues, and performance problems.
You MUST respond with ONLY valid JSON — no markdown fences, no preamble, no text outside the JSON.

JSON structure:
{
  "score": <integer 0-100>,
  "bugs": <integer count>,
  "security": <integer count>,
  "style": <integer count>,
  "performance": <integer count>,
  "summary": <one sentence overall assessment>,
  "issues": [
    {
      "severity": <"critical"|"error"|"warning"|"info"|"good">,
      "category": <"Bug"|"Security"|"Style"|"Performance"|"Logic"|"Best Practice">,
      "line": <line number or null>,
      "title": <short title>,
      "detail": <one-sentence explanation with fix suggestion>
    }
  ]
}
Rules: find REAL issues, include 1-3 good items, sort critical first, max 15 issues.`
        },
        {
          role: 'user',
          content: `Language: ${language || 'javascript'}\n\nCode:\n\`\`\`${language || 'javascript'}\n${code}\n\`\`\``
        }
      ]
    });

    const raw = completion.choices[0]?.message?.content || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    return res.json(result);

  } catch (error) {
    console.error('Analyze error:', error.message);
    return res.status(500).json({ error: error.message || 'Analysis failed' });
  }
});

// ── ENHANCE ──
app.post('/api/enhance', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { code, language } = req.body;
    if (!code || !code.trim()) return res.status(400).json({ error: 'No code provided' });
    if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set in Render Environment Variables' });

    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 4096,
      messages: [
        {
          role: 'system',
          content: `You are an expert ${language} developer. Fix ALL bugs, security vulnerabilities, style issues, and performance problems. Return ONLY the fixed code — no markdown fences, no explanation. Just clean code.`
        },
        {
          role: 'user',
          content: `Fix this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\``
        }
      ]
    });

    let enhanced = completion.choices[0]?.message?.content || code;
    enhanced = enhanced.replace(/^```[\w]*\n?/gm, '').replace(/^```$/gm, '').trim();
    return res.json({ enhanced });

  } catch (error) {
    console.error('Enhance error:', error.message);
    return res.status(500).json({ error: error.message || 'Enhancement failed' });
  }
});

// ── STATIC FILES (after API routes) ──
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ CodePiolet running on port ${PORT}`);
  console.log(`🔑 Groq key: ${process.env.GROQ_API_KEY ? 'SET ✓' : 'MISSING ✗'}`);
});