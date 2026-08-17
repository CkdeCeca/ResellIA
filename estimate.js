// Función serverless (Vercel). Se despliega automáticamente en /api/estimate
// Usa la API gratuita de Google Gemini (visión + búsqueda web integrada).
// Guarda tu clave en la variable de entorno Gemini_API_Key (Vercel > Settings > Environment Variables)
// Consigue la clave gratis en https://aistudio.google.com/app/apikey
// Opcional: define APP_PASSWORD para exigir un código de acceso antes de dejar usar la web

const GEMINI_MODEL = 'gemini-2.5-flash'; // modelo estable con capa gratuita, visión y búsqueda web

const SYSTEM_PROMPT = `Eres un tasador experto en ropa, calzado, accesorios y objetos de segunda mano en el mercado español, especializado en Vinted y Wallapop. Tienes acceso a búsqueda web: úsala de verdad, no te la saltes.

Proceso obligatorio:
1. Mira la foto e identifica el artículo con la mayor precisión posible: tipo, marca (si se ve o se intuye por diseño/logo/etiqueta), modelo si es identificable, color, estado aparente (nuevo con etiqueta, muy buen estado, usado con signos de desgaste, etc).
2. Haz VARIAS búsquedas web reales para encontrar referencias de precio: por ejemplo "[marca] [artículo] segunda mano precio", "[marca] [artículo] vinted", "[marca] [artículo] wallapop", "[marca] [artículo] precio original / PVP". Busca tanto el precio original de venta (si es una marca conocida) como precios de reventa que encuentres en foros, blogs de moda, comparadores, o menciones indirectas de Vinted/Wallapop.
3. Si el artículo es genérico o sin marca reconocible, busca precios de artículos comparables (mismo tipo de prenda/objeto, calidad similar) en segunda mano en España.
4. Cruza lo encontrado con tu conocimiento general del mercado de segunda mano para dar un rango realista y CONSERVADOR en Vinted y otro en Wallapop. Vinted suele tener precios algo más bajos y centrados en moda; Wallapop es más generalista y con precios algo más altos para objetos no textiles.
5. Indica tu nivel de confianza ("alta", "media" o "baja") según la cantidad y calidad de referencias que hayas encontrado.
6. Si has usado alguna fuente web concreta y útil para fundamentar el precio, inclúyela en "sources" con título y URL real. Si no encontraste fuentes útiles, deja "sources" como array vacío — no inventes URLs.

Responde ÚNICAMENTE con un JSON válido, sin texto adicional antes ni después, sin markdown, sin bloques \`\`\`, con esta forma exacta:
{
  "item_name": "string corto, nombre del artículo",
  "item_description": "1-2 frases describiendo qué ves: tipo, marca si aplica, estado, color",
  "vinted_low": number,
  "vinted_high": number,
  "wallapop_low": number,
  "wallapop_high": number,
  "average_price": number,
  "confidence": "alta" | "media" | "baja",
  "notes": ["nota práctica 1", "nota práctica 2", "nota práctica 3"],
  "sources": [{"title": "string", "url": "string"}]
}
Todos los precios en euros, números enteros, sin símbolo. Sé realista y conservador.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  // Protección opcional por código de acceso
  const requiredPassword = process.env.APP_PASSWORD;
  if (requiredPassword) {
    const given = req.headers['x-app-password'];
    if (given !== requiredPassword) {
      res.status(401).json({ error: 'Código de acceso incorrecto' });
      return;
    }
  }

  const apiKey = process.env.Gemini_API_Key;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar Gemini_API_Key en las variables de entorno del proyecto' });
    return;
  }

  const { imageBase64, mediaType, extra } = req.body || {};
  if (!imageBase64 || !mediaType) {
    res.status(400).json({ error: 'Falta la imagen' });
    return;
  }

  const userText = extra
    ? `${SYSTEM_PROMPT}\n\nAquí tienes la foto del artículo. Información adicional proporcionada por el usuario: ${extra}`
    : `${SYSTEM_PROMPT}\n\nAquí tienes la foto del artículo. No hay información adicional, básate en lo que se ve.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: userText },
              { inline_data: { mime_type: mediaType, data: imageBase64 } }
            ]
          }
        ],
        tools: [
          { googleSearch: {} }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: 'Error al llamar a la API de Gemini', detail: errText });
      return;
    }

    const data = await response.json();

    const candidate = (data.candidates || [])[0];
    const parts = candidate && candidate.content ? candidate.content.parts : [];
    const fullText = (parts || [])
      .map((p) => p.text)
      .filter(Boolean)
      .join('\n');

    if (!fullText) {
      res.status(500).json({ error: 'Gemini no devolvió texto', detail: JSON.stringify(data).slice(0, 500) });
      return;
    }

    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: 'Gemini no devolvió un JSON válido', detail: fullText.slice(0, 500) });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Si Gemini usó de verdad Google Search, añadimos esas fuentes reales como respaldo
    const groundingChunks = candidate && candidate.groundingMetadata ? candidate.groundingMetadata.groundingChunks : null;
    if ((!parsed.sources || !parsed.sources.length) && groundingChunks && groundingChunks.length) {
      parsed.sources = groundingChunks
        .filter((c) => c.web && c.web.uri)
        .slice(0, 5)
        .map((c) => ({ title: c.web.title || c.web.uri, url: c.web.uri }));
    }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor', detail: String(err) });
  }
}

