const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

app.get('/api/test', (req, res) => {
  res.json({
    status: 'server is working',
    groqKey: process.env.GROQ_API_KEY ? 'SET OK' : 'MISSING - add in Render Environment',
    time: new Date().toISOString()
  });
});

app.post('/api/analyze', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { code, language } = req.body;
    if (!code || !code.trim()) return res.status(400).json({ error: 'No code provided' });
    if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });

    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 2048,
      messages: [
        {
          role: 'system',
          content: 'You are an expert code quality engineer. Analyze code for bugs, security issues, style problems, and performance issues. Respond with ONLY valid JSON, no markdown, no extra text.\n\nJSON structure:\n{\n  "score": <0-100>,\n  "bugs": <count>,\n  "security": <count>,\n  "style": <count>,\n  "performance": <count>,\n  "summary": "<one sentence>",\n  "issues": [\n    {\n      "severity": "<critical|error|warning|info|good>",\n      "category": "<Bug|Security|Style|Performance|Logic|Best Practice>",\n      "line": <number or null>,\n      "title": "<short title>",\n      "detail": "<explanation and fix>"\n    }\n  ]\n}\nRules: find real issues, include 1-3 good items, sort critical first, max 15 issues.'
        },
        {
          role: 'user',
          content: 'Language: ' + (language || 'javascript') + '\n\nCode:\n```' + (language || 'javascript') + '\n' + code + '\n```'
        }
      ]
    });

    const raw = completion.choices[0].message.content || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    return res.json(result);

  } catch (error) {
    console.error('Analyze error:', error.message);
    return res.status(500).json({ error: error.message || 'Analysis failed' });
  }
});

app.post('/api/enhance', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { code, language } = req.body;
    if (!code || !code.trim()) return res.status(400).json({ error: 'No code provided' });
    if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });

    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 4096,
      messages: [
        {
          role: 'system',
          content: 'You are an expert developer. Fix ALL bugs, security issues, style problems and performance issues. Return ONLY the fixed code with no markdown fences and no explanation.'
        },
        {
          role: 'user',
          content: 'Fix this ' + language + ' code:\n```' + language + '\n' + code + '\n```'
        }
      ]
    });

    let enhanced = completion.choices[0].message.content || code;
    enhanced = enhanced.replace(/^```[\w]*\n?/gm, '').replace(/^```$/gm, '').trim();
    return res.json({ enhanced });

  } catch (error) {
    console.error('Enhance error:', error.message);
    return res.status(500).json({ error: error.message || 'Enhancement failed' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('CodePiolet running on port ' + PORT);
  console.log('Groq key: ' + (process.env.GROQ_API_KEY ? 'SET OK' : 'MISSING'));
});