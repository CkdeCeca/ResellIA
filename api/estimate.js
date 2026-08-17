// api/estimate.js
// Vercel Serverless Function
// Variables necesarias en Vercel:
// GEMINI_API_KEY

const GEMINI_MODEL = "gemini-3.6-flash";

const SYSTEM_PROMPT = `
Eres un experto tasador de artículos de segunda mano en España.

Tu trabajo es analizar una fotografía de un artículo y estimar a qué precio
podría venderse actualmente en Vinted y Wallapop.

DEBES HACER LO SIGUIENTE:

1. Analiza cuidadosamente la imagen.
2. Identifica:
   - tipo de artículo
   - marca
   - modelo
   - color
   - estado
   - características visibles
3. Si puedes identificar la marca y modelo, utiliza Google Search para buscar
   referencias actuales de ese artículo.
4. Busca referencias relacionadas con:
   - Vinted
   - Wallapop
   - precios de segunda mano
   - precio original
   - mercados de reventa
5. No inventes precios ni fuentes.
6. Si no encuentras referencias suficientes, utiliza conocimiento general
   del mercado y baja la confianza.
7. Da precios CONSERVADORES y realistas.
8. Los precios deben ser números enteros en euros.
9. Vinted y Wallapop pueden tener precios diferentes.
10. Explica brevemente cómo vender mejor el artículo.

IMPORTANTE:
- No confundas el artículo con otro parecido.
- Si no puedes identificar exactamente el modelo, dilo.
- Nunca inventes una marca o modelo.
- No inventes URLs.
`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    item_name: {
      type: "STRING",
      description: "Nombre corto y claro del artículo identificado."
    },

    item_description: {
      type: "STRING",
      description:
        "Descripción de 1 o 2 frases indicando tipo, marca, modelo, color y estado."
    },

    vinted_low: {
      type: "INTEGER",
      description: "Precio mínimo recomendado para Vinted en euros."
    },

    vinted_high: {
      type: "INTEGER",
      description: "Precio máximo recomendado para Vinted en euros."
    },

    wallapop_low: {
      type: "INTEGER",
      description: "Precio mínimo recomendado para Wallapop en euros."
    },

    wallapop_high: {
      type: "INTEGER",
      description: "Precio máximo recomendado para Wallapop en euros."
    },

    average_price: {
      type: "INTEGER",
      description: "Precio medio aproximado entre ambos mercados."
    },

    confidence: {
      type: "STRING",
      enum: ["alta", "media", "baja"],
      description: "Nivel de confianza de la estimación."
    },

    notes: {
      type: "ARRAY",
      items: {
        type: "STRING"
      },
      description:
        "Consejos prácticos para vender el artículo. Máximo 3."
    }
  },

  required: [
    "item_name",
    "item_description",
    "vinted_low",
    "vinted_high",
    "wallapop_low",
    "wallapop_high",
    "average_price",
    "confidence",
    "notes"
  ]
};

export default async function handler(req, res) {
  // --------------------------------------------------
  // SOLO POST
  // --------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  // --------------------------------------------------
  // COMPROBAR API KEY
  // --------------------------------------------------

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY no está configurada");

    return res.status(500).json({
      error: "GEMINI_API_KEY no está configurada en Vercel"
    });
  }

  // --------------------------------------------------
  // LEER DATOS DEL FRONTEND
  // --------------------------------------------------

  const body = req.body || {};

  const imageBase64 = body.imageBase64;
  const mediaType = body.mediaType || "image/jpeg";
  const extra = body.extra || "";

  if (!imageBase64) {
    return res.status(400).json({
      error: "No se recibió ninguna imagen"
    });
  }

  // --------------------------------------------------
  // LIMPIAR BASE64
  // --------------------------------------------------

  // Por si el frontend manda:
  // data:image/jpeg;base64,AAAA...
  //
  // Gemini necesita solamente:
  // AAAA...

  const cleanBase64 = imageBase64.includes(",")
    ? imageBase64.split(",")[1]
    : imageBase64;

  // --------------------------------------------------
  // PROMPT DEL USUARIO
  // --------------------------------------------------

  const userPrompt = `
Analiza esta fotografía de un artículo.

${extra
    ? `Información adicional proporcionada por el usuario:
${extra}`
    : "No hay información adicional del usuario."
}

Identifica primero el artículo y después estima su precio.

Recuerda utilizar Google Search cuando sea útil para encontrar referencias
actuales del producto.

Devuelve únicamente los datos siguiendo el esquema JSON solicitado.
`;

  // --------------------------------------------------
  // URL GEMINI
  // --------------------------------------------------

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${GEMINI_MODEL}:generateContent`;

  try {
    console.log("Enviando petición a Gemini...");
    console.log("Modelo:", GEMINI_MODEL);
    console.log("Imagen:", mediaType);
    console.log("Tamaño base64:", cleanBase64.length);

    // --------------------------------------------------
    // LLAMADA A GEMINI
    // --------------------------------------------------

    const response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },

      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: SYSTEM_PROMPT
            }
          ]
        },

        contents: [
          {
            role: "user",

            parts: [
              {
                text: userPrompt
              },

              {
                inline_data: {
                  mime_type: mediaType,
                  data: cleanBase64
                }
              }
            ]
          }
        ],

        // Google Search
        tools: [
          {
            googleSearch: {}
          }
        ],

        // Respuesta JSON estructurada
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.2
        }
      })
    });

    // --------------------------------------------------
    // ERROR DE GEMINI
    // --------------------------------------------------

    if (!response.ok) {
      const errorText = await response.text();

      console.error("ERROR GEMINI:");
      console.error(errorText);

      return res.status(500).json({
        error: "Gemini ha rechazado la petición",
        gemini_status: response.status,
        detail: errorText
      });
    }

    // --------------------------------------------------
    // LEER RESPUESTA
    // --------------------------------------------------

    const data = await response.json();

    console.log("Gemini respondió correctamente");

    const candidate = data?.candidates?.[0];

    if (!candidate) {
      console.error("Gemini no devolvió candidates:", data);

      return res.status(500).json({
        error: "Gemini no devolvió ningún resultado",
        detail: JSON.stringify(data).slice(0, 2000)
      });
    }

    // --------------------------------------------------
    // EXTRAER TEXTO
    // --------------------------------------------------

    const parts = candidate?.content?.parts || [];

    const text = parts
      .map((part) => part?.text || "")
      .filter(Boolean)
      .join("");

    if (!text) {
      console.error("Gemini no devolvió texto:", data);

      return res.status(500).json({
        error: "Gemini no devolvió texto",
        detail: JSON.stringify(data).slice(0, 2000)
      });
    }

    // --------------------------------------------------
    // PARSEAR JSON
    // --------------------------------------------------

    let result;

    try {
      result = JSON.parse(text);
    } catch (parseError) {
      console.error("JSON inválido recibido de Gemini:");
      console.error(text);

      return res.status(500).json({
        error: "Gemini devolvió un JSON inválido",
        detail: text.slice(0, 2000)
      });
    }

    // --------------------------------------------------
    // FUENTES DE GOOGLE SEARCH
    // --------------------------------------------------

    const sources = [];

    const groundingChunks =
      candidate?.groundingMetadata?.groundingChunks || [];

    for (const chunk of groundingChunks) {
      if (chunk?.web?.uri) {
        sources.push({
          title: chunk.web.title || chunk.web.uri,
          url: chunk.web.uri
        });
      }
    }

    // Eliminar duplicados
    const uniqueSources = sources.filter(
      (source, index, array) =>
        index === array.findIndex(
          (item) => item.url === source.url
        )
    );

    // Máximo 5 fuentes
    result.sources = uniqueSources.slice(0, 5);

    // --------------------------------------------------
    // ASEGURAR QUE TODOS LOS CAMPOS EXISTEN
    // --------------------------------------------------

    result.item_name =
      typeof result.item_name === "string"
        ? result.item_name
        : "Artículo no identificado";

    result.item_description =
      typeof result.item_description === "string"
        ? result.item_description
        : "";

    result.vinted_low =
      Number.isFinite(result.vinted_low)
        ? result.vinted_low
        : 0;

    result.vinted_high =
      Number.isFinite(result.vinted_high)
        ? result.vinted_high
        : 0;

    result.wallapop_low =
      Number.isFinite(result.wallapop_low)
        ? result.wallapop_low
        : 0;

    result.wallapop_high =
      Number.isFinite(result.wallapop_high)
        ? result.wallapop_high
        : 0;

    result.average_price =
      Number.isFinite(result.average_price)
        ? result.average_price
        : Math.round(
            (
              result.vinted_low +
              result.vinted_high +
              result.wallapop_low +
              result.wallapop_high
            ) / 4
          );

    result.confidence =
      ["alta", "media", "baja"].includes(result.confidence)
        ? result.confidence
        : "baja";

    result.notes =
      Array.isArray(result.notes)
        ? result.notes.slice(0, 3)
        : [];

    // --------------------------------------------------
    // RESPUESTA FINAL
    // --------------------------------------------------

    console.log("Resultado final:", result);

    return res.status(200).json(result);

  } catch (error) {
    console.error("ERROR INTERNO:");
    console.error(error);

    return res.status(500).json({
      error: "Error interno del servidor",
      detail: String(error)
    });
  }
}
