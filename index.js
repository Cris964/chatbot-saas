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

// ─── CORS para permitir llamadas desde Vercel CRM ────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

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
        const audioBuffer = await getMediaBuffer(message.audio.id, client.whatsapp_token);
        const transcription = await transcribeAudio(audioBuffer);
        console.log('📝 Transcripción:', transcription);
        userMessage = transcription; // Tratar como texto normal, sin prefijo
      } catch (e) {
        console.error('Error en audio:', e.message);
        userMessage = '[nota de voz no transcrita] Pide amablemente que repita por texto';
      }

    } else if (message.type === 'image') {
      console.log('🖼️ Imagen recibida de', userPhone);
      try {
        // Descargar imagen y analizarla con visión IA
        const imageBuffer = await getMediaBuffer(message.image.id, client.whatsapp_token);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = message.image.mime_type || 'image/jpeg';
        userMessage = `[IMAGEN_CLIENTE:${mimeType};base64,${base64Image}] El cliente envió esta imagen. Analízala y responde de forma natural: si es un producto nuestro confirma cuál es, si es una foto personal salúdalo, si es algo relacionado con salud ofrece ayuda con nuestros productos.`;
      } catch (e) {
        console.error('Error procesando imagen:', e.message);
        userMessage = '[El cliente envió una foto] Responde que la recibiste y pregunta en qué le puedes ayudar 🌿';
      }

    } else if (message.type === 'document') {
      userMessage = '[El cliente envió un documento] Responde que recibiste el documento y lo revisarás pronto.';

    } else {
      return res.sendStatus(200);
    }

    // ── Verificar si hay asesor humano activo (no responder con IA) ──
    const { data: convCheck } = await supabase
      .from('conversations')
      .select('needs_human, messages')
      .eq('client_id', client.id)
      .eq('user_phone', userPhone)
      .maybeSingle();

    // El CRM controla el modo del bot con la columna needs_human
    // Si needs_human es true, el bot está DESACTIVADO (asesor activo)
    // Si needs_human es false, el bot está ACTIVO
    const advisorIsActive = convCheck?.needs_human === true;

    if (advisorIsActive) {
      console.log('👤 Asesor activo (needs_human=true) — guardando mensaje del cliente sin responder IA');
      // Guardar el mensaje del cliente para que el asesor lo vea en el CRM
      await saveMessage(client.id, userPhone, userMessage, null, userName, null);
      return res.sendStatus(200);
    }

    // ── Detectar si el cliente pide asesor humano ────────────────────
    const wantsHuman = /asesor|humano|persona real|hablar con alguien|agente|operador/i.test(userMessage);
    if (wantsHuman) {
      // Marcar en la conversación que requiere asesor
      await supabase.from('conversations')
        .update({ needs_human: true, updated_at: new Date().toISOString() })
        .eq('client_id', client.id).eq('user_phone', userPhone);
    }

    // ── Obtener historial y nombre guardado ─────────────────────────
    const { history, savedName } = await getConversationHistory(client.id, userPhone);
    const userName = profileName || savedName || null;

    // ── Obtener inventario en tiempo real ───────────────────────────
    const inventory = await getInventory(client.id);

    // ── Respuesta IA con inventario ─────────────────────────────────
    const aiResponse = await getAIResponse(client, userMessage, history, userName, inventory);

    // ── Detectar imagen de producto (antes de guardar, para marcarla) ─
    const sentImages = getSentImages(history);
    const productImage = detectProductImage(aiResponse, client, sentImages, inventory);

    // ── Detectar si la IA confirmó un pedido y descontar stock ───────
    await detectAndSaveOrder(aiResponse, client.id, userPhone, userName);

    // ── Guardar conversación — limpiar base64 y palabras mágicas antes de guardar ──────
    const strippedResponse = aiResponse.replace(/\[ENVIAR_QR_TRANSFERENCIA\]/g, '').trim();

    const messageToSave = userMessage.startsWith('[IMAGEN_CLIENTE:')
      ? '[El cliente envió una imagen 📷]'
      : userMessage;
    await saveMessage(client.id, userPhone, messageToSave, strippedResponse, userName, productImage?.key);

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

    // ── Enviar QRs de pago si la IA lo decidió ──────────────────────
    if (aiResponse.includes('[ENVIAR_QR_TRANSFERENCIA]')) {
      console.log('📸 Enviando QR Nequi y Bancolombia');
      await sendWhatsAppImage(userPhone, 'https://chatbot-crm-xi.vercel.app/qr_1.jpg', '🏦 Bancolombia QR', phoneNumberId, client.whatsapp_token);
      await sendWhatsAppImage(userPhone, 'https://chatbot-crm-xi.vercel.app/qr_2.jpg', '💜 Nequi QR', phoneNumberId, client.whatsapp_token);
    }

    // ── Enviar respuesta de texto limpia ──────────────────────────────
    await sendWhatsAppMessage(userPhone, strippedResponse, phoneNumberId, client.whatsapp_token);


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

// ─── Detectar producto mencionado y devolver su imagen ───────────────
function detectProductImage(aiResponse, client, sentImages = new Set(), inventory = []) {
  const responseUpper = aiResponse.toUpperCase();
  console.log('🔍 Buscando imagen para respuesta:', aiResponse.slice(0, 100));

  // Usar inventario dinámico (solo coincidencia exacta de nombre para evitar falsos positivos con keywords descriptivos)
  for (const product of inventory) {
    if (!product.image_url) continue;
    const keyId = product.name.toUpperCase().replace(/[\s\/\-]+/g, '_');
    
    if (sentImages.has(keyId)) {
      continue;
    }

    // Buscar por nombre del producto directamente
    const productNameUpper = product.name.toUpperCase().replace(/[\s\/\-]+/g, '');
    const responseClean = responseUpper.replace(/[\s\/\-]+/g, '');
    
    if (responseClean.includes(productNameUpper)) {
      console.log(`✅ Imagen detectada por nombre exacto: ${product.name} (url: ${product.image_url})`);
      return { name: product.name, url: product.image_url, key: keyId };
    }
  }

  console.log('❌ No se detectó ningún producto para enviar imagen');
  return null;
}

// ─── Detectar confirmación de pedido y descontar stock ───────────────
async function detectAndSaveOrder(aiResponse, clientId, userPhone, userName) {
  try {
    // Detectar si la IA confirmó un pedido (frases típicas de confirmación)
    const confirmPatterns = [
      /pedido confirmado/i, /tu pedido está listo/i, /pedido registrado/i,
      /anotado tu pedido/i, /listo tu pedido/i, /pedido tomado/i,
      /te llega en/i, /enviamos tu pedido/i, /queda confirmado/i,
      /confirmado.*pedido/i, /pedido.*confirmado/i
    ];
    const isConfirmed = confirmPatterns.some(p => p.test(aiResponse));
    if (!isConfirmed) return;

    // Detectar producto mencionado cerca de la confirmación
    const { data: products } = await supabase
      .from('inventory')
      .select('id, name, keywords, stock')
      .eq('client_id', clientId)
      .gt('stock', 0);

    if (!products) return;

    const textUpper = aiResponse.toUpperCase();
    const userMsgUpper = (typeof userMessage === 'string' ? userMessage : '').toUpperCase();
    
    // Detectar si hay un comprobante (imagen enviada por el cliente)
    const hasReceipt = userMessage.includes('[IMAGEN_CLIENTE:');

    for (const product of products) {
      const keywords = (product.keywords || product.name)
        .split(',').map(k => k.trim().toUpperCase());
      
      if (keywords.some(kw => kw && textUpper.includes(kw))) {
        // Descontar 1 unidad del stock
        await supabase
          .from('inventory')
          .update({ stock: Math.max(product.stock - 1, 0), updated_at: new Date().toISOString() })
          .eq('id', product.id);

        console.log(`📦 Stock descontado: ${product.name} → ${product.stock - 1} unidades`);

        // Extraer ciudad y dirección (intento simple por regex o asumiendo que la IA lo confirma)
        const cityMatch = aiResponse.match(/ciudad:\s*([^,\.\n]+)/i) || aiResponse.match(/en\s+([A-Z][a-z]+)/);
        const addressMatch = aiResponse.match(/dirección:\s*([^,\.\n]+)/i);
        
        const city = cityMatch ? cityMatch[1].trim() : 'No especificada';
        const address = addressMatch ? addressMatch[1].trim() : 'No especificada';

        // Guardar en tabla orders con más info para el CRM
        await supabase.from('orders').insert({
          client_id: clientId,
          user_phone: userPhone,
          user_name: userName || 'Cliente WhatsApp',
          product: product.name,
          status: hasReceipt ? 'pagado' : 'pendiente',
          city: city,
          address: address,
          total: product.price || 0,
          items: [{ name: product.name, qty: 1, price: product.price }],
          created_at: new Date().toISOString()
        });
        break; // Solo el primer producto detectado
      }
    }
  } catch (e) {
    console.error('Error detectando pedido:', e.message);
  }
}

// ─── Obtener URL de media de Meta ────────────────────────────────────
async function getMediaUrl(mediaId, token) {
  const response = await axios.get(
    `https://graph.facebook.com/v18.0/${mediaId}`,
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  return response.data.url;
}

// ─── Descargar buffer de audio desde Meta ────────────────────────────
async function getMediaBuffer(mediaId, token) {
  // Primero obtener la URL del archivo
  const urlResponse = await axios.get(
    `https://graph.facebook.com/v18.0/${mediaId}`,
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  const mediaUrl = urlResponse.data.url;

  // Luego descargar el archivo
  const fileResponse = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  return Buffer.from(fileResponse.data);
}

// ─── Transcribir audio con Groq Whisper (gratis y rápido) ───────────
async function transcribeAudio(audioBuffer) {
  try {
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'audio.ogg',
      contentType: 'audio/ogg'
    });
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'es');
    formData.append('response_format', 'json');

    const response = await axios.post(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      formData,
      {
        headers: {
          'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
          ...formData.getHeaders()
        },
        timeout: 30000
      }
    );
    const text = response.data.text?.trim();
    console.log('📝 Transcripción Groq:', text);
    return text || 'no entendí el audio';
  } catch (error) {
    console.error('Error Groq transcripción:', error.response?.data || error.message);
    throw error;
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

    const timestamp = new Date().toISOString();

    // Mensajes nuevos — solo agregar respuesta IA si existe
    const newMsgs = [
      { role: 'user', content: userMessage, timestamp }
    ];
    if (aiResponse) {
      newMsgs.push({ role: 'assistant', content: aiResponse, timestamp });
    }

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

// ─── Obtener inventario del cliente ─────────────────────────────────
async function getInventory(clientId) {
  try {
    const { data } = await supabase
      .from('inventory')
      .select('name, description, benefits, ingredients, keywords, stock, price, active, image_url')
      .eq('client_id', clientId)
      .order('name')
    console.log('📋 Inventario cargado:', data?.map(p => `${p.name}(stock:${p.stock},img:${p.image_url ? '✅' : '❌'})`).join(', '))
    return data || []
  } catch (e) {
    console.error('Error obteniendo inventario:', e.message)
    return []
  }
}

// ─── Respuesta IA con inventario en tiempo real ──────────────────────
async function getAIResponse(client, userMessage, history, userName, inventory = []) {
  let systemPrompt = ''

  // ⚠️ INVENTARIO PRIMERO — para que la IA lo respete siempre
  if (inventory.length > 0) {
    const inStock = inventory.filter(p => p.active && p.stock > 0)
    const outOfStock = inventory.filter(p => p.active && p.stock === 0)

    systemPrompt += `REGLA ABSOLUTA #1 — STOCK EN TIEMPO REAL:
Estos son los únicos productos que puedes ofrecer HOY. Esta lista se actualiza en tiempo real.

`
    if (outOfStock.length > 0) {
      systemPrompt += `❌ PRODUCTOS AGOTADOS — PROHIBIDO OFRECERLOS O DECIR QUE HAY DISPONIBILIDAD:\n`
      outOfStock.forEach(p => { systemPrompt += `• ${p.name} — SIN STOCK, NO DISPONIBLE\n` })
      systemPrompt += `\nSi alguien pregunta por un producto agotado, di EXACTAMENTE: "En este momento no tenemos [producto] disponible 😔 pero en cuanto llegue te aviso. ¿Te puedo mostrar algo similar?"\n\n`
    }

    if (inStock.length > 0) {
      systemPrompt += `✅ PRODUCTOS DISPONIBLES PARA VENDER:\n`
      inStock.forEach(p => {
        systemPrompt += `• ${p.name} — ${p.stock} unidades disponibles`
        if (p.price) systemPrompt += ` — $${p.price}`
        if (p.benefits) systemPrompt += ` — Para: ${p.benefits}`
        systemPrompt += '\n'
      })
    } else {
      systemPrompt += `⚠️ En este momento NO hay productos disponibles en inventario.\n`
    }

    systemPrompt += `\n———————————————————————————————\n\n`
  }

  // Prompt principal del cliente
  systemPrompt += client.prompt || ''

  systemPrompt += `\n\nREGLAS DE RECAUDO Y PAGOS (MANDATORIO):
1. Si el cliente menciona que quiere pagar por TRANSFERENCIA (Nequi o Bancolombia), indícale LOS DOS métodos de pago y usa la palabra mágica [ENVIAR_QR_TRANSFERENCIA].
Ejemplo exacto de cómo debes responder: "¡Claro! Puedes transferir a:
🏦 Bancolombia (Ahorros): 285-487245-99
💜 Nequi: 3183701497
[ENVIAR_QR_TRANSFERENCIA]"

2. Si el cliente menciona que quiere pagar por PSE (o tarjeta), envíalo a la página web:
Ejemplo exacto: "Puedes realizar tu pago seguro por PSE a través de nuestra página web oficial: supernaturamarketing.com"

3. EXTRACCIÓN DE DATOS DE ENVÍO:
Cuando el cliente confirme la compra o envíe el comprobante, DEBES pedirle o confirmar:
- Nombre completo
- Ciudad de destino
- Dirección exacta
- Teléfono de contacto

Si ya tienes estos datos, repítelos para confirmar. Formatea la confirmación así para que el sistema la detecte:
"¡Perfecto! He registrado tu compra de [Producto]. 
Datos de envío:
Ciudad: [Ciudad]
Dirección: [Dirección]
Confirmado: ✅"
`

  // Nombre del cliente
  if (userName) systemPrompt += `\n\nEl cliente se llama ${userName}. Úsalo naturalmente.`

  if (client.faq) systemPrompt += '\n\nPREGUNTAS FRECUENTES:\n' + client.faq

  // Construir mensajes — detectar si hay imagen del cliente
  let userContent;
  if (userMessage.startsWith('[IMAGEN_CLIENTE:')) {
    // Extraer base64 y mime
    const match = userMessage.match(/\[IMAGEN_CLIENTE:([^;]+);base64,(.+)\]/s);
    if (match) {
      const mimeType = match[1];
      const base64 = match[2];
      userContent = [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        { type: 'text', text: 'Analiza esta imagen y responde naturalmente como Sara, asesora de Naturel. Si reconoces algún producto nuestro dilo. Si es algo personal responde amablemente.' }
      ];
    } else {
      userContent = userMessage;
    }
  } else {
    userContent = userMessage;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-20).map(m => {
      // OpenRouter/OpenAI strictly accept only 'system', 'user', 'assistant' functions.
      // We map our custom CRM role 'agent' to 'assistant' so the API doesn't crash with a 400 error.
      let validRole = m.role;
      if (validRole === 'agent') validRole = 'assistant';
      return { role: validRole, content: m.content };
    }),
    { role: 'user', content: userContent }
  ]

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'openai/gpt-4o-mini', // gpt-4o-mini soporta visión y sigue instrucciones bien
      messages,
      max_tokens: 600,
      temperature: 0.7
    },
    {
      headers: {
        'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  )
  return response.data.choices[0].message.content
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

// ─── Polling outbox: enviar mensajes del asesor a WhatsApp ───────────
async function processOutbox() {
  try {
    // Leer mensajes pendientes
    const { data: pending } = await supabase
      .from('outbox')
      .select('*, clients(phone_number_id, whatsapp_token)')
      .eq('status', 'pending')
      .order('created_at')
      .limit(10)

    if (!pending || pending.length === 0) return

    for (const item of pending) {
      try {
        const phoneNumberId = item.clients?.phone_number_id
        const token = item.clients?.whatsapp_token
        if (!phoneNumberId || !token) continue

        await sendWhatsAppMessage(item.user_phone, item.message, phoneNumberId, token)
        console.log(`✅ Outbox enviado a ${item.user_phone}: ${item.message.slice(0, 50)}`)

        // Marcar como enviado
        await supabase.from('outbox').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', item.id)
      } catch (err) {
        console.error(`❌ Error enviando outbox ${item.id}:`, err.message)
        await supabase.from('outbox').update({ status: 'error', error: err.message }).eq('id', item.id)
      }
    }
  } catch (e) {
    console.error('Error procesando outbox:', e.message)
  }
}

// Revisar outbox cada 3 segundos
setInterval(processOutbox, 3000)

// Verificar tabla outbox al iniciar
async function checkOutboxTable() {
  try {
    const { error } = await supabase.from('outbox').select('id').limit(1)
    if (error) {
      console.error('❌ Tabla outbox NO existe:', error.message)
      console.error('👉 Ejecuta el setup.sql en Supabase para crearla')
    } else {
      console.log('✅ Tabla outbox OK — procesando mensajes de asesores')
    }
  } catch(e) {
    console.error('❌ Error verificando outbox:', e.message)
  }
}
checkOutboxTable()

app.get('/', (req, res) => res.send('🤖 ChatBot SaaS Multi-cliente funcionando!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
