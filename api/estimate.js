// /api/estimate.js
// Función Serverless para Vercel
// Gemini 2.5 Flash + visión + Google Search
//
// IMPORTANTE
// - La API key NO se escribe aquí.
// - Debe estar en Vercel > Settings > Environment Variables
// - Nombre de la variable: GEMINI_API_KEY

const GEMINI_MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `
Eres un tasador experto en ropa, calzado, accesorios y objetos de segunda mano
en el mercado español, especializado en Vinted y Wallapop.

Tu objetivo es identificar el artículo de la fotografía y estimar un precio
realista de venta de segunda mano en España.

PROCESO:

1. Analiza cuidadosamente la fotografía.
   Identifica:
   - tipo de artículo
   - marca
   - modelo
   - color
   - estado
   - características visibles

2. Utiliza Google Search cuando sea útil para encontrar referencias reales.

3. Busca varias referencias relacionadas con el artículo identificado.
   Ejemplos:
   - "[marca] [modelo] segunda mano precio España"
   - "[marca] [modelo] Vinted"
   - "[marca] [modelo] Wallapop"
   - "[marca] [modelo] precio"
   - "[marca] [modelo] retail"

4. Diferencia entre precio original y precio de segunda mano.

5. Da un rango conservador para Vinted y otro para Wallapop.

6. Si no puedes identificar exactamente el modelo, utiliza artículos
   comparables y reduce la confianza.

7. NO inventes fuentes.
   Si utilizas resultados de búsqueda útiles, inclúyelos en sources.

8. Todos los precios deben ser números enteros en euros.
   NO incluyas el símbolo € dentro de los números.

9. El campo average_price debe ser un número calculado a partir de los
   rangos de Vinted y Wallapop.

10. Responde únicamente con el objeto JSON solicitado.
`;

const responseSchema = {
  type: 'OBJECT',

  properties: {
    item_name: {
      type: 'STRING',
      description: 'Nombre corto y claro del artículo identificado.'
    },

    item_description: {
      type: 'STRING',
      description:
        'Descripción de 1-2 frases incluyendo tipo, marca, modelo si se conoce, color y estado.'
    },

    vinted_low: {
      type: 'INTEGER',
      description: 'Precio mínimo razonable de venta en Vinted en euros.'
    },

    vinted_high: {
      type: 'INTEGER',
      description: 'Precio máximo razonable de venta en Vinted en euros.'
    },

    wallapop_low: {
      type: 'INTEGER',
      description: 'Precio mínimo razonable de venta en Wallapop en euros.'
    },

    wallapop_high: {
      type: 'INTEGER',
      description: 'Precio máximo razonable de venta en Wallapop en euros.'
    },

    average_price: {
      type: 'INTEGER',
      description: 'Precio medio recomendado en euros.'
    },

    confidence: {
      type: 'STRING',
      enum: ['alta', 'media', 'baja'],
      description: 'Nivel de confianza de la estimación.'
    },

    notes: {
      type: 'ARRAY',
      items: {
        type: 'STRING'
      },
      description:
        'Consejos prácticos para vender mejor el artículo.'
    },

    sources: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: {
            type: 'STRING'
          },
          url: {
            type: 'STRING'
          }
        },
        required: ['title', 'url']
      },
      description: 'Fuentes web utilizadas para la estimación.'
    }
  },

  required: [
    'item_name',
    'item_description',
    'vinted_low',
    'vinted_high',
    'wallapop_low',
    'wallapop_high',
    'average_price',
    'confidence',
    'notes',
    'sources'
  ]
};


// ------------------------------------------------------------
// FUNCIÓN PRINCIPAL
// ------------------------------------------------------------

export default async function handler(req, res) {

  // Solo permitimos POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Método no permitido'
    });
  }


  // ----------------------------------------------------------
  // CONTRASEÑA OPCIONAL
  // ----------------------------------------------------------

  const requiredPassword = process.env.APP_PASSWORD;

  if (requiredPassword) {

    const givenPassword = req.headers['x-app-password'];

    if (givenPassword !== requiredPassword) {
      return res.status(401).json({
        error: 'Código de acceso incorrecto'
      });
    }
  }


  // ----------------------------------------------------------
  // API KEY
  // ----------------------------------------------------------

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {

    console.error('GEMINI_API_KEY no está configurada');

    return res.status(500).json({
      error: 'Falta configurar GEMINI_API_KEY en Vercel'
    });
  }


  // ----------------------------------------------------------
  // DATOS RECIBIDOS
  // ----------------------------------------------------------

  const body = req.body || {};

  const imageBase64 = body.imageBase64;
  const mediaType = body.mediaType;
  const extra = body.extra || '';


  if (!imageBase64) {

    return res.status(400).json({
      error: 'Falta la imagen'
    });
  }


  if (!mediaType) {

    return res.status(400).json({
      error: 'Falta el tipo MIME de la imagen'
    });
  }


  // ----------------------------------------------------------
  // PROMPT FINAL
  // ----------------------------------------------------------

  const userText = `
${SYSTEM_PROMPT}

Información adicional proporcionada por el usuario:

${extra || 'No hay información adicional.'}

Analiza ahora la imagen adjunta.

IMPORTANTE:
Debes devolver SIEMPRE todos estos campos:

item_name
item_description
vinted_low
vinted_high
wallapop_low
wallapop_high
average_price
confidence
notes
sources
`;


  // ----------------------------------------------------------
  // LLAMADA A GEMINI
  // ----------------------------------------------------------

  try {

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;


    const requestBody = {

      contents: [
        {
          role: 'user',

          parts: [
            {
              text: userText
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


      // Google Search
      tools: [
        {
          google_search: {}
        }
      ],


      // Respuesta JSON estructurada
      generationConfig: {

        response_mime_type: 'application/json',

        response_schema: responseSchema,

        temperature: 0.2,

        max_output_tokens: 4096
      }
    };


    console.log('Enviando petición a Gemini...');


    const response = await fetch(url, {

      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },

      body: JSON.stringify(requestBody)
    });


    // --------------------------------------------------------
    // ERROR DE GEMINI
    // --------------------------------------------------------

    if (!response.ok) {

      const errorText = await response.text();

      console.error('GEMINI ERROR:', errorText);

      return res.status(500).json({
        error: 'Error al llamar a la API de Gemini',
        detail: errorText
      });
    }


    // --------------------------------------------------------
    // RESPUESTA DE GEMINI
    // --------------------------------------------------------

    const data = await response.json();


    console.log(
      'Gemini respondió correctamente'
    );


    const candidate =
      data.candidates?.[0];


    if (!candidate) {

      console.error(
        'Gemini no devolvió candidates:',
        JSON.stringify(data)
      );

      return res.status(500).json({
        error: 'Gemini no devolvió ningún resultado'
      });
    }


    const parts =
      candidate.content?.parts || [];


    const fullText =
      parts
        .map(part => part.text)
        .filter(Boolean)
        .join('');


    if (!fullText) {

      console.error(
        'Gemini no devolvió texto:',
        JSON.stringify(data)
      );

      return res.status(500).json({
        error: 'Gemini no devolvió texto',
        detail: JSON.stringify(data).slice(0, 2000)
      });
    }


    // --------------------------------------------------------
    // PARSEAR JSON
    // --------------------------------------------------------

    let parsed;


    try {

      parsed = JSON.parse(fullText);

    } catch (parseError) {

      console.error(
        'JSON recibido de Gemini:',
        fullText
      );

      return res.status(500).json({
        error: 'Gemini devolvió un JSON inválido',
        detail: fullText.slice(0, 2000)
      });
    }


    // --------------------------------------------------------
    // NORMALIZACIÓN
    // --------------------------------------------------------
    // Esto evita que el frontend reciba undefined.

    const result = {

      item_name:
        typeof parsed.item_name === 'string'
          ? parsed.item_name
          : 'Artículo no identificado',


      item_description:
        typeof parsed.item_description === 'string'
          ? parsed.item_description
          : 'No se ha podido determinar una descripción precisa.',


      vinted_low:
        Number.isFinite(Number(parsed.vinted_low))
          ? Math.round(Number(parsed.vinted_low))
          : 0,


      vinted_high:
        Number.isFinite(Number(parsed.vinted_high))
          ? Math.round(Number(parsed.vinted_high))
          : 0,


      wallapop_low:
        Number.isFinite(Number(parsed.wallapop_low))
          ? Math.round(Number(parsed.wallapop_low))
          : 0,


      wallapop_high:
        Number.isFinite(Number(parsed.wallapop_high))
          ? Math.round(Number(parsed.wallapop_high))
          : 0,


      average_price:
        Number.isFinite(Number(parsed.average_price))
          ? Math.round(Number(parsed.average_price))
          : 0,


      confidence:
        ['alta', 'media', 'baja'].includes(parsed.confidence)
          ? parsed.confidence
          : 'baja',


      notes:
        Array.isArray(parsed.notes)
          ? parsed.notes.filter(
              item => typeof item === 'string'
            )
          : [],


      sources:
        Array.isArray(parsed.sources)
          ? parsed.sources
              .filter(
                source =>
                  source &&
                  typeof source.title === 'string' &&
                  typeof source.url === 'string'
              )
              .slice(0, 5)
          : []
    };


    // --------------------------------------------------------
    // FUENTES DE GOOGLE SEARCH
    // --------------------------------------------------------

    const groundingChunks =
      candidate.groundingMetadata?.groundingChunks || [];


    if (
      result.sources.length === 0 &&
      groundingChunks.length > 0
    ) {

      result.sources =
        groundingChunks

          .filter(
            chunk =>
              chunk.web &&
              chunk.web.uri
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


    // --------------------------------------------------------
    // CORRECCIÓN DEL PRECIO MEDIO
    // --------------------------------------------------------
    // Si Gemini devuelve 0 o un valor absurdo,
    // calculamos uno nosotros.

    const allPrices = [
      result.vinted_low,
      result.vinted_high,
      result.wallapop_low,
      result.wallapop_high
    ].filter(
      price =>
        Number.isFinite(price) &&
        price > 0
    );


    if (
      result.average_price <= 0 &&
      allPrices.length > 0
    ) {

      result.average_price =
        Math.round(
          allPrices.reduce(
            (sum, price) => sum + price,
            0
          ) / allPrices.length
        );
    }


    // --------------------------------------------------------
    // LOG FINAL
    // --------------------------------------------------------

    console.log(
      'Resultado final:',
      JSON.stringify(result)
    );


    // --------------------------------------------------------
    // RESPUESTA AL FRONTEND
    // --------------------------------------------------------

    return res.status(200).json(result);


  } catch (error) {

    console.error(
      'ERROR INTERNO:',
      error
    );


    return res.status(500).json({

      error: 'Error interno del servidor',

      detail:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
}
