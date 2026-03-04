require('dotenv').config();
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "mi_token_secreto";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
    const phoneNumberId = changes?.value?.metadata?.phone_number_id;

    if (!message) return res.sendStatus(200);

    const userPhone = message.from;

    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('phone_number_id', phoneNumberId)
      .eq('active', true)
      .single();

    if (error || !client) {
      console.log('Cliente no encontrado para: ' + phoneNumberId);
      return res.sendStatus(200);
    }

    let userMessage = '';

    // Manejar diferentes tipos de mensajes
    if (message.type === 'text') {
      userMessage = message.text.body;

    } else if (message.type === 'audio') {
      console.log('Audio recibido de ' + userPhone);
      const audioUrl = await getMediaUrl(message.audio.id, client.whatsapp_token);
      const transcription = await transcribeAudio(audioUrl, client.whatsapp_token);
      userMessage = '[Nota de voz]: ' + transcription;

    } else if (message.type === 'image') {
      console.log('Imagen recibida de ' + userPhone);
      const imageUrl = await getMediaUrl(message.image.id, client.whatsapp_token);
      userMessage = '[El cliente envio una imagen: ' + imageUrl + '] Responde que recibiste la imagen y que la estas revisando, y si puedes identificar algo relevante para la venta, mencíonalo.';

    } else if (message.type === 'document') {
      userMessage = '[El cliente envio un documento] Responde que recibiste el documento y que lo revisaras pronto.';

    } else {
      return res.sendStatus(200);
    }

    console.log('Mensaje de ' + userPhone + ': ' + userMessage);

    const history = await getConversationHistory(client.id, userPhone);
    const aiResponse = await getAIResponse(client, userMessage, history);
    await saveMessage(client.id, userPhone, userMessage, aiResponse);

    // Verificar si hay que enviar imagen de producto
    const productImage = detectProductImage(aiResponse, client);
    if (productImage) {
      await sendWhatsAppImage(userPhone, productImage.url, productImage.caption, phoneNumberId, client.whatsapp_token);
    }

    await sendWhatsAppMessage(userPhone, aiResponse, phoneNumberId, client.whatsapp_token);

    res.sendStatus(200);
  } catch (error) {
    console.error('Error:', error.message);
    res.sendStatus(500);
  }
});

// Obtener URL de media de Meta
async function getMediaUrl(mediaId, token) {
  const response = await axios.get(
    'https://graph.facebook.com/v18.0/' + mediaId,
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  return response.data.url;
}

// Transcribir audio con Whisper via OpenRouter
async function transcribeAudio(audioUrl, token) {
  try {
    const audioResponse = await axios.get(audioUrl, {
      responseType: 'arraybuffer',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    const formData = new FormData();
    formData.append('file', Buffer.from(audioResponse.data), {
      filename: 'audio.ogg',
      contentType: 'audio/ogg'
    });
    formData.append('model', 'whisper-1');

    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      {
        headers: {
          'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
          ...formData.getHeaders()
        }
      }
    );
    return response.data.text;
  } catch (error) {
    console.error('Error transcribiendo audio:', error.message);
    return 'No pude entender el audio, por favor escribe tu mensaje.';
  }
}

// Detectar si el bot menciona un producto y tiene imagen
function detectProductImage(aiResponse, client) {
  if (!client.product_images) return null;
  try {
    const images = JSON.parse(client.product_images);
    for (const product of images) {
      if (aiResponse.toLowerCase().includes(product.name.toLowerCase())) {
        return product;
      }
    }
  } catch { return null; }
  return null;
}

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

async function getAIResponse(client, userMessage, history) {
  let systemPrompt = client.prompt;
  if (client.faq) systemPrompt += '\n\nPREGUNTAS FRECUENTES:\n' + client.faq;
  if (client.catalog) systemPrompt += '\n\nCATALOGO:\n' + client.catalog;

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

async function sendWhatsAppMessage(to, message, phoneNumberId, token) {
  await axios.post(
    'https://graph.facebook.com/v18.0/' + phoneNumberId + '/messages',
    {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: message }
    },
    { headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } }
  );
}

async function sendWhatsAppImage(to, imageUrl, caption, phoneNumberId, token) {
  await axios.post(
    'https://graph.facebook.com/v18.0/' + phoneNumberId + '/messages',
    {
      messaging_product: 'whatsapp',
      to: to,
      type: 'image',
      image: { link: imageUrl, caption: caption || '' }
    },
    { headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } }
  );
}

app.get('/', (req, res) => res.send('ChatBot SaaS Multi-cliente funcionando!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor corriendo en puerto ' + PORT));
