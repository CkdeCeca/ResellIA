export default async function handler(req, res) {
  try {
    const apiKey = process.env.Gemini_API_Key;

    return res.status(200).json({
      ok: true,
      method: req.method,
      apiKeyConfigured: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      message: "La función de Vercel funciona correctamente"
    });
  } catch (error) {
    console.error("TEST ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
