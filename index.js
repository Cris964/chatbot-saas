require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "mi_token_secreto";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const BOT_PROMPT = process.env.BOT_PROMPT || "Eres un asistente de atencion al cliente. Responde siempre en espanol.";

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

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

    console.log('Mensaje de ' + userPhone + ': ' + userMessage);

    const aiResponse = await getAIResponse(userMessage);
    await sendWhatsAppMessage(userPhone, aiResponse);

    res.sendStatus(200);
  } catch (error) {
    console.error('Error:', error.message);
    res.sendStatus(500);
  }
});

async function getAIResponse(userMessage) {
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'openai/gpt-3.5-turbo',
      messages: [
        { role: 'system', content: BOT_PROMPT },
        { role: 'user', content: userMessage }
      ]
    },
    {
      headers: {
        'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data.choices[0].message.content;
}

async function sendWhatsAppMessage(to, message) {
  await axios.post(
    'https://graph.facebook.com/v18.0/' + PHONE_NUMBER_ID + '/messages',
    {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: message }
    },
    {
      headers: {
        'Authorization': 'Bearer ' + WHATSAPP_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );
}

app.get('/', (req, res) => res.send('ChatBot SaaS funcionando!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor corriendo en puerto ' + PORT));
