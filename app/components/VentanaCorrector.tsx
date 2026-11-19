"use client";

import React, { useState } from "react";
import { Pregunta } from "../types/lectura";

interface CorreccionItem {
  nivel_0_4: number;
  estado: "Correcta" | "Parcial" | "A mejorar" | string;
  feedback: string;
}

interface ResultadoCorreccion {
  nota_global_0_4: number;
  calificacion_cualitativa: string;
  comentario_general: string;
  correcciones_literales: CorreccionItem[];
  correcciones_inferenciales: CorreccionItem[];
}

interface VentanaCorrectorProps {
  abierta: boolean;
  onCerrar: () => void;
  titulo: string;
  texto: string;
  edad: string;
  preguntasLiterales: Pregunta[];
  preguntasInferenciales: Pregunta[];
}

export default function VentanaCorrector({
  abierta,
  onCerrar,
  titulo,
  texto,
  edad,
  preguntasLiterales,
  preguntasInferenciales,
}: VentanaCorrectorProps) {
  const [respLiterales, setRespLiterales] = useState<string[]>(() =>
    preguntasLiterales.map(() => "")
  );
  const [respInferenciales, setRespInferenciales] = useState<string[]>(() =>
    preguntasInferenciales.map(() => "")
  );
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [evaluacion, setEvaluacion] = useState<ResultadoCorreccion | null>(null);

  if (!abierta) return null;

  const manejarCorreccion = async () => {
    const hayAlgunaRespuesta =
      respLiterales.some((r) => r.trim().length > 0) ||
      respInferenciales.some((r) => r.trim().length > 0);

    if (!hayAlgunaRespuesta) {
      alert("Escribe al menos una respuesta antes de pulsar en Corregir.");
      return;
    }

    setCorrigiendo(true);
    setEvaluacion(null);

    try {
      const res = await fetch("/api/corregir-lectura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo,
          texto,
          edad,
          preguntas_literales: preguntasLiterales,
          preguntas_inferenciales: preguntasInferenciales,
          respuestasAlumnoLiterales: respLiterales,
          respuestasAlumnoInferenciales: respInferenciales,
        }),
      });

      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          `El servidor devolvió estado ${res.status}. Asegúrate de que el archivo se llame app/api/corregir-lectura/route.js`
        );
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || "No se pudo realizar la corrección.");
      }
      setEvaluacion(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado al corregir.";
      alert("Error: " + msg);
    } finally {
      setCorrigiendo(false);
    }
  };

  const estiloBadge = (estado: string) => {
    const lower = estado.toLowerCase();
    if (lower.includes("correcta")) {
      return "bg-emerald-100 text-emerald-900 border-emerald-300";
    }
    if (lower.includes("parcial")) {
      return "bg-amber-100 text-amber-900 border-amber-300";
    }
    return "bg-rose-100 text-rose-900 border-rose-300";
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5 print:hidden">
      <div className="bg-white w-full max-w-6xl h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Cabecera de la Ventana */}
        <div className="bg-indigo-900 text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-bold text-indigo-200">
              IESO Sierra la Mesta · Evaluación Formativa Inclusiva (Escala 0 a 4)
            </span>
            <h2 className="text-base sm:text-lg font-extrabold truncate">
              Corrección Interactiva: {titulo}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition cursor-pointer"
          >
            ✕ Cerrar ventana
          </button>
        </div>

        {/* Cuerpo dividido en 2 columnas: Texto a la izquierda, Preguntas a la derecha */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Columna Izquierda: Texto de referencia siempre visible */}
          <div className="lg:col-span-5 bg-slate-50 border-b lg:border-b-0 lg:border-r border-slate-200 p-5 overflow-y-auto">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Texto de lectura
            </h3>
            <h4 className="text-lg font-bold text-slate-900 mb-3">{titulo}</h4>
            <div className="whitespace-pre-line text-sm leading-relaxed text-slate-700 text-justify">
              {texto}
            </div>
          </div>

          {/* Columna Derecha: Respuestas y Corrección IA */}
          <div className="lg:col-span-7 p-5 overflow-y-auto space-y-6 bg-white">
            {evaluacion && (
              <div className="bg-emerald-50/80 border-2 border-emerald-500 rounded-2xl p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-base sm:text-lg font-extrabold text-slate-900">
                    Nota Global: {evaluacion.nota_global_0_4} / 4 ·{" "}
                    <span className="text-emerald-700">
                      {evaluacion.calificacion_cualitativa}
                    </span>
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-200/80 text-emerald-950 text-[11px] font-bold">
                    Sin penalización NEAE
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {evaluacion.comentario_general}
                </p>
              </div>
            )}

            {preguntasLiterales.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-800 bg-blue-100/70 inline-block px-3 py-1 rounded-lg">
                  1. Comprensión Literal
                </h4>
                {preguntasLiterales.map((item, idx) => {
                  const corr = evaluacion?.correcciones_literales?.[idx];
                  return (
                    <div
                      key={idx}
                      className="border border-slate-200 rounded-xl p-3.5 space-y-2 bg-slate-50/40"
                    >
                      <label className="block text-sm font-semibold text-slate-900">
                        {idx + 1}. {item.pregunta}
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Escribe aquí la respuesta..."
                        value={respLiterales[idx] || ""}
                        onChange={(e) => {
                          const copia = [...respLiterales];
                          copia[idx] = e.target.value;
                          setRespLiterales(copia);
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600"
                      />
                      {corr && (
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-xs space-y-1">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md border font-bold ${estiloBadge(
                              corr.estado
                            )}`}
                          >
                            {corr.estado} ({corr.nivel_0_4}/4)
                          </span>
                          <p className="text-slate-700 leading-relaxed">{corr.feedback}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {preguntasInferenciales.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-800 bg-indigo-100/70 inline-block px-3 py-1 rounded-lg">
                  2. Comprensión Inferencial
                </h4>
                {preguntasInferenciales.map((item, idx) => {
                  const corr = evaluacion?.correcciones_inferenciales?.[idx];
                  return (
                    <div
                      key={idx}
                      className="border border-slate-200 rounded-xl p-3.5 space-y-2 bg-slate-50/40"
                    >
                      <label className="block text-sm font-semibold text-slate-900">
                        {idx + 1}. {item.pregunta}
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Escribe aquí la respuesta razonada..."
                        value={respInferenciales[idx] || ""}
                        onChange={(e) => {
                          const copia = [...respInferenciales];
                          copia[idx] = e.target.value;
                          setRespInferenciales(copia);
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600"
                      />
                      {corr && (
                        <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-xs space-y-1">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md border font-bold ${estiloBadge(
                              corr.estado
                            )}`}
                          >
                            {corr.estado} ({corr.nivel_0_4}/4)
                          </span>
                          <p className="text-slate-700 leading-relaxed">{corr.feedback}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Pie de la Ventana con botones */}
        <div className="bg-slate-100 border-t border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            disabled={corrigiendo}
            onClick={() => {
              setRespLiterales(preguntasLiterales.map(() => ""));
              setRespInferenciales(preguntasInferenciales.map(() => ""));
              setEvaluacion(null);
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Limpiar respuestas
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onCerrar}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
            >
              Volver a la lectura
            </button>
            <button
              type="button"
              disabled={corrigiendo}
              onClick={manejarCorreccion}
              className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-400 text-white text-sm font-bold shadow-sm transition cursor-pointer"
            >
              {corrigiendo ? "Corrigiendo..." : "✅ Corregir respuestas con IA"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}