"use client";

import React, { useState } from "react";
import { MediaTipo, Pregunta } from "../types/lectura";

interface CorreccionItem {
  nivel_comprension: string;
  nivel_expresion: string;
  nivel_media?: string;
  estado: "Correcta" | "Parcial" | "A mejorar" | string;
  pista_comprension: string;
  consejo_redaccion: string;
}

interface ResultadoCorreccion {
  nivel_global: string;
  nivel_comprension_global: string;
  nivel_expresion_global: string;
  comentario_general: string;
  correcciones_literales: CorreccionItem[];
  correcciones_inferenciales: CorreccionItem[];
  correccion_resumen?: CorreccionItem | null;
}

interface VentanaCorrectorProps {
  abierta: boolean;
  onCerrar: () => void;
  titulo: string;
  texto: string;
  edad: string;
  pdfPreviewUrl?: string | null;
  mediaUrl?: string | null;
  mediaTipo?: MediaTipo | null;
  preguntasLiterales: Pregunta[];
  preguntasInferenciales: Pregunta[];
  resumenMinPalabras?: number;
  resumenModelo?: string;
}

const NIVELES_ESCALA = [
  "No conseguido",
  "Bajamente Conseguido",
  "Conseguido",
  "Altamente Conseguido",
];

function calcularMediaNiveles(nivelComp: string, nivelExpr: string): string {
  const idxComp = Math.max(0, NIVELES_ESCALA.indexOf(nivelComp));
  const idxExpr = Math.max(0, NIVELES_ESCALA.indexOf(nivelExpr));
  const mediaIdx = Math.floor((idxComp + idxExpr) / 2);
  return NIVELES_ESCALA[mediaIdx] || "No conseguido";
}

function contarPalabras(texto: string): number {
  const limpio = texto.trim();
  if (!limpio) return 0;
  return limpio.split(/\s+/).filter(Boolean).length;
}

export default function VentanaCorrector({
  abierta,
  onCerrar,
  titulo,
  texto,
  edad,
  pdfPreviewUrl,
  mediaUrl,
  mediaTipo,
  preguntasLiterales,
  preguntasInferenciales,
  resumenMinPalabras = 0,
  resumenModelo = "",
}: VentanaCorrectorProps) {
  const [respLiterales, setRespLiterales] = useState<string[]>(() =>
    preguntasLiterales.map(() => "")
  );
  const [respInferenciales, setRespInferenciales] = useState<string[]>(() =>
    preguntasInferenciales.map(() => "")
  );
  const [respResumen, setRespResumen] = useState("");
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [evaluacion, setEvaluacion] = useState<ResultadoCorreccion | null>(null);
  const [vistaLectura, setVistaLectura] = useState<"original" | "texto">("original");

  if (!abierta) return null;

  const requiereResumen = resumenMinPalabras > 0;
  const palabrasActualesResumen = contarPalabras(respResumen);
  const resumenCumpleMinimo =
    !requiereResumen || palabrasActualesResumen >= resumenMinPalabras;
  const palabrasFaltantes = Math.max(0, resumenMinPalabras - palabrasActualesResumen);

  const parrafosTexto = (texto || "")
    .replace(/\\n/g, "\n")
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const manejarCorreccion = async () => {
    if (requiereResumen && !resumenCumpleMinimo) {
      alert(
        `El resumen es obligatorio y debe tener al menos ${resumenMinPalabras} palabras (llevas ${palabrasActualesResumen}).`
      );
      return;
    }

    const hayAlgunaRespuesta =
      respLiterales.some((r) => r.trim().length > 0) ||
      respInferenciales.some((r) => r.trim().length > 0) ||
      (requiereResumen && respResumen.trim().length > 0);

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
          resumenMinPalabras,
          resumenModelo,
          respuestaAlumnoResumen: requiereResumen ? respResumen : undefined,
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

  const renderBloqueFeedbackEstructurado = (
    corr: CorreccionItem,
    subtituloComp: string,
    subtituloExpr: string
  ) => {
    const mediaItem =
      corr.nivel_media ||
      calcularMediaNiveles(corr.nivel_comprension, corr.nivel_expresion);

    return (
      <div className="space-y-2.5 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Apartado 1: Comprensión + Indicador debajo */}
          <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-3 flex flex-col justify-between gap-2.5 text-blue-950">
            <div className="text-xs leading-relaxed">
              <strong className="block text-blue-900 mb-1">
                🧭 {subtituloComp}
              </strong>
              <p>{corr.pista_comprension}</p>
            </div>
            <div className="pt-2 border-t border-blue-200/80 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-blue-900">
                Indicador de logro:
              </span>
              <span
                className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${estiloNivel(
                  corr.nivel_comprension
                )}`}
              >
                {corr.nivel_comprension}
              </span>
            </div>
          </div>

          {/* Apartado 2: Expresión escrita + Indicador debajo */}
          <div className="bg-indigo-50/80 border border-indigo-200 rounded-lg p-3 flex flex-col justify-between gap-2.5 text-indigo-950">
            <div className="text-xs leading-relaxed">
              <strong className="block text-indigo-900 mb-1">
                ✍️ {subtituloExpr}
              </strong>
              <p>{corr.consejo_redaccion}</p>
            </div>
            <div className="pt-2 border-t border-indigo-200/80 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-indigo-900">
                Indicador de logro:
              </span>
              <span
                className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${estiloNivel(
                  corr.nivel_expresion
                )}`}
              >
                {corr.nivel_expresion}
              </span>
            </div>
          </div>
        </div>

        {/* Valoración media de ambos apartados */}
        <div className="bg-slate-100/90 border border-slate-300 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-700">
            ⚖️ Valoración media de la respuesta (Comprensión + Expresión):
          </span>
          <span
            className={`text-xs font-extrabold px-3 py-0.5 rounded-full border ${estiloNivel(
              mediaItem
            )}`}
          >
            {mediaItem}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5 print:hidden">
      <div className="bg-white w-full max-w-6xl h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Cabecera de la Ventana */}
        <div className="bg-indigo-900 text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-bold text-indigo-200 block">
              DialectIA · IESO Sierra la Mesta · Entrenador de Competencia Lingüística — Programa NEXO (Educalectura-Educalem)
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

        {/* Cuerpo dividido en 2 columnas */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Columna Izquierda */}
          <div className="lg:col-span-5 bg-slate-50 border-b lg:border-b-0 lg:border-r border-slate-200 p-5 overflow-y-auto flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {mediaUrl ? "Recurso audiovisual" : "Documento de lectura"}
              </h3>
              {!mediaUrl && pdfPreviewUrl && (
                <div className="inline-flex bg-slate-200/80 p-0.5 rounded-lg text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setVistaLectura("original")}
                    className={`px-2 py-1 rounded-md transition cursor-pointer ${
                      vistaLectura === "original"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    📑 PDF original
                  </button>
                  <button
                    type="button"
                    onClick={() => setVistaLectura("texto")}
                    className={`px-2 py-1 rounded-md transition cursor-pointer ${
                      vistaLectura === "texto"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    📝 Texto
                  </button>
                </div>
              )}
            </div>

            <h4 className="text-lg font-bold text-slate-900 mb-3">{titulo}</h4>

            {mediaUrl ? (
              <div className="space-y-3">
                {mediaTipo === "youtube" && (
                  <div className="w-full aspect-video rounded-xl overflow-hidden border border-slate-300 bg-black shadow-inner">
                    <iframe
                      src={mediaUrl}
                      title={titulo}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                )}
                {mediaTipo === "video" && (
                  <video
                    controls
                    src={mediaUrl}
                    className="w-full rounded-xl border border-slate-300 bg-black"
                  />
                )}
                {mediaTipo === "audio" && (
                  <div className="bg-white border border-teal-200 rounded-xl p-4">
                    <audio controls src={mediaUrl} className="w-full" />
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  Escucha o visualiza el fragmento tantas veces como necesites y responde a las actividades de la derecha.
                </p>
              </div>
            ) : pdfPreviewUrl && vistaLectura === "original" ? (
              <div className="flex-1 min-h-[360px] rounded-xl overflow-hidden border border-slate-300 bg-slate-200 shadow-inner">
                <iframe
                  src={`${pdfPreviewUrl}#toolbar=1&navpanes=0`}
                  title="PDF original en entrenador"
                  className="w-full h-full"
                />
              </div>
            ) : (
              <div className="space-y-3 text-sm leading-relaxed text-slate-700 text-justify">
                {parrafosTexto.map((parrafo, idx) => (
                  <p key={idx} className="indent-3">
                    {parrafo}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Columna Derecha */}
          <div className="lg:col-span-7 p-5 overflow-y-auto space-y-6 bg-white">
            {/* PANEL DESGLOSADO DE RESULTADOS GLOBALES */}
            {evaluacion && (() => {
              const mediaGlobal = calcularMediaNiveles(
                evaluacion.nivel_comprension_global,
                evaluacion.nivel_expresion_global
              );
              return (
                <div className="border-2 border-slate-300 bg-slate-50/70 rounded-2xl p-4 space-y-3">
                  <h4 className="text-sm sm:text-base font-extrabold text-slate-900">
                    Resultados Globales de la Actividad
                  </h4>

                  <p className="text-sm leading-relaxed text-slate-700">
                    {evaluacion.comentario_general}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-white border border-blue-200 rounded-xl p-3 flex flex-col justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                          1. {mediaUrl ? "Comprensión Oral" : "Comprensión Lectora"} (Fondo)
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Exactitud, localización y deducción de ideas del contenido.
                        </p>
                      </div>
                      <div className="pt-2 border-t border-blue-100 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-blue-900">
                          Indicador:
                        </span>
                        <span
                          className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${estiloNivel(
                            evaluacion.nivel_comprension_global
                          )}`}
                        >
                          {evaluacion.nivel_comprension_global}
                        </span>
                      </div>
                    </div>

                    <div className="bg-white border border-indigo-200 rounded-xl p-3 flex flex-col justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">
                          2. Expresión Escrita / Redacción (Forma)
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Ortografía, gramática, puntuación y coherencia textual.
                        </p>
                      </div>
                      <div className="pt-2 border-t border-indigo-100 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-indigo-900">
                          Indicador:
                        </span>
                        <span
                          className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${estiloNivel(
                            evaluacion.nivel_expresion_global
                          )}`}
                        >
                          {evaluacion.nivel_expresion_global}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Valoración general (media de ambos) */}
                  <div className="bg-white border-2 border-slate-300 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 block">
                        Valoración General (Media de Comprensión y Expresión)
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Calculada a partir de los dos indicadores independientes
                      </span>
                    </div>
                    <span
                      className={`px-3.5 py-1 rounded-full text-xs sm:text-sm font-extrabold border ${estiloNivel(
                        mediaGlobal
                      )}`}
                    >
                      {mediaGlobal}
                    </span>
                  </div>
                </div>
              );
            })()}

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
                      <label className="block text-sm font-semibold text-slate-900">
                        {idx + 1}. {item.pregunta}
                      </label>
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
                      {corr &&
                        renderBloqueFeedbackEstructurado(
                          corr,
                          "Comprensión (fondo y contenido):",
                          "Expresión escrita (ortografía, gramática y coherencia):"
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
                      <label className="block text-sm font-semibold text-slate-900">
                        {idx + 1}. {item.pregunta}
                      </label>
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
                      {corr &&
                        renderBloqueFeedbackEstructurado(
                          corr,
                          "Comprensión (fondo y deducción):",
                          "Expresión escrita (ortografía, gramática y coherencia):"
                        )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* BLOQUE 3: REDACCIÓN DE RESUMEN OBLIGATORIA */}
            {requiereResumen && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 bg-amber-100/80 inline-block px-3 py-1 rounded-lg">
                    3. Redacción de Resumen (Obligatorio)
                  </h4>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                      resumenCumpleMinimo
                        ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                        : "bg-amber-100 text-amber-950 border-amber-300"
                    }`}
                  >
                    {palabrasActualesResumen} / {resumenMinPalabras} palabras{" "}
                    {resumenCumpleMinimo ? "✓" : `(faltan ${palabrasFaltantes})`}
                  </span>
                </div>

                <div className="border-2 border-amber-200 rounded-xl p-3.5 space-y-2.5 bg-amber-50/30">
                  <label className="block text-sm font-semibold text-slate-900">
                    Redacta con tus propias palabras un resumen completo del texto (mínimo{" "}
                    {resumenMinPalabras} palabras):
                  </label>

                  <textarea
                    rows={5}
                    placeholder={`Escribe aquí tu resumen (debes alcanzar al menos ${resumenMinPalabras} palabras para poder enviarlo)...`}
                    value={respResumen}
                    onChange={(e) => setRespResumen(e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded-lg p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600"
                  />

                  {!resumenCumpleMinimo && (
                    <p className="text-xs font-semibold text-amber-900">
                      ⚠️ Requisito obligatorio: escribe al menos {palabrasFaltantes}{" "}
                      {palabrasFaltantes === 1 ? "palabra más" : "palabras más"} para habilitar la corrección.
                    </p>
                  )}

                  {evaluacion?.correccion_resumen &&
                    renderBloqueFeedbackEstructurado(
                      evaluacion.correccion_resumen,
                      "Comprensión (síntesis de ideas principales):",
                      "Expresión escrita (ortografía, puntuación y cohesión):"
                    )}
                </div>
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
              setRespResumen("");
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
              disabled={corrigiendo || !resumenCumpleMinimo}
              onClick={manejarCorreccion}
              title={
                !resumenCumpleMinimo
                  ? `Completa el resumen (faltan ${palabrasFaltantes} palabras)`
                  : undefined
              }
              className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-400 disabled:cursor-not-allowed text-white text-sm font-bold shadow-sm transition cursor-pointer"
            >
              {corrigiendo
                ? "Analizando..."
                : !resumenCumpleMinimo
                ? `🔒 Faltan ${palabrasFaltantes} pal. en el resumen`
                : "🧭 Probar entrenador IA"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}