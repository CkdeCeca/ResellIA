const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.6-flash"
];

// Aumenta el límite del cuerpo de la solicitud al máximo permitido por Vercel
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4.5mb',
    },
  },
};

const SYSTEM_PROMPT = `
Eres un tasador experto en artículos de segunda mano en España.

Analiza la fotografía del producto y determina:

1. Qué artículo es.
2. Marca.
3. Modelo si puedes identificarlo.
4. Color.
5. Estado aparente.
6. Un precio razonable de venta en Vinted.
7. Un precio razonable de venta en Wallapop.

Sé conservador. No inventes una marca o modelo si no se puede identificar.

IMPORTANTE:
- Los precios deben ser números enteros en euros.
- No escribas el símbolo € dentro de los números.
- Devuelve ÚNICAMENTE JSON.
- No escribas explicaciones fuera del JSON.

Formato obligatorio:

{
  "item_name": "nombre del artículo",
  "item_description": "descripción breve",
  "vinted_low": 0,
  "vinted_high": 0,
  "wallapop_low": 0,
  "wallapop_high": 0,
  "average_price": 0,
  "confidence": "alta",
  "notes": [
    "consejo 1",
    "consejo 2",
    "consejo 3"
  ],
  "sources": []
}
`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY no configurada");

      return res.status(500).json({
        error: "GEMINI_API_KEY no está configurada en Vercel"
      });
    }

    const body = req.body || {};

    const imageBase64 = body.imageBase64;
    const mediaType = body.mediaType;
    const extra = body.extra || "";

    if (!imageBase64 || !mediaType) {
      return res.status(400).json({
        error: "Falta la imagen"
      });
    }

    const prompt = `${SYSTEM_PROMPT}

Información adicional proporcionada por el usuario:
${extra || "Ninguna"}

Analiza ahora la fotografía.`;

    let lastError = null;

    for (const model of GEMINI_MODELS) {
      console.log(`Intentando modelo: ${model}`);

      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: prompt
              },
              {
                inline_data: {
                  mime_type: mediaType,
                  data: imageBase64
                }
              }
            ]
          }
        ],

        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
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
                  }
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
          }
        }
      };

      try {
        const response = await fetch(url, {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },

          body: JSON.stringify(requestBody)
        });

        const responseText = await response.text();

        console.log(
          `Gemini ${model} respondió ${response.status}`
        );

        if (!response.ok) {
          console.error(
            `Error Gemini ${model}:`,
            responseText
          );

          lastError = {
            status: response.status,
            body: responseText,
            model
          };

          // Si es un 429, probamos el siguiente modelo.
          if (response.status === 429) {
            continue;
          }

          // Si el modelo no existe, probamos el siguiente.
          if (response.status === 404) {
            continue;
          }

          return res.status(500).json({
            error: "Gemini rechazó la petición",
            detail: responseText,
            model
          });
        }

        let data;

        try {
          data = JSON.parse(responseText);
        } catch {
          return res.status(500).json({
            error: "Gemini devolvió una respuesta inválida",
            detail: responseText.slice(0, 1000)
          });
        }

        const candidate = data.candidates?.[0];

        if (!candidate) {
          return res.status(500).json({
            error: "Gemini no devolvió ningún resultado",
            detail: JSON.stringify(data).slice(0, 1000)
          });
        }

        const parts = candidate.content?.parts || [];

        const text = parts
          .map(part => part.text || "")
          .join("")
          .trim();

        if (!text) {
          return res.status(500).json({
            error: "Gemini no devolvió texto",
            detail: JSON.stringify(data).slice(0, 1000)
          });
        }

        let result;

        try {
          result = JSON.parse(text);
        } catch (error) {
          console.error("JSON recibido de Gemini:", text);

          return res.status(500).json({
            error: "Gemini no devolvió JSON válido",
            detail: text.slice(0, 1000)
          });
        }

        // Seguridad: evitar undefined en la interfaz.
        result.item_name =
          result.item_name || "Artículo no identificado";

        result.item_description =
          result.item_description ||
          "No se pudo determinar con precisión el artículo.";

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
          result.confidence || "baja";

        result.notes =
          Array.isArray(result.notes)
            ? result.notes
            : [];

        result.sources =
          Array.isArray(result.sources)
            ? result.sources
            : [];

        console.log(
          `Estimación realizada correctamente con ${model}`
        );

        return res.status(200).json(result);

      } catch (error) {
        console.error(
          `Error usando ${model}:`,
          error
        );

        lastError = {
          model,
          error: String(error)
        };
      }
    }

    console.error(
      "Todos los modelos fallaron:",
      lastError
    );

    return res.status(503).json({
      error: "Gemini no está disponible en este momento",
      detail: lastError
    });

  } catch (error) {
    console.error("Error general /api/estimate:", error);

    return res.status(500).json({
      error: "Error interno del servidor",
      detail: String(error)
    });
  }
}
