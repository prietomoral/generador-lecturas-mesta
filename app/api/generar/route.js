import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const ai = new GoogleGenAI();

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const candidatosTexto = idsDisponibles.filter(
    (id) =>
      !id.includes("whisper") &&
      !id.includes("guard") &&
      !id.includes("tts") &&
      !id.includes("prompt")
  );

  const preferencias = ["llama-4", "llama-3.3", "llama-3.1-70b", "qwen", "llama-3.1-8b"];
  let modeloElegido = candidatosTexto[0];

  for (const pref of preferencias) {
    const encontrado = candidatosTexto.find((id) => id.toLowerCase().includes(pref));
    if (encontrado) {
      modeloElegido = encontrado;
      break;
    }
  }

  if (!modeloElegido) {
    throw new Error("No se encontró ningún modelo de texto activo en Groq.");
  }

  console.log(`2d. Usando modelo activo de Groq: ${modeloElegido}`);

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modeloElegido,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Eres un docente experto. Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
          {
            "titulo": "string",
            "texto": "string",
            "preguntas_literales": [{ "pregunta": "string", "respuesta": "string" }],
            "preguntas_inferenciales": [{ "pregunta": "string", "respuesta": "string" }]
          }`,
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error en Groq (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

export async function POST(request) {
  console.log("1. Petición recibida desde el formulario...");
  try {
    const datos = await request.json();

    const prompt = `
      Actúa como un docente experto en comprensión lectora del IESO Sierra la Mesta. Genera una actividad con:
      - Edad del alumnado: ${datos.edad}
      - Tipo de texto: ${datos.tipoTexto}
      - Dificultad: ${datos.dificultad}
      - Extensión: ${datos.extension}
      - Temática: ${datos.tematica}
      - Saberes/Contenidos relacionados: ${datos.saberes || "Libres"}
      
      Genera exactamente ${datos.numLiterales} preguntas literales (respuesta explícita en el texto) 
      y ${datos.numInferenciales} preguntas inferenciales (requieren deducción).
    `;

    const esquema = {
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

    const configuracion = {
      responseMimeType: "application/json",
      responseSchema: esquema,
      temperature: 0.7,
      thinkingConfig: { thinkingBudget: 0 },
    };

    try {
      console.log("2. Intentando con gemini-3.8-flash...");
      const promesaGemini = ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: configuracion,
      });

      const promesaTimeout = new Promise((_, reject) =>
        setTimeout(() => reject({ status: 503, message: "Timeout Gemini" }), 15000)
      );

      const response = await Promise.race([promesaGemini, promesaTimeout]);
      console.log("3. Éxito con gemini-3.8-flash.");
      return NextResponse.json(JSON.parse(response.text || "{}"));
    } catch (err) {
      console.warn(`Gemini no disponible (${err.status || err.message}). Saltando a Groq...`);
      await esperar(500);
    }

    console.log("2c. Usando servidor de respaldo Groq...");
    const resultadoGroq = await generarConGroq(prompt);
    console.log("3. Éxito con respaldo Groq.");
    return NextResponse.json(resultadoGroq);

  } catch (error) {
    console.error("Error general:", error);
    return NextResponse.json(
      { error: error.message || "No se pudo generar la actividad en este momento." },
      { status: 500 }
    );
  }
}