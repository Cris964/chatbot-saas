require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "mi_token_secreto";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const BOT_PROMPT = process.env.BOT_PROMPT || "Eres un asistente de atención al cliente amable y útil. Responde siempre en español de forma concisa.";

// ✅ Verificación del webhook (Meta lo llama una sola vez)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado correctamente');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 📩 Recibir mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') return res.sendStatus(404);

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message || message.type !== 'text') return res.sendStatus(200);

    const userMessage = message.text.body;
    const userPhone = message.from;

    console.log(`📩 Mensaje de ${userPhone}: ${userMessage}`);

    // 🤖 Llamar a la IA via OpenRouter
    const aiResponse = await getAIResponse(userMessage);

    // 📤 Responder al usuario por WhatsApp
    await sendWhatsAppMessage(userPhone, aiResponse);

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.sendStatus(500);
  }
});

// 🤖 Función: llamar a OpenRouter (Claude o GPT)
async function getAIResponse(userMessage) {
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'openai/gpt-3.5-turbo', // Puedes cambiarlo a anthropic/claude-3-haiku
      messages: [
        { role: 'system', content: BOT_PROMPT },
        { role: 'user', content: userMessage }
      ]
    },
    {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.choices[0].message.content;
}

// 📤 Función: enviar mensaje por WhatsApp
async function sendWhatsAppMessage(to, message) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: message }
    },
    {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

// 🏥 Health check
app.get('/', (req, res) => res.send('🤖 ChatBot SaaS funcionando!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
```

Commit ✅

---

### ARCHIVO 3: `.env.example`

Nuevo archivo llamado `.env.example`:
```
VERIFY_TOKEN=mi_token_secreto
WHATSAPP_TOKEN=tu_token_de_meta_aqui
PHONE_NUMBER_ID=1074951269024593
OPENROUTER_API_KEY=tu_api_key_de_openrouter
BOT_PROMPT=Eres un asistente amable. Responde siempre en español.
PORT=3000
```

Commit ✅

---

Cuando tengas los 3 archivos creados tu repo debe verse así:
```
📁 chatbot-saas
  📄 README.md
  📄 package.json
  📄 index.js
  📄 .env.example
