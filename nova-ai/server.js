require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));
const chatLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Çok fazla istek gönderdin. Bir dakika sonra tekrar dene.' } });
app.post('/api/chat', chatLimiter, async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'Sunucu API anahtarı ayarlanmamış. GEMINI_API_KEY değişkenini kontrol et.' });
  const incoming = req.body?.messages;
  if (!Array.isArray(incoming) || incoming.length === 0) return res.status(400).json({ error: 'Mesaj bulunamadı.' });
  const messages = incoming.slice(-16).map(m => ({
    role: m?.role === 'assistant' || m?.role === 'model' ? 'model' : 'user',
    parts: [{ text: String(m?.content ?? m?.parts?.[0]?.text ?? '').slice(0, 4000) }]
  })).filter(m => m.parts[0].text.trim());
  if (!messages.length || messages[messages.length - 1].role !== 'user') return res.status(400).json({ error: 'Son mesaj kullanıcı mesajı olmalı.' });
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'Sen NOVA AI adlı yardımsever ve dürüst bir Türkçe yapay zekâ asistanısın. Kullanıcı hangi dilde yazarsa o dilde yanıt ver. Bilmediğin bilgileri uydurma; belirsizliği açıkça söyle. Yanıtları anlaşılır ve düzenli biçimde yaz.' }] },
        contents: messages,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Gemini API status:', response.status, data?.error?.message || 'provider error');
      if (response.status === 429) return res.status(429).json({ error: 'Yapay zekâ kullanım kotası dolmuş olabilir. Biraz sonra tekrar dene.' });
      return res.status(502).json({ error: 'Yapay zekâ servisi yanıt veremedi. API anahtarını, model erişimini ve kotayı kontrol et.' });
    }
    const reply = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    if (!reply) return res.status(502).json({ error: 'Yapay zekâ boş yanıt verdi. Tekrar deneyebilirsin.' });
    res.json({ reply });
  } catch (err) {
    console.error('Request failed:', err.message);
    res.status(502).json({ error: 'Bağlantı hatası. Biraz sonra tekrar dene.' });
  }
});
app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`NOVA AI http://localhost:${PORT} adresinde çalışıyor.`));
