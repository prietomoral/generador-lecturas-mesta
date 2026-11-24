import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const ai = new GoogleGenAI();

const NIVELES_VALIDOS = [
  "No conseguido",
  "Bajamente Conseguido",
  "Conseguido",
  "Altamente Conseguido",
];

const ESQUEMA_CORRECCION = {
  type: Type.OBJECT,
  properties: {
    nivel_global: {
      type: Type.STRING,
      enum: NIVELES_VALIDOS,
    },
    comentario_general: { type: Type.STRING },
    correcciones_literales: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          nivel_pregunta: {
            type: Type.STRING,
            enum: NIVELES_VALIDOS,
          },
          estado: { type: Type.STRING },
          pista_comprension: { type: Type.STRING },
          consejo_redaccion: { type: Type.STRING },
        },
        required: [
          "nivel_pregunta",
          "estado",
          "pista_comprension",
          "consejo_redaccion",
        ],
      },
    },
    correcciones_inferenciales: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          nivel_pregunta: {
            type: Type.STRING,
            enum: NIVELES_VALIDOS,
          },
          estado: { type: Type.STRING },
          pista_comprension: { type: Type.STRING },
          consejo_redaccion: { type: Type.STRING },
        },
        required: [
          "nivel_pregunta",
          "estado",
          "pista_comprension",
          "consejo_redaccion",
        ],
      },
    },
    correccion_resumen: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        nivel_pregunta: {
          type: Type.STRING,
          enum: NIVELES_VALIDOS,
        },
        estado: { type: Type.STRING },
        pista_comprension: { type: Type.STRING },
        consejo_redaccion: { type: Type.STRING },
      },
      required: [
        "nivel_pregunta",
        "estado",
        "pista_comprension",
        "consejo_redaccion",
      ],
    },
  },
  required: [
    "nivel_global",
    "comentario_general",
    "correcciones_literales",
    "correcciones_inferenciales",
  ],
};

const INSTRUCCIONES_SISTEMA = `
Eres un ENTRENADOR PERSONAL DE COMPRENSIÓN LECTORA Y REDACCIÓN del IESO Sierra la Mesta (Extremadura, España).
Tu misión NO es examinar ni dar respuestas hechas, sino entrenar al alumno/a para que descubra la solución por sí mismo y mejore su forma de redactar.

REGLAS ESTRICTAS:
1. PROHIBIDO DAR LA SOLUCIÓN: Si la respuesta o el resumen es incorrecto, incompleto o está en blanco, NUNCA escribas la respuesta correcta ni redactes el resumen por el alumno/a ni copies frases literales que resuelvan la actividad. Da pistas sobre en qué parte o idea del texto fijarse o qué idea principal falta integrar.
2. ENTRENAMIENTO EN REDACCIÓN: En "consejo_redaccion", ayuda al alumno/a a mejorar cómo expresa su idea (por ejemplo: empezar respondiendo con parte de la pregunta, construir una oración completa con sentido, usar conectores como "porque", "debido a", evitar respuestas telegráficas o copia literal excesiva del texto). Si ya está bien redactada, refuerza qué ha hecho bien.
3. EVALUACIÓN DEL RESUMEN (SI SE SOLICITA): Cuando haya actividad de resumen, evalúa en "correccion_resumen" si recoge las ideas principales del texto con cohesión y palabras propias sin copiar bloques literales.
4. EVALUACIÓN INCLUSIVA (NEAE): Valora el sentido y la estructura de la idea. NO penalices faltas de ortografía o tildes.
5. ESCALA CUALITATIVA EXCLUSIVA (SIN NÚMEROS): Tanto en "nivel_global" como en cada "nivel_pregunta" usa ÚNICAMENTE uno de estos cuatro niveles exactos:
  - "No conseguido"
  - "Bajamente Conseguido"
  - "Conseguido"
  - "Altamente Conseguido"
6. ESTADO POR PREGUNTA / RESUMEN: Usa exactamente "Correcta", "Parcial" o "A mejorar".
`;

function contarPalabras(texto) {
  const limpio = (texto || "").trim();
  if (!limpio) return 0;
  return limpio.split(/\s+/).filter(Boolean).length;
}

function parsearJsonSeguro(texto) {
  const limpio = (texto || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio === -1 || fin === -1) {
    throw new Error("Respuesta sin formato JSON válido.");
  }
  return JSON.parse(limpio.slice(inicio, fin + 1));
}

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
          temperature: 0.35,
          ...(esLite ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
        },
      });

      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout Google")), 15000)
      );

      const response = await Promise.race([promesa, timeout]);
      const data = parsearJsonSeguro(response.text);
      if (NIVELES_VALIDOS.includes(data.nivel_global)) {
        return data;
      }
    } catch (err) {
      console.warn(`⚠️ [corregir-lectura] Saltando Google ${modelo}:${err.message}`);
    }
  }
  return null;
}

async function corregirConGroq(prompt, incluyeResumen) {
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

  const ejemploResumen = incluyeResumen
    ? `,\n  "correccion_resumen": { "nivel_pregunta": "Conseguido", "estado": "Correcta", "pista_comprension": "string", "consejo_redaccion": "string" }`
    : "";

  for (const modelo of modelosGroq) {
    try {
      const res = await fetch("[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelo,
          temperature: 0.35,
          max_tokens: 2400,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `${INSTRUCCIONES_SISTEMA}
Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{
  "nivel_global": "Bajamente Conseguido",
  "comentario_general": "string",
  "correcciones_literales": [{ "nivel_pregunta": "Conseguido", "estado": "Correcta", "pista_comprension": "string", "consejo_redaccion": "string" }],
  "correcciones_inferenciales": [{ "nivel_pregunta": "No conseguido", "estado": "A mejorar", "pista_comprension": "string", "consejo_redaccion": "string" }]${ejemploResumen}
}`,
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const parsed = parsearJsonSeguro(data.choices[0].message.content);
        if (NIVELES_VALIDOS.includes(parsed.nivel_global)) {
          return parsed;
        }
      }

      ultimoError = `Groq ${modelo} (${res.status}):${await res.text()}`;
    } catch (err) {
      ultimoError = err.message;
    }
  }

  throw new Error(ultimoError || "No se pudo evaluar la actividad en este momento.");
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      titulo,
      texto,
      edad,
      intentoActual,
      preguntas_literales,
      preguntas_inferenciales,
      respuestasAlumnoLiterales,
      respuestasAlumnoInferenciales,
      resumenMinPalabras = 0,
      resumenModelo = "",
      respuestaAlumnoResumen = "",
    } = body;

    const minPalabras = Number(resumenMinPalabras) || 0;
    const requiereResumen = minPalabras > 0;

    if (requiereResumen) {
      const palabrasEscritas = contarPalabras(respuestaAlumnoResumen);
      if (palabrasEscritas < minPalabras) {
        return NextResponse.json(
          {
            error: `El resumen es obligatorio y debe tener al menos ${minPalabras} palabras (llevas ${palabrasEscritas}).`,
          },
          { status: 400 }
        );
      }
    }

    const bloqueLiterales = (preguntas_literales || [])
      .map(
        (p, i) =>
          `L${i + 1}. Pregunta: "${p.pregunta}" | Respuesta modelo (SOLO PARA TI, NO LA REVELES): "${p.respuesta}" | Respuesta del alumno/a: "${respuestasAlumnoLiterales?.[i] || "(En blanco)"}"`
      )
      .join("\n");

    const bloqueInferenciales = (preguntas_inferenciales || [])
      .map(
        (p, i) =>
          `I${i + 1}. Pregunta: "${p.pregunta}" | Respuesta modelo (SOLO PARA TI, NO LA REVELES): "${p.respuesta}" | Respuesta del alumno/a: "${respuestasAlumnoInferenciales?.[i] || "(En blanco)"}"`
      )
      .join("\n");

    const bloqueResumen = requiereResumen
      ? `\n--- ACTIVIDAD FINAL: REDACCIÓN DE RESUMEN (MÍNIMO ${minPalabras} PALABRAS) ---\n` +
        (resumenModelo
          ? `Resumen modelo de referencia (SOLO PARA TI, NO LO REVELES): "${resumenModelo}"\n`
          : "") +
        `Resumen redactado por el alumno/a (${contarPalabras(respuestaAlumnoResumen)} palabras): "${respuestaAlumnoResumen}"`
      : "";

    const prompt = `
Nivel del alumnado: ${edad || "ESO"}
Intento número: ${intentoActual || 1} de 10
Título de la lectura: "${titulo}"
Texto de referencia:
"""
${texto}
"""

RESPUESTAS DEL ALUMNO/A A ENTRENAR:
${bloqueLiterales ? `--- COMPRENSIÓN LITERAL ---\n${bloqueLiterales}` : ""}
${bloqueInferenciales ? `\n--- COMPRENSIÓN INFERENCIAL ---\n${bloqueInferenciales}` : ""}${bloqueResumen}

Actúa como entrenador: evalúa cada respuesta${
      requiereResumen ? " y el resumen final en 'correccion_resumen'" : ""
    } usando SOLO los 4 niveles ("No conseguido", "Bajamente Conseguido", "Conseguido", "Altamente Conseguido"), da una pista sin revelar la solución cuando falte algo y ofrece un consejo práctico para mejorar la redacción.
`.trim();

    const resGoogle = await corregirConGoogle(prompt);
    if (resGoogle) {
      return NextResponse.json(resGoogle);
    }

    const resGroq = await corregirConGroq(prompt, requiereResumen);
    return NextResponse.json(resGroq);
  } catch (error) {
    console.error("❌ [corregir-lectura] Error:", error);
    return NextResponse.json(
      { error: error.message || "Error al analizar las respuestas." },
      { status: 500 }
    );
  }
}