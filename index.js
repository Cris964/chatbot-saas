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
    const contacts = changes?.value?.contacts?.[0];
    const phoneNumberId = changes?.value?.metadata?.phone_number_id;

    if (!message) return res.sendStatus(200);

    const userPhone = message.from;
    // Nombre del perfil de WhatsApp (cuando Meta lo provee)
    const waProfileName = contacts?.profile?.name || null;

    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('phone_number_id', phoneNumberId)
      .eq('active', true)
      .single();

    if (error || !client) return res.sendStatus(200);

    let userMessage = '';

    if (message.type === 'text') {
      userMessage = message.text.body;
    } else if (message.type === 'audio') {
      const audioUrl = await getMediaUrl(message.audio.id, client.whatsapp_token);
      const transcription = await transcribeAudio(audioUrl, client.whatsapp_token);
      userMessage = '[Nota de voz]: ' + transcription;
    } else if (message.type === 'image') {
      const imageUrl = await getMediaUrl(message.image.id, client.whatsapp_token);
      userMessage = '[El cliente envio una imagen] Responde que la recibiste y la estas revisando.';
    } else if (message.type === 'document') {
      userMessage = '[El cliente envio un documento] Responde que lo recibiste.';
    } else {
      return res.sendStatus(200);
    }

    // Obtener o crear conversacion con nombre guardado
    const conversation = await getOrCreateConversation(client.id, userPhone, waProfileName);
    const userName = conversation.user_name;
    const history = conversation.messages || [];

    console.log('Mensaje de ' + (userName || userPhone) + ': ' + userMessage);

    const aiResponse = await getAIResponse(client, userMessage, history, userName);
    
    // Detectar si el usuario dijo su nombre en este mensaje
    const detectedName = detectNameInMessage(userMessage, userName);
    
    await saveMessage(client.id, userPhone, userMessage, aiResponse, detectedName || userName);

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

// Obtener o crear conversacion
async function getOrCreateConversation(clientId, userPhone, waProfileName) {
  try {
    const { data } = await supabase
      .from('conversations')
      .select('messages, user_name')
      .eq('client_id', clientId)
      .eq('user_phone', userPhone)
      .maybeSingle();

    if (data) {
      // Si no tenia nombre pero WhatsApp nos lo dio, actualizarlo
      if (!data.user_name && waProfileName) {
        await supabase
          .from('conversations')
          .update({ user_name: waProfileName })
          .eq('client_id', clientId)
          .eq('user_phone', userPhone);
        return { ...data, user_name: waProfileName };
      }
      return data;
    }

    // Primera vez que escribe
    await supabase
      .from('conversations')
      .insert({
        client_id: clientId,
        user_phone: userPhone,
        user_name: waProfileName,
        messages: [],
        updated_at: new Date().toISOString()
      });

    return { messages: [], user_name: waProfileName };
  } catch (error) {
    console.error('Error en conversacion:', error.message);
    return { messages: [], user_name: waProfileName };
  }
}

// Detectar nombre en el mensaje
function detectNameInMessage(message, currentName) {
  if (currentName) return null;
  const patterns = [
    /(?:me llamo|soy|mi nombre es)\s+([A-Za-záéíóúÁÉÍÓÚñÑ]+)/i,
    /^([A-Za-záéíóúÁÉÍÓÚñÑ]{3,15})$/
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function getAIResponse(client, userMessage, history, userName) {
  let systemPrompt = client.prompt;
  if (client.faq) systemPrompt += '\n\nPREGUNTAS FRECUENTES:\n' + client.faq;
  if (client.catalog) systemPrompt += '\n\nCATALOGO:\n' + client.catalog;

  // Inyectar nombre si lo sabemos
  if (userName) {
    systemPrompt += '\n\nIMPORTANTE: El nombre del cliente es ' + userName + '. Usalo naturalmente en la conversacion.';
  } else {
    systemPrompt += '\n\nIMPORTANTE: No sabes el nombre del cliente todavia. En tu primer mensaje preguntale su nombre de forma natural.';
  }

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

async function saveMessage(clientId, userPhone, userMessage, aiResponse, userName) {
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

    await supabase
      .from('conversations')
      .update({
        messages: updated,
        user_name: userName,
        updated_at: new Date().toISOString()
      })
      .eq('client_id', clientId)
      .eq('user_phone', userPhone);
  } catch (error) {
    console.error('Error guardando:', error.message);
  }
}

async function getMediaUrl(mediaId, token) {
  const response = await axios.get(
    'https://graph.facebook.com/v18.0/' + mediaId,
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  return response.data.url;
}

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
    return 'No pude entender el audio, por favor escribe tu mensaje.';
  }
}

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
