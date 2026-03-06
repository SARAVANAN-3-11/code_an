const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Model fallback chain - auto switches if one hits rate limit
const MODELS = ['llama-3.3-70b-versatile','llama-3.1-8b-instant','gemma2-9b-it','qwen-qwq-32b'];

async function callGroq(messages, maxTokens) {
  for (const model of MODELS) {
    try {
      console.log('Trying model:', model);
      const res = await groq.chat.completions.create({
        model,
        temperature: 0.1,
        max_tokens: maxTokens || 2048,
        messages
      });
      console.log('Success with model:', model);
      return res.choices[0].message.content || '';
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('rate') || msg.includes('limit') || msg.includes('quota') || msg.includes('token') || e.status === 429) {
        console.log('Model', model, 'rate limited, trying next...');
        continue;
      }
      throw e;
    }
  }
  throw new Error('All models are currently rate limited. Please wait a few minutes and try again.');
}

app.get('/check', (req, res) => {
  res.json({ status: 'working', groqKey: process.env.GROQ_API_KEY ? 'SET' : 'MISSING', models: MODELS });
});

app.post('/analyze', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { code, language } = req.body;
    if (!code || !code.trim()) return res.status(400).json({ error: 'No code provided' });
    if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });

    const raw = await callGroq([
      {
        role: 'system',
        content: 'You are a code quality engineer. Analyze code and respond with ONLY valid JSON. No markdown. No extra text.\n\nJSON:\n{"score":<0-100>,"bugs":<n>,"security":<n>,"style":<n>,"performance":<n>,"summary":"<text>","issues":[{"severity":"<critical|error|warning|info|good>","category":"<Bug|Security|Style|Performance>","line":<n or null>,"title":"<text>","detail":"<text>"}]}\n\nMax 15 issues. Sort critical first. Include 1-3 good items.'
      },
      {
        role: 'user',
        content: 'Language: ' + (language || 'python') + '\n\nCode:\n' + code
      }
    ], 2048);

    const clean = raw.replace(/```json|```/g, '').trim();
    return res.json(JSON.parse(clean));

  } catch (e) {
    console.error('Analyze error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/enhance', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { code, language } = req.body;
    if (!code || !code.trim()) return res.status(400).json({ error: 'No code provided' });
    if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });

    const systemPrompt = 'You are a world-class ' + language + ' developer. Rewrite the code to be PERFECT scoring 95-100/100. Fix ALL: bugs, SQL injection (use prepared statements), error handling, variable naming, documentation, performance, best practices. Return ONLY the fixed code. No markdown. No explanation.';

    // Pass 1
    let enhanced = await callGroq([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Fix this ' + language + ' code to score 95-100:\n' + code }
    ], 4096);
    enhanced = enhanced.replace(/^```[\w]*\n?/gm, '').replace(/^```$/gm, '').trim();

    // Pass 2
    let final = await callGroq([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Review and perfect this ' + language + ' code one more time:\n' + enhanced }
    ], 4096);
    final = final.replace(/^```[\w]*\n?/gm, '').replace(/^```$/gm, '').trim();

    return res.json({ enhanced: final });

  } catch (e) {
    console.error('Enhance error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Running on port ' + PORT);
  console.log('Groq key: ' + (process.env.GROQ_API_KEY ? 'SET' : 'MISSING'));
  console.log('Models:', MODELS.join(', '));
});

