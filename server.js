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
  res.json({ status: 'working', groqKey: process.env.GROQ_API_KEY ? 'SET' : 'MISSING' });
});
app.post('/api/analyze', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { code, language } = req.body;
    if (!code || !code.trim()) return res.status(400).json({ error: 'No code provided' });
    if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });
    const completion = await groq.chat.completions.create({
      model: MODEL, temperature: 0.1, max_tokens: 2048,
      messages: [
        { role: 'system', content: 'You are a code quality engineer. Analyze code and respond with ONLY valid JSON. No markdown. No extra text.\n\nJSON:\n{"score":<0-100>,"bugs":<n>,"security":<n>,"style":<n>,"performance":<n>,"summary":"<text>","issues":[{"severity":"<critical|error|warning|info|good>","category":"<Bug|Security|Style|Performance>","line":<n>,"title":"<text>","detail":"<text>"}]}\n\nMax 15 issues. Sort critical first. Include 1-3 good items.' },
        { role: 'user', content: 'Language: ' + (language||'javascript') + '\n\nCode:\n' + code }
      ]
    });
    const raw = completion.choices[0].message.content || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    return res.json(JSON.parse(clean));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});
app.post('/api/enhance', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { code, language } = req.body;
    if (!code || !code.trim()) return res.status(400).json({ error: 'No code provided' });
    if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });
    const completion = await groq.chat.completions.create({
      model: MODEL, temperature: 0.1, max_tokens: 4096,
      messages: [
        { role: 'system', content: 'Fix ALL bugs, security issues, style and performance problems. Return ONLY fixed code. No markdown. No explanation.' },
        { role: 'user', content: 'Fix this ' + language + ' code:\n' + code }
      ]
    });
    let enhanced = completion.choices[0].message.content || code;
    enhanced = enhanced.replace(/^```[\w]*\n?/gm, '').replace(/^```$/gm, '').trim();
    return res.json({ enhanced });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log('Running on port ' + PORT); });
