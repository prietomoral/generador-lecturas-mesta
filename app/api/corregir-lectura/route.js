import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const ai = new GoogleGenAI();

const ESQUEMA_CORRECCION = {
  type: Type.OBJECT,
  properties: {
    nota_global_0_4: { type: Type.NUMBER },
    calificacion_cualitativa: { type: Type.STRING },
    comentario_general: { type: Type.STRING },
    correcciones_literales: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          nivel_0_4: { type: Type.NUMBER },
          estado: { type: Type.STRING },
          feedback: { type: Type.STRING },
        },
        required: ["nivel_0_4", "estado", "feedback"],
      },
    },
    correcciones_inferenciales: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          nivel_0_4: { type: Type.NUMBER },
          estado: { type: Type.STRING },
          feedback: { type: Type.STRING },
        },
        required: ["nivel_0_4", "estado", "feedback"],
      },
    },
  },
  required: [
    "nota_global_0_4",
    "calificacion_cualitativa",
    "comentario_general",
    "correcciones_literales",
    "correcciones_inferenciales",
  ],
};

const INSTRUCCIONES_SISTEMA = `
Eres un docente especialista en Comprensión Lectora y Evaluación Inclusiva del IESO Sierra la Mesta (Extremadura, España).
Evalúa las respuestas del alumnado siguiendo estrictamente estas reglas:
1. ESCALA OFICIAL (0 a 4): Usa exclusivamente valores de 0 a 4 (0-1: IN, 2: SU/BI, 3: NT, 4: SB). Nunca uses escala de 0 a 10.
2. EVALUACIÓN INCLUSIVA: Valora la comprensión lectora real. NO penalices errores de ortografía, tildes o expresión escrita propios de alumnado con NEAE.
3. TONO PEDAGÓGICO: Redacta feedback constructivo, claro, motivador y en español de España.
4. ESTADO POR PREGUNTA: Usa exactamente uno de estos valores en "estado": "Correcta", "Parcial" o "A mejorar".
`;

async function corregirConGoogle(prompt) {
  const modelosGoogle = [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
  ];

  for (const modelo of modelosGoogle) {
    try {
      const esLite = modelo.includes("lite");
      const promesa = ai.models.generateContent({
        model: modelo,
        contents: `${INSTRUCCIONES_SISTEMA}\n\n${prompt}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: ESQUEMA_CORRECCION,
          temperature: 0.3,
          ...(esLite ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
        },
      });

      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout Google")), 15000)
      );

      const response = await Promise.race([promesa, timeout]);
      const data = JSON.parse(response.text || "{}");
      if (typeof data.nota_global_0_4 === "number") {
        console.log(`✅ [corregir-lectura] Corregido con Google: ${modelo}`);
        return data;
      }
    } catch (err) {
      console.warn(`⚠️ [corregir-lectura] Saltando Google ${modelo}: ${err.message}`);
    }
  }
  return null;
}

async function corregirConGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("No hay GROQ_API_KEY configurada para respaldo.");
  }

  const modelosGroq = [
    "llama-3.3-70b-versatile",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "llama-3.1-8b-instant",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
  ];

  let ultimoError = "";

  for (const modelo of modelosGroq) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelo,
          temperature: 0.3,
          max_tokens: 2000,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `${INSTRUCCIONES_SISTEMA}
Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{
  "nota_global_0_4": 3,
  "calificacion_cualitativa": "Notable (NT)",
  "comentario_general": "string",
  "correcciones_literales": [{ "nivel_0_4": 4, "estado": "Correcta", "feedback": "string" }],
  "correcciones_inferenciales": [{ "nivel_0_4": 2, "estado": "Parcial", "feedback": "string" }]
}`,
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        if (typeof parsed.nota_global_0_4 === "number") {
          console.log(`✅ [corregir-lectura] Corregido con Groq: ${modelo}`);
          return parsed;
        }
      }

      ultimoError = `Groq ${modelo} (${res.status}): ${await res.text()}`;
    } catch (err) {
      ultimoError = err.message;
    }
  }

  throw new Error(ultimoError || "No se pudo corregir la actividad en este momento.");
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      titulo,
      texto,
      edad,
      preguntas_literales,
      preguntas_inferenciales,
      respuestasAlumnoLiterales,
      respuestasAlumnoInferenciales,
    } = body;

    const bloqueLiterales = (preguntas_literales || [])
      .map(
        (p, i) =>
          `L${i + 1}. Pregunta: "${p.pregunta}" | Respuesta modelo: "${p.respuesta}" | Respuesta del alumno/a: "${respuestasAlumnoLiterales?.[i] || "(En blanco)"}"`
      )
      .join("\n");

    const bloqueInferenciales = (preguntas_inferenciales || [])
      .map(
        (p, i) =>
          `I${i + 1}. Pregunta: "${p.pregunta}" | Respuesta modelo: "${p.respuesta}" | Respuesta del alumno/a: "${respuestasAlumnoInferenciales?.[i] || "(En blanco)"}"`
      )
      .join("\n");

    const prompt = `
Nivel del alumnado: ${edad || "ESO"}
Título de la lectura: "${titulo}"
Texto de referencia:
"""
${texto}
"""

RESPUESTAS A EVALUAR:
${bloqueLiterales ? `--- COMPRENSIÓN LITERAL ---\n${bloqueLiterales}` : ""}
${bloqueInferenciales ? `\n--- COMPRENSIÓN INFERENCIAL ---\n${bloqueInferenciales}` : ""}

Evalúa cada respuesta en escala oficial de 0 a 4 (0-1: IN, 2: SU/BI, 3: NT, 4: SB), calcula la nota global (de 0 a 4) y ofrece una retroalimentación breve y clara para cada pregunta.
`.trim();

    const resGoogle = await corregirConGoogle(prompt);
    if (resGoogle) {
      return NextResponse.json(resGoogle);
    }

    const resGroq = await corregirConGroq(prompt);
    return NextResponse.json(resGroq);
  } catch (error) {
    console.error("❌ [corregir-lectura] Error:", error);
    return NextResponse.json(
      { error: error.message || "Error al corregir las respuestas." },
      { status: 500 }
    );
  }
}