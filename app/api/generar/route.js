import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const ai = new GoogleGenAI();

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Función de respaldo con Groq (servidores independientes de Google)
async function generarConGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("No hay clave GROQ_API_KEY configurada para respaldo.");
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
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

    // Lista de modelos de Gemini a intentar en orden
    const modelosGemini = ["gemini-3.8-flash", "gemini-3-flash-preview"];

    for (let i = 0; i < modelosGemini.length; i++) {
      const modelo = modelosGemini[i];
      try {
        console.log(`2. Intentando con ${modelo}...`);
        const response = await ai.models.generateContent({
          model: modelo,
          contents: prompt,
          config: configuracion,
        });
        console.log(`3. Éxito con ${modelo}.`);
        return NextResponse.json(JSON.parse(response.text || "{}"));
      } catch (err) {
        console.warn(`Fallo en ${modelo} (status: ${err.status}). Pasando al siguiente...`);
        await esperar(1000);
        continue;
      }
    }

    // Si todos los modelos de Gemini fallan o están saturados, activamos Groq automáticamente
    console.log("2c. Gemini no disponible. Usando servidor de respaldo Groq (Llama 3.3)...");
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