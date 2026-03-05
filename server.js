const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

app.get('/check', (req, res) => {
  res.json({ status: 'working', groqKey: process.env.GROQ_API_KEY ? 'SET' : 'MISSING' });
});

app.post('/analyze', async (req, res) => {
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
          content: 'You are a code quality engineer. Analyze code and respond with ONLY valid JSON. No markdown. No extra text.\n\nJSON:\n{"score":<0-100>,"bugs":<n>,"security":<n>,"style":<n>,"performance":<n>,"summary":"<text>","issues":[{"severity":"<critical|error|warning|info|good>","category":"<Bug|Security|Style|Performance>","line":<n>,"title":"<text>","detail":"<text>"}]}\n\nMax 15 issues. Sort critical first. Include 1-3 good items.'
        },
        {
          role: 'user',
          content: 'Language: ' + (language||'javascript') + '\n\nCode:\n' + code
        }
      ]
    });

    const raw = completion.choices[0].message.content || '';
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

    const systemPrompt = 'You are a world-class ' + language + ' developer and security expert. Your job is to take buggy code and rewrite it to be PERFECT scoring 95-100/100 on a code quality analyzer.\n\nYou MUST fix ALL of these:\n1. BUGS - off-by-one errors, null pointer, array out of bounds, wrong logic\n2. SECURITY - SQL injection (use prepared statements), input validation, sanitization\n3. ERROR HANDLING - never use unwrap() without handling, always handle exceptions\n4. NAMING - use clear descriptive names, no single letter variables except loop counters\n5. STYLE - proper indentation, comments, docstrings, follow language conventions\n6. PERFORMANCE - avoid unnecessary loops, use efficient data structures\n7. BEST PRACTICES - follow SOLID principles, proper structure, main function if needed\n\nReturn ONLY the fully fixed production-ready code. No markdown fences. No explanation. No comments about what changed. Just perfect clean code that scores 95+.';

    // First pass - fix all issues
    const pass1 = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Fix this ' + language + ' code to score 95-100/100:\n' + code }
      ]
    });

    let enhanced = pass1.choices[0].message.content || code;
    enhanced = enhanced.replace(/^```[\w]*\n?/gm, '').replace(/^```$/gm, '').trim();

    // Second pass - make it even better
    const pass2 = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'This code needs to score 95-100/100. Review it one more time and fix any remaining issues:\n' + enhanced }
      ]
    });

    let final = pass2.choices[0].message.content || enhanced;
    final = final.replace(/^```[\w]*\n?/gm, '').replace(/^```$/gm, '').trim();

    return res.json({ enhanced: final });

  } catch (e) {
    console.error('Enhance error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Running on port ' + PORT);
  console.log('Groq key: ' + (process.env.GROQ_API_KEY ? 'SET' : 'MISSING'));
});