import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const ai = new GoogleGenAI();

const ESQUEMA_LECTURA = {
  type: Type.OBJECT,
  properties: {
    titulo: { type: Type.STRING },
    texto: { type: Type.STRING },
    preguntas_literales: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pregunta: { type: Type.STRING },
          respuesta: { type: Type.STRING },
        },
        required: ["pregunta", "respuesta"],
      },
    },
    preguntas_inferenciales: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pregunta: { type: Type.STRING },
          respuesta: { type: Type.STRING },
        },
        required: ["pregunta", "respuesta"],
      },
    },
  },
  required: ["titulo", "texto", "preguntas_literales", "preguntas_inferenciales"],
};

function normalizarParrafos(texto) {
  if (!texto || typeof texto !== "string") return "";
  return texto
    .replace(/\\n/g, "\n") // Convierte secuencias literales "\n" en saltos reales
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function intentarConGoogle(prompt) {
  const modelosGoogle = [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
  ];

  for (const modelo of modelosGoogle) {
    try {
      console.log(`2. [generar-lectura] Intentando con Google: ${modelo}...`);
      const esLite = modelo.includes("lite");

      const promesaGemini = ai.models.generateContent({
        model: modelo,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: ESQUEMA_LECTURA,
          temperature: 0.7,
          ...(esLite ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
        },
      });

      const promesaTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout Google (15s)")), 15000)
      );

      const response = await Promise.race([promesaGemini, promesaTimeout]);
      const data = JSON.parse(response.text || "{}");

      if (data?.titulo && (data?.preguntas_literales || data?.preguntas_inferenciales)) {
        console.log(`✅ [generar-lectura] Éxito con Google: ${modelo}`);
        return data;
      }
    } catch (err) {
      console.warn(`⚠️ [generar-lectura] Saltando Google ${modelo}: ${err.message}`);
    }
  }

  return null;
}

async function generarConGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("No hay clave GROQ_API_KEY configurada para respaldo.");
  }

  const resModelos = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!resModelos.ok) {
    throw new Error(`No se pudieron listar los modelos de Groq (${resModelos.status})`);
  }

  const listaData = await resModelos.json();
  const idsDisponibles = (listaData.data || []).map((m) => m.id);

  const candidatosTexto = idsDisponibles.filter((id) => {
    const lower = id.toLowerCase();
    const esChatValido =
      lower.includes("llama") ||
      lower.includes("gpt-oss") ||
      lower.includes("mixtral") ||
      lower.includes("gemma");

    const esExcluido =
      lower.includes("qwen") ||
      lower.includes("whisper") ||
      lower.includes("guard") ||
      lower.includes("tts") ||
      lower.includes("prompt") ||
      lower.includes("orpheus") ||
      lower.includes("audio") ||
      lower.includes("vision");

    return esChatValido && !esExcluido;
  });

  const preferencias = [
    "llama-3.3-70b",
    "llama-4-scout",
    "llama-3.1-8b",
    "gpt-oss-120b",
    "gpt-oss-20b",
    "llama-3.1-70b",
  ];

  const ordenados = [...candidatosTexto].sort((a, b) => {
    const idxA = preferencias.findIndex((p) => a.toLowerCase().includes(p));
    const idxB = preferencias.findIndex((p) => b.toLowerCase().includes(p));
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });

  if (ordenados.length === 0) {
    throw new Error("No se encontró ningún modelo rápido activo en Groq.");
  }

  let ultimoError = "";

  for (const modeloElegido of ordenados.slice(0, 5)) {
    try {
      console.log(`2d. [generar-lectura] Intentando con Groq: ${modeloElegido}...`);
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modeloElegido,
          temperature: 0.7,
          max_tokens: 2200,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `Eres un docente experto del IESO Sierra la Mesta. Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{
  "titulo": "string",
  "texto": "string (organizado en varios párrafos separados por \\n\\n)",
  "preguntas_literales": [{ "pregunta": "string", "respuesta": "string" }],
  "preguntas_inferenciales": [{ "pregunta": "string", "respuesta": "string" }]
}`,
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        if (parsed?.titulo && (parsed?.preguntas_literales || parsed?.preguntas_inferenciales)) {
          console.log(`✅ [generar-lectura] Éxito con Groq: ${modeloElegido}`);
          return parsed;
        }
      }

      const errText = await res.text();
      ultimoError = `Groq ${modeloElegido} (${res.status}): ${errText}`;
      console.warn(`⚠️ [generar-lectura] Saltando ${ultimoError}`);
    } catch (err) {
      ultimoError = err.message;
      console.warn(`⚠️ [generar-lectura] Error con Groq ${modeloElegido}: ${err.message}`);
    }
  }

  throw new Error(ultimoError || "Todos los modelos de respaldo están ocupados.");
}

export async function POST(request) {
  console.log("1. [generar-lectura] Petición recibida desde el formulario...");
  try {
    const datos = await request.json();

    const esTextoSubido =
      datos.modoOrigen === "subir" &&
      typeof datos.textoPropio === "string" &&
      datos.textoPropio.trim().length > 0;

    const textoOriginal = esTextoSubido ? datos.textoPropio.trim() : "";
    const tituloOriginal =
      esTextoSubido && typeof datos.tituloPropio === "string"
        ? datos.tituloPropio.trim()
        : "";

    const prompt = esTextoSubido
      ? `
Actúa como un docente experto en comprensión lectora del IESO Sierra la Mesta (Extremadura, España).
El docente ha proporcionado el siguiente TEXTO PROPIO para trabajar con alumnado de ${datos.edad} (complejidad de preguntas: ${datos.dificultad}).

REGLAS ESTRICTAS:
1. NO inventes ni resumas ni alteres el texto proporcionado. En el campo "texto" del JSON puedes devolver una cadena vacía "" o una breve confirmación, ya que el sistema conservará el texto original del docente.
2. ${
        tituloOriginal
          ? `Usa exactamente este título: "${tituloOriginal}".`
          : "Propón un título breve y adecuado al texto."
      }
3. Elabora exactamente ${datos.numLiterales} preguntas literales (cuya respuesta aparezca explícitamente en el texto proporcionado) y ${datos.numInferenciales} preguntas inferenciales (que requieran deducir o interpretar a partir del texto proporcionado), junto con su respuesta modelo en español de España.

--- INICIO DEL TEXTO PROPIO DEL DOCENTE ---
${textoOriginal}
--- FIN DEL TEXTO PROPIO DEL DOCENTE ---
`.trim()
      : `
Actúa como un docente experto en comprensión lectora del IESO Sierra la Mesta (Extremadura, España). Genera una actividad en español de España con:
- Edad del alumnado: ${datos.edad}
- Tipo de texto: ${datos.tipoTexto}
- Dificultad: ${datos.dificultad}
- Extensión: ${datos.extension}
- Temática: ${datos.tematica}
- Saberes/Contenidos relacionados: ${datos.saberes || "Libres"}

REGLAS DE ESTRUCTURA Y PÁRRAFOS:
- Divide la lectura en varios párrafos claros y bien estructurados (entre 3 y 6 párrafos según la extensión, respetando los puntos y aparte).
- Separa cada párrafo usando obligatoriamente un doble salto de línea (\\n\\n). Nunca escribas el texto como un único bloque continuo.

Genera exactamente ${datos.numLiterales} preguntas literales (respuesta explícita en el texto) 
y ${datos.numInferenciales} preguntas inferenciales (requieren deducción).
`.trim();

    let resultado = await intentarConGoogle(prompt);
    if (!resultado) {
      console.log("2c. [generar-lectura] Google no disponible. Iniciando cascada rápida en Groq...");
      resultado = await generarConGroq(prompt);
    }

    if (esTextoSubido) {
      resultado = {
        ...resultado,
        titulo: tituloOriginal || resultado.titulo || "Lectura de clase",
        texto: textoOriginal,
      };
    } else {
      resultado = {
        ...resultado,
        texto: normalizarParrafos(resultado.texto),
      };
    }

    return NextResponse.json(resultado);
  } catch (error) {
    console.error("❌ [generar-lectura] Error general:", error);
    return NextResponse.json(
      { error: error.message || "No se pudo generar la actividad en este momento." },
      { status: 500 }
    );
  }
}