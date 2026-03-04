require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "mi_token_secreto";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Verificacion del webhook
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

// Recibir mensajes
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return res.sendStatus(404);

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    const phoneNumberId = changes?.value?.metadata?.phone_number_id;

    if (!message || message.type !== 'text') return res.sendStatus(200);

    const userMessage = message.text.body;
    const userPhone = message.from;

    console.log('Mensaje de ' + userPhone + ': ' + userMessage);

    // Buscar cliente por su phone_number_id
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('phone_number_id', phoneNumberId)
      .eq('active', true)
      .single();

    if (error || !client) {
      console.log('Cliente no encontrado para phone_number_id: ' + phoneNumberId);
      return res.sendStatus(200);
    }

    // Obtener historial de conversacion
    const history = await getConversationHistory(client.id, userPhone);

    // Llamar a la IA con el prompt del cliente
    const aiResponse = await getAIResponse(client, userMessage, history);

    // Guardar el nuevo mensaje en el historial
    await saveMessage(client.id, userPhone, userMessage, aiResponse);

    // Responder por WhatsApp
    await sendWhatsAppMessage(userPhone, aiResponse, phoneNumberId, client.whatsapp_token);

    res.sendStatus(200);
  } catch (error) {
    console.error('Error:', error.message);
    res.sendStatus(500);
  }
});

// Obtener historial de conversacion
async function getConversationHistory(clientId, userPhone) {
  try {
    const { data } = await supabase
      .from('conversations')
      .select('messages')
      .eq('client_id', clientId)
      .eq('user_phone', userPhone)
      .maybeSingle();
    return data?.messages || [];
  } catch {
    return [];
  }
}

// Guardar mensaje en historial
async function saveMessage(clientId, userPhone, userMessage, aiResponse) {
  try {
    const { data: existing } = await supabase
      .from('conversations')
      .select('messages')
      .eq('client_id', clientId)
      .eq('user_phone', userPhone)
      .maybeSingle();

    const history = existing?.messages || [];
    const updated = [
      ...history,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: aiResponse }
    ].slice(-30);

    if (existing) {
      await supabase
        .from('conversations')
        .update({ messages: updated, updated_at: new Date().toISOString() })
        .eq('client_id', clientId)
        .eq('user_phone', userPhone);
    } else {
      await supabase
        .from('conversations')
        .insert({
          client_id: clientId,
          user_phone: userPhone,
          messages: updated,
          updated_at: new Date().toISOString()
        });
    }
  } catch (error) {
    console.error('Error guardando mensaje:', error.message);
  }
}
// Llamar a la IA
async function getAIResponse(client, userMessage, history) {
  // Construir prompt completo con FAQ y catalogo si existen
  let systemPrompt = client.prompt;
  if (client.faq) systemPrompt += '\n\nPREGUNTAS FRECUENTES:\n' + client.faq;
  if (client.catalog) systemPrompt += '\n\nCATALOGO O MENU:\n' + client.catalog;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage }
  ];

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    { model: client.model || 'openai/gpt-3.5-turbo', messages },
    {
      headers: {
        'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data.choices[0].message.content;
}

// Enviar mensaje por WhatsApp
async function sendWhatsAppMessage(to, message, phoneNumberId, token) {
  await axios.post(
    'https://graph.facebook.com/v18.0/' + phoneNumberId + '/messages',
    {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: message }
    },
    {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    }
  );
}

app.get('/', (req, res) => res.send('ChatBot SaaS Multi-cliente funcionando!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor corriendo en puerto ' + PORT));
