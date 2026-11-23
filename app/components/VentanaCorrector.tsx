"use client";

import React, { useState } from "react";
import { Pregunta } from "../types/lectura";

interface CorreccionItem {
  nivel_pregunta: string;
  estado: "Correcta" | "Parcial" | "A mejorar" | string;
  pista_comprension: string;
  consejo_redaccion: string;
}

interface ResultadoCorreccion {
  nivel_global: string;
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

  const parrafosTexto = (texto || "")
    .replace(/\\n/g, "\n")
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const manejarCorreccion = async () => {
    const hayAlgunaRespuesta =
      respLiterales.some((r) => r.trim().length > 0) ||
      respInferenciales.some((r) => r.trim().length > 0);

    if (!hayAlgunaRespuesta) {
      alert("Escribe al menos una respuesta antes de pedir ayuda al entrenador.");
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
          intentoActual: 1,
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
        throw new Error(data.error || "No se pudo evaluar la respuesta.");
      }
      setEvaluacion(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado al analizar.";
      alert("Error: " + msg);
    } finally {
      setCorrigiendo(false);
    }
  };

  const estiloNivel = (nivel: string) => {
    switch (nivel) {
      case "Altamente Conseguido":
        return "bg-emerald-100 text-emerald-950 border-emerald-400";
      case "Conseguido":
        return "bg-teal-100 text-teal-950 border-teal-400";
      case "Bajamente Conseguido":
        return "bg-amber-100 text-amber-950 border-amber-400";
      default:
        return "bg-rose-100 text-rose-950 border-rose-400";
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5 print:hidden">
      <div className="bg-white w-full max-w-6xl h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Cabecera de la Ventana */}
        <div className="bg-indigo-900 text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-bold text-indigo-200">
              IESO Sierra la Mesta · Entrenador de Comprensión y Redacción (Vista Previa Docente)
            </span>
            <h2 className="text-base sm:text-lg font-extrabold truncate">
              Entrenamiento Interactivo: {titulo}
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
            <div className="space-y-3 text-sm leading-relaxed text-slate-700 text-justify">
              {parrafosTexto.map((parrafo, idx) => (
                <p key={idx} className="indent-3">
                  {parrafo}
                </p>
              ))}
            </div>
          </div>

          {/* Columna Derecha: Respuestas y Entrenamiento IA */}
          <div className="lg:col-span-7 p-5 overflow-y-auto space-y-6 bg-white">
            {evaluacion && (
              <div
                className={`border-2 rounded-2xl p-4 space-y-2 ${estiloNivel(
                  evaluacion.nivel_global
                )}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-base sm:text-lg font-extrabold">
                    Valoración Global: <span className="underline">{evaluacion.nivel_global}</span>
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full bg-white/70 text-slate-900 text-[11px] font-bold">
                    Modo Entrenador · Sin penalización NEAE
                  </span>
                </div>
                <p className="text-sm leading-relaxed">{evaluacion.comentario_general}</p>
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
                      className="border border-slate-200 rounded-xl p-3.5 space-y-2.5 bg-slate-50/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-sm font-semibold text-slate-900">
                          {idx + 1}. {item.pregunta}
                        </label>
                        {corr && (
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${estiloNivel(
                              corr.nivel_pregunta
                            )}`}
                          >
                            {corr.nivel_pregunta}
                          </span>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        placeholder="Redacta una oración completa..."
                        value={respLiterales[idx] || ""}
                        onChange={(e) => {
                          const copia = [...respLiterales];
                          copia[idx] = e.target.value;
                          setRespLiterales(copia);
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600"
                      />
                      {corr && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <div className="text-xs bg-blue-50/80 border border-blue-200 rounded-lg p-2.5 text-blue-950">
                            <strong className="block text-blue-800 mb-0.5">
                              🧭 Pista de comprensión:
                            </strong>
                            {corr.pista_comprension}
                          </div>
                          <div className="text-xs bg-indigo-50/80 border border-indigo-200 rounded-lg p-2.5 text-indigo-950">
                            <strong className="block text-indigo-800 mb-0.5">
                              ✍️ Entrenamiento de redacción:
                            </strong>
                            {corr.consejo_redaccion}
                          </div>
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
                      className="border border-slate-200 rounded-xl p-3.5 space-y-2.5 bg-slate-50/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-sm font-semibold text-slate-900">
                          {idx + 1}. {item.pregunta}
                        </label>
                        {corr && (
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${estiloNivel(
                              corr.nivel_pregunta
                            )}`}
                          >
                            {corr.nivel_pregunta}
                          </span>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        placeholder="Redacta tu respuesta razonada..."
                        value={respInferenciales[idx] || ""}
                        onChange={(e) => {
                          const copia = [...respInferenciales];
                          copia[idx] = e.target.value;
                          setRespInferenciales(copia);
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600"
                      />
                      {corr && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <div className="text-xs bg-blue-50/80 border border-blue-200 rounded-lg p-2.5 text-blue-950">
                            <strong className="block text-blue-800 mb-0.5">
                              🧭 Pista de comprensión:
                            </strong>
                            {corr.pista_comprension}
                          </div>
                          <div className="text-xs bg-indigo-50/80 border border-indigo-200 rounded-lg p-2.5 text-indigo-950">
                            <strong className="block text-indigo-800 mb-0.5">
                              ✍️ Entrenamiento de redacción:
                            </strong>
                            {corr.consejo_redaccion}
                          </div>
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
              {corrigiendo ? "Analizando..." : "🧭 Probar entrenador IA"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}