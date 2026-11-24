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

function calcularMediaNiveles(nivelComp, nivelExpr) {
  const idxComp = Math.max(0, NIVELES_VALIDOS.indexOf(nivelComp));
  const idxExpr = Math.max(0, NIVELES_VALIDOS.indexOf(nivelExpr));
  const mediaIdx = Math.floor((idxComp + idxExpr) / 2);
  return NIVELES_VALIDOS[mediaIdx] || "No conseguido";
}

const ESQUEMA_ITEM_CORRECCION = {
  type: Type.OBJECT,
  properties: {
    nivel_comprension: {
      type: Type.STRING,
      enum: NIVELES_VALIDOS,
    },
    nivel_expresion: {
      type: Type.STRING,
      enum: NIVELES_VALIDOS,
    },
    estado: { type: Type.STRING },
    pista_comprension: { type: Type.STRING },
    consejo_redaccion: { type: Type.STRING },
  },
  required: [
    "nivel_comprension",
    "nivel_expresion",
    "estado",
    "pista_comprension",
    "consejo_redaccion",
  ],
};

const ESQUEMA_CORRECCION = {
  type: Type.OBJECT,
  properties: {
    nivel_global: {
      type: Type.STRING,
      enum: NIVELES_VALIDOS,
    },
    nivel_comprension_global: {
      type: Type.STRING,
      enum: NIVELES_VALIDOS,
    },
    nivel_expresion_global: {
      type: Type.STRING,
      enum: NIVELES_VALIDOS,
    },
    comentario_general: { type: Type.STRING },
    correcciones_literales: {
      type: Type.ARRAY,
      items: ESQUEMA_ITEM_CORRECCION,
    },
    correcciones_inferenciales: {
      type: Type.ARRAY,
      items: ESQUEMA_ITEM_CORRECCION,
    },
    correccion_resumen: {
      ...ESQUEMA_ITEM_CORRECCION,
      nullable: true,
    },
  },
  required: [
    "nivel_global",
    "nivel_comprension_global",
    "nivel_expresion_global",
    "comentario_general",
    "correcciones_literales",
    "correcciones_inferenciales",
  ],
};

const INSTRUCCIONES_SISTEMA = `
Eres un ENTRENADOR PERSONAL DE COMPETENCIA LINGÜÍSTICA (Comprensión Lectora/Oral y Expresión Escrita) del IESO Sierra la Mesta (Extremadura, España).
Tu misión NO es examinar ni dar respuestas hechas, sino entrenar al alumno/a para que descubra la solución por sí mismo y mejore su escritura.

REGLAS ESTRICTAS:
1. DESGLOSE EN DOS INDICADORES INDEPENDIENTES (SIN COMPENSARLOS ENTRE SÍ):
  - "nivel_comprension" / "nivel_comprension_global": Valora EXCLUSIVAMENTE el fondo, la exactitud, la deducción y el acierto respecto al contenido del texto/audio, aunque haya faltas de ortografía o redacción pobre.
  - "nivel_expresion" / "nivel_expresion_global": Valora EXCLUSIVAMENTE la forma: ortografía (tildes, b/v, h, mayúsculas), gramática (concordancia, tiempos verbales), puntuación y coherencia/cohesión textual (oraciones completas, conectores, ausencia de repeticiones o copia literal).
  - Una buena comprensión NUNCA debe ocultar deficiencias de escritura, y una redacción correcta NUNCA debe ocultar un error de comprensión.
2. PROHIBIDO DAR LA SOLUCIÓN: Si la respuesta o el resumen es incorrecto, incompleto o está en blanco, NUNCA escribas la respuesta correcta ni redactes el resumen por el alumno/a ni copies frases literales que resuelvan la actividad.
  - En "pista_comprension": da pistas sobre en qué parte o idea del texto fijarse o qué relación deducir.
  - En "consejo_redaccion": señala de forma concreta y constructiva qué mejorar en ortografía, puntuación, gramática o construcción de la oración (p. ej. iniciar con mayúscula, cerrar con punto, revisar tildes, construir oración completa con sujeto y predicado, usar conectores). Si está bien escrito, refuerza sus aciertos.
3. ESCALA CUALITATIVA EXCLUSIVA (SIN NÚMEROS): Usa ÚNICAMENTE uno de estos cuatro niveles exactos:
  - "No conseguido"
  - "Bajamente Conseguido"
  - "Conseguido"
  - "Altamente Conseguido"
4. ESTADO POR PREGUNTA / RESUMEN: Usa exactamente "Correcta", "Parcial" o "A mejorar".
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

function normalizarResultado(data) {
  if (!data) return null;
  const fallback = NIVELES_VALIDOS.includes(data.nivel_global)
    ? data.nivel_global
    : "Bajamente Conseguido";

  const normalizarItem = (item) => {
    const comp = NIVELES_VALIDOS.includes(item?.nivel_comprension)
      ? item.nivel_comprension
      : NIVELES_VALIDOS.includes(item?.nivel_pregunta)
      ? item.nivel_pregunta
      : "No conseguido";
    const expr = NIVELES_VALIDOS.includes(item?.nivel_expresion)
      ? item.nivel_expresion
      : NIVELES_VALIDOS.includes(item?.nivel_pregunta)
      ? item.nivel_pregunta
      : "No conseguido";

    return {
      ...item,
      nivel_comprension: comp,
      nivel_expresion: expr,
      nivel_media: calcularMediaNiveles(comp, expr),
    };
  };

  const compGlobal = NIVELES_VALIDOS.includes(data.nivel_comprension_global)
    ? data.nivel_comprension_global
    : fallback;
  const exprGlobal = NIVELES_VALIDOS.includes(data.nivel_expresion_global)
    ? data.nivel_expresion_global
    : fallback;

  return {
    ...data,
    nivel_comprension_global: compGlobal,
    nivel_expresion_global: exprGlobal,
    nivel_global: calcularMediaNiveles(compGlobal, exprGlobal),
    correcciones_literales: (data.correcciones_literales || []).map(normalizarItem),
    correcciones_inferenciales: (data.correcciones_inferenciales || []).map(normalizarItem),
    correccion_resumen: data.correccion_resumen
      ? normalizarItem(data.correccion_resumen)
      : null,
  };
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
        setTimeout(() => reject(new Error("Timeout Google")), 8000)
      );

      const response = await Promise.race([promesa, timeout]);
      const data = parsearJsonSeguro(response.text);
      if (NIVELES_VALIDOS.includes(data.nivel_global)) {
        return normalizarResultado(data);
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

  const ejemploItem = `{ "nivel_comprension": "Conseguido", "nivel_expresion": "Bajamente Conseguido", "estado": "Parcial", "pista_comprension": "string", "consejo_redaccion": "string" }`;
  const ejemploResumen = incluyeResumen
    ? `,\n  "correccion_resumen": ${ejemploItem}`
    : "";

  const urlGroq = ["https:/", "api.groq.com", "openai", "v1", "chat", "completions"].join("/");

  for (const modelo of modelosGroq) {
    try {
      const res = await fetch(urlGroq, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelo,
          temperature: 0.35,
          max_tokens: 2600,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `${INSTRUCCIONES_SISTEMA}
Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{
  "nivel_global": "Bajamente Conseguido",
  "nivel_comprension_global": "Conseguido",
  "nivel_expresion_global": "Bajamente Conseguido",
  "comentario_general": "string",
  "correcciones_literales": [${ejemploItem}],
  "correcciones_inferenciales": [${ejemploItem}]${ejemploResumen}
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
          return normalizarResultado(parsed);
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

Actúa como entrenador: desglosa cada respuesta${
      requiereResumen ? " y el resumen final en 'correccion_resumen'" : ""
    } en DOS indicadores independientes ("nivel_comprension" para el fondo/exactitud y "nivel_expresion" para ortografía, gramática, puntuación y coherencia textual) usando SOLO los 4 niveles ("No conseguido", "Bajamente Conseguido", "Conseguido", "Altamente Conseguido"). Da pistas de comprensión sin revelar la solución y consejos concretos de redacción.
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