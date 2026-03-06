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

// ─── Webhook verificación ───────────────────────────────────────────
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ─── Webhook principal ──────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return res.sendStatus(404);

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    const phoneNumberId = value?.metadata?.phone_number_id;
    const contacts = value?.contacts?.[0];

    if (!message) return res.sendStatus(200);

    const userPhone = message.from;
    // Obtener nombre del perfil de WhatsApp
    const profileName = contacts?.profile?.name || null;

    console.log(`📩 Mensaje de ${profileName || userPhone} (${userPhone})`);

    // Buscar cliente por phone_number_id
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('phone_number_id', phoneNumberId)
      .eq('active', true)
      .single();

    if (error || !client) {
      console.log('❌ Cliente no encontrado para:', phoneNumberId);
      return res.sendStatus(200);
    }

    let userMessage = '';

    // ── Tipo de mensaje ──────────────────────────────────────────────
    if (message.type === 'text') {
      userMessage = message.text.body;

    } else if (message.type === 'audio') {
      console.log('🎤 Audio recibido de', userPhone);
      try {
        const audioUrl = await getMediaUrl(message.audio.id, client.whatsapp_token);
        const transcription = await transcribeAudio(audioUrl, client.whatsapp_token);
        userMessage = '[Nota de voz]: ' + transcription;
      } catch (e) {
        userMessage = '[El cliente envió una nota de voz que no pude transcribir]';
      }

    } else if (message.type === 'image') {
      console.log('🖼️ Imagen recibida de', userPhone);
      userMessage = '[El cliente envió una imagen] Responde amablemente que recibiste la imagen y pregunta en qué puedes ayudarle.';

    } else if (message.type === 'document') {
      userMessage = '[El cliente envió un documento] Responde que recibiste el documento y lo revisarás pronto.';

    } else {
      return res.sendStatus(200);
    }

    // ── Obtener historial y nombre guardado ─────────────────────────
    const { history, savedName } = await getConversationHistory(client.id, userPhone);

    // Determinar nombre a usar
    const userName = profileName || savedName || null;

    // ── Respuesta IA ────────────────────────────────────────────────
    const aiResponse = await getAIResponse(client, userMessage, history, userName);

    // ── Detectar imagen de producto (antes de guardar, para marcarla) ─
    const sentImages = getSentImages(history);
    const productImage = detectProductImage(aiResponse, client, sentImages);

    // ── Guardar conversación (con marcador de imagen si aplica) ──────
    await saveMessage(client.id, userPhone, userMessage, aiResponse, userName, productImage?.key);

    // ── Enviar imagen de producto si se detectó ──────────────────────
    if (productImage) {
      console.log('📸 Enviando imagen de producto:', productImage.name);
      await sendWhatsAppImage(
        userPhone,
        productImage.url,
        `🌿 ${productImage.name} - Natural Palagar`,
        phoneNumberId,
        client.whatsapp_token
      );
    }

    // ── Enviar respuesta de texto ───────────────────────────────────
    await sendWhatsAppMessage(userPhone, aiResponse, phoneNumberId, client.whatsapp_token);

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error general:', error.message);
    res.sendStatus(500);
  }
});

// ─── Obtener imágenes ya enviadas en esta conversación ───────────────
function getSentImages(history) {
  // Buscar mensajes del tipo [IMG_SENT:NOMBRE] que guardamos como marcadores
  const sent = new Set();
  for (const msg of history) {
    const match = msg.content?.match(/\[IMG_SENT:([^\]]+)\]/);
    if (match) sent.add(match[1]);
  }
  return sent;
}

// ─── Detectar producto en respuesta y devolver imagen ───────────────
function detectProductImage(aiResponse, client, sentImages = new Set()) {
  if (!client.product_images) return null;
  try {
    const images = JSON.parse(client.product_images);
    const responseUpper = aiResponse.toUpperCase();

    // Mapa de palabras clave → nombre de clave en el JSON
    const productKeywords = {
      '7TOROS':       ['7 TOROS', '7TOROS', 'SIETE TOROS', 'MACA', 'BOROJO', 'BOROJÓ'],
      'BERENLIN':     ['BERENLIN', 'UVA', 'RESVERATROL', 'COLÁGENO HIDROLIZADO'],
      'BRILPRO':      ['BRIL-PRO', 'BRILPRO', 'ARANDANO', 'ARÁNDANO', 'PEREJIL'],
      'CASIGUA':      ['CASIGUA', 'PITAHAYA', 'CIRUELA', 'CALABAZA'],
      'CIRLAN':       ['CIR-LAN', 'CIRLAN', 'CEBOLLA', 'AJO', 'LIMÓN'],
      'CXP':          ['CX-P', 'CXP', 'CITRATO DE MAGNESIO', 'CITRATO DE POTASIO'],
      'KOLOSAL':      ['KOLOSAL', 'PIÑA', 'PAPAYA', 'NARANJA', 'PITAYA'],
      'MEMOTRON':     ['MEMOTRON', 'MEMORIA', 'CONCENTRACIÓN'],
      'MR_FIBRA_PINA':['MR FIBRA', 'FIBRA PIÑA', 'CIRUELA PIÑA', 'LINAZA'],
      'MR_FIBRA_VERDE':['MR FIBRA VERDE', 'PSYLLIUM', 'TÉ VERDE', 'CHIA', 'CHÍA'],
      'OXTMAX':       ['OXTMAX', 'CÚRCUMA', 'CURCUMA', 'MANZANILLA'],
    };

    for (const [key, keywords] of Object.entries(productKeywords)) {
      if (images[key] && !sentImages.has(key) && keywords.some(kw => responseUpper.includes(kw))) {
        return { name: key.replace('_', ' '), url: images[key], key };
      }
    }
  } catch (e) {
    console.error('Error parseando product_images:', e.message);
  }
  return null;
}

// ─── Obtener URL de media de Meta ────────────────────────────────────
async function getMediaUrl(mediaId, token) {
  const response = await axios.get(
    `https://graph.facebook.com/v18.0/${mediaId}`,
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  return response.data.url;
}

// ─── Transcribir audio con Whisper ──────────────────────────────────
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
    console.error('Error transcribiendo:', error.message);
    return 'No pude entender el audio, por favor escribe tu mensaje.';
  }
}

// ─── Historial de conversación ───────────────────────────────────────
async function getConversationHistory(clientId, userPhone) {
  try {
    const { data } = await supabase
      .from('conversations')
      .select('messages, user_name')
      .eq('client_id', clientId)
      .eq('user_phone', userPhone)
      .maybeSingle();
    return {
      history: data?.messages || [],
      savedName: data?.user_name || null
    };
  } catch {
    return { history: [], savedName: null };
  }
}

// ─── Guardar mensaje ─────────────────────────────────────────────────
async function saveMessage(clientId, userPhone, userMessage, aiResponse, userName, sentImageKey) {
  try {
    const { data: existing } = await supabase
      .from('conversations')
      .select('messages, user_name')
      .eq('client_id', clientId)
      .eq('user_phone', userPhone)
      .maybeSingle();

    const history = existing?.messages || [];

    // Mensajes nuevos
    const newMsgs = [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: aiResponse }
    ];

    // Si se envió una imagen, agregar marcador invisible al historial
    if (sentImageKey) {
      newMsgs.push({ role: 'system', content: `[IMG_SENT:${sentImageKey}]` });
    }

    const updated = [...history, ...newMsgs].slice(-40);

    // Detectar nombre si el usuario lo menciona ("me llamo X", "soy X")
    let detectedName = userName;
    if (!detectedName) {
      const nameMatch = userMessage.match(/(?:me llamo|mi nombre es|soy)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+[A-ZÁÉÍÓÚ][a-záéíóú]+)?)/i);
      if (nameMatch) detectedName = nameMatch[1];
    }

    const nameToSave = detectedName || existing?.user_name || null;

    if (existing) {
      await supabase
        .from('conversations')
        .update({
          messages: updated,
          updated_at: new Date().toISOString(),
          ...(nameToSave && { user_name: nameToSave })
        })
        .eq('client_id', clientId)
        .eq('user_phone', userPhone);
    } else {
      await supabase
        .from('conversations')
        .insert({
          client_id: clientId,
          user_phone: userPhone,
          messages: updated,
          updated_at: new Date().toISOString(),
          user_name: nameToSave
        });
    }
  } catch (error) {
    console.error('Error guardando mensaje:', error.message);
  }
}

// ─── Respuesta IA ────────────────────────────────────────────────────
async function getAIResponse(client, userMessage, history, userName) {
  let systemPrompt = client.prompt || '';
  if (userName) systemPrompt += `\n\nNombre del cliente: ${userName}. Úsalo para personalizar la conversación.`;
  if (client.faq) systemPrompt += '\n\nPREGUNTAS FRECUENTES:\n' + client.faq;
  if (client.catalog) systemPrompt += '\n\nCATÁLOGO DE PRODUCTOS:\n' + client.catalog;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-20),
    { role: 'user', content: userMessage }
  ];

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: client.model || 'openai/gpt-3.5-turbo',
      messages,
      max_tokens: 500,
      temperature: 0.7
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

// ─── Enviar mensaje de texto ─────────────────────────────────────────
async function sendWhatsAppMessage(to, message, phoneNumberId, token) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message }
    },
    { headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } }
  );
}

// ─── Enviar imagen ───────────────────────────────────────────────────
async function sendWhatsAppImage(to, imageUrl, caption, phoneNumberId, token) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: imageUrl, caption: caption || '' }
    },
    { headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } }
  );
}

app.get('/', (req, res) => res.send('🤖 ChatBot SaaS Multi-cliente funcionando!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
