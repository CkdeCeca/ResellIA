// api/estimate.js

const GEMINI_MODEL = "gemini-3.6-flash";

const SYSTEM_PROMPT = `
Eres un experto en valoración de artículos de segunda mano en España,
especializado en Vinted y Wallapop.

Analiza la imagen y:

1. Identifica el artículo.
2. Identifica marca, modelo, color y estado si es posible.
3. Utiliza Google Search para buscar referencias actuales cuando sea útil.
4. Estima un precio conservador para Vinted.
5. Estima un precio conservador para Wallapop.
6. Calcula un precio medio.
7. Indica una confianza alta, media o baja.
8. Añade consejos útiles para vender el artículo.

No inventes marcas, modelos ni fuentes.
Si no puedes identificar algo con seguridad, indícalo.

Devuelve exclusivamente JSON.
`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    item_name: {
      type: "STRING"
    },

    item_description: {
      type: "STRING"
    },

    vinted_low: {
      type: "INTEGER"
    },

    vinted_high: {
      type: "INTEGER"
    },

    wallapop_low: {
      type: "INTEGER"
    },

    wallapop_high: {
      type: "INTEGER"
    },

    average_price: {
      type: "INTEGER"
    },

    confidence: {
      type: "STRING",
      enum: ["alta", "media", "baja"]
    },

    notes: {
      type: "ARRAY",
      items: {
        type: "STRING"
      }
    },

    sources: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: {
            type: "STRING"
          },
          url: {
            type: "STRING"
          }
        },
        required: ["title", "url"]
      }
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
    "notes",
    "sources"
  ]
};


export default async function handler(req, res) {

  // --------------------------------------------------
  // MÉTODO
  // --------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }


  // --------------------------------------------------
  // API KEY
  // --------------------------------------------------

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY no está configurada",
      help: "Comprueba Vercel > Settings > Environment Variables"
    });
  }


  // --------------------------------------------------
  // DATOS
  // --------------------------------------------------

  const body = req.body || {};

  const imageBase64 = body.imageBase64;
  const mediaType = body.mediaType || "image/jpeg";
  const extra = body.extra || "";


  if (!imageBase64) {
    return res.status(400).json({
      error: "No se recibió la imagen"
    });
  }


  // --------------------------------------------------
  // BASE64
  // --------------------------------------------------

  const cleanBase64 = imageBase64.includes(",")
    ? imageBase64.split(",")[1]
    : imageBase64;


  // --------------------------------------------------
  // PROMPT
  // --------------------------------------------------

  const userPrompt = `
${SYSTEM_PROMPT}

Información adicional del usuario:

${extra || "No se proporcionó información adicional."}

Analiza ahora la imagen adjunta.
`;


  // --------------------------------------------------
  // URL
  // --------------------------------------------------

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${GEMINI_MODEL}:generateContent`;


  try {

    console.log("=================================");
    console.log("GEMINI REQUEST");
    console.log("Modelo:", GEMINI_MODEL);
    console.log("Media type:", mediaType);
    console.log("Imagen recibida:", cleanBase64.length, "caracteres");
    console.log("=================================");


    // --------------------------------------------------
    // PETICIÓN
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

        tools: [
          {
            googleSearch: {}
          }
        ],

        generationConfig: {

          responseMimeType: "application/json",

          responseSchema: RESPONSE_SCHEMA,

          temperature: 0.2

        }

      })

    });


    // --------------------------------------------------
    // ERROR GEMINI
    // --------------------------------------------------

    if (!response.ok) {

      const errorText = await response.text();

      console.error("=================================");
      console.error("GEMINI ERROR");
      console.error("HTTP STATUS:", response.status);
      console.error(errorText);
      console.error("=================================");


      // IMPORTANTE:
      // Devolvemos el mismo código que devuelve Gemini.
      // Así podremos ver si es 400, 401, 403, 404, 429, etc.

      return res.status(response.status).json({

        error: "Gemini ha rechazado la petición",

        status: response.status,

        model: GEMINI_MODEL,

        detail: errorText

      });

    }


    // --------------------------------------------------
    // RESPUESTA
    // --------------------------------------------------

    const data = await response.json();


    console.log("Gemini respondió correctamente");


    const candidate =
      data?.candidates?.[0];


    if (!candidate) {

      console.error(
        "Gemini no devolvió candidates:",
        JSON.stringify(data)
      );

      return res.status(500).json({

        error: "Gemini no devolvió ningún resultado",

        detail: JSON.stringify(data)

      });

    }


    // --------------------------------------------------
    // TEXTO
    // --------------------------------------------------

    const parts =
      candidate?.content?.parts || [];


    const text =
      parts
        .map(part => part?.text || "")
        .filter(Boolean)
        .join("");


    if (!text) {

      return res.status(500).json({

        error: "Gemini no devolvió texto",

        detail: JSON.stringify(data)

      });

    }


    // --------------------------------------------------
    // JSON
    // --------------------------------------------------

    let result;


    try {

      result = JSON.parse(text);

    } catch (error) {

      console.error("JSON recibido:");

      console.error(text);

      return res.status(500).json({

        error: "Gemini devolvió un JSON inválido",

        detail: text

      });

    }


    // --------------------------------------------------
    // ASEGURAR CAMPOS
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
      Number(result.vinted_low) || 0;


    result.vinted_high =
      Number(result.vinted_high) || 0;


    result.wallapop_low =
      Number(result.wallapop_low) || 0;


    result.wallapop_high =
      Number(result.wallapop_high) || 0;


    result.average_price =
      Number(result.average_price) || 0;


    result.confidence =
      ["alta", "media", "baja"].includes(result.confidence)
        ? result.confidence
        : "baja";


    result.notes =
      Array.isArray(result.notes)
        ? result.notes
        : [];


    result.sources =
      Array.isArray(result.sources)
        ? result.sources
        : [];


    // --------------------------------------------------
    // PRECIO MEDIO
    // --------------------------------------------------

    if (result.average_price <= 0) {

      const prices = [

        result.vinted_low,
        result.vinted_high,
        result.wallapop_low,
        result.wallapop_high

      ].filter(price => price > 0);


      if (prices.length) {

        result.average_price =
          Math.round(
            prices.reduce(
              (sum, price) => sum + price,
              0
            ) / prices.length
          );

      }

    }


    // --------------------------------------------------
    // GOOGLE SEARCH SOURCES
    // --------------------------------------------------

    const groundingChunks =
      candidate?.groundingMetadata?.groundingChunks || [];


    if (
      result.sources.length === 0 &&
      groundingChunks.length > 0
    ) {

      result.sources =
        groundingChunks

          .filter(
            chunk =>
              chunk?.web?.uri
          )

          .slice(0, 5)

          .map(chunk => ({

            title:
              chunk.web.title ||
              chunk.web.uri,

            url:
              chunk.web.uri

          }));

    }


    // --------------------------------------------------
    // RESULTADO
    // --------------------------------------------------

    console.log("=================================");
    console.log("RESULTADO:");
    console.log(JSON.stringify(result));
    console.log("=================================");


    return res.status(200).json(result);


  } catch (error) {

    console.error("=================================");
    console.error("ERROR INTERNO");
    console.error(error);
    console.error("=================================");


    return res.status(500).json({

      error: "Error interno del servidor",

      detail:
        error instanceof Error
          ? error.message
          : String(error)

    });

  }

}
