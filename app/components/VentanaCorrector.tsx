"use client";

import React, { useState } from "react";
import { MediaTipo, Pregunta } from "../types/lectura";
import { EstadoGamificacion } from "../types/gamificacion";
import {
  actualizarGamificacionTrasEvaluacion,
  crearEstadoGamificacionInicial,
} from "../lib/motorGamificacion";
import PanelGamificacionAlumno from "./PanelGamificacionAlumno";
import RutaEscudoDual from "./RutaEscudoDual";

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
  bloqueoSecuencial?: boolean;
}

type PasoSecuencial =
  | { tipo: "literal"; indice: number; pregunta: Pregunta; etiqueta: string; estacionId: string }
  | {
      tipo: "inferencial";
      indice: number;
      pregunta: Pregunta;
      etiqueta: string;
      estacionId: string;
    }
  | { tipo: "resumen"; etiqueta: string; estacionId: string };

const NIVELES_ESCALA = [
  "No conseguido",
  "Bajamente Conseguido",
  "Conseguido",
  "Altamente Conseguido",
];

function esNivelDominado(nivel?: string): boolean {
  return nivel === "Conseguido" || nivel === "Altamente Conseguido";
}

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
  bloqueoSecuencial = true,
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
  const [avisoPegado, setAvisoPegado] = useState<string | null>(null);

  const [modoSecuencial, setModoSecuencial] = useState(bloqueoSecuencial);
  const [pasoActual, setPasoActual] = useState(0);

  const requiereResumen = resumenMinPalabras > 0;
  const [gamificacion, setGamificacion] = useState<EstadoGamificacion>(() =>
    crearEstadoGamificacionInicial(
      preguntasLiterales.length,
      preguntasInferenciales.length,
      requiereResumen
    )
  );

  if (!abierta) return null;

  const palabrasActualesResumen = contarPalabras(respResumen);
  const resumenCumpleMinimo =
    !requiereResumen || palabrasActualesResumen >= resumenMinPalabras;
  const palabrasFaltantes = Math.max(0, resumenMinPalabras - palabrasActualesResumen);

  const pasosSecuenciales: PasoSecuencial[] = [
    ...preguntasLiterales.map((p, i) => ({
      tipo: "literal" as const,
      indice: i,
      pregunta: p,
      etiqueta: `Comprensión Literal · Pregunta ${i + 1} de ${preguntasLiterales.length}`,
      estacionId: `L-${i}`,
    })),
    ...preguntasInferenciales.map((p, i) => ({
      tipo: "inferencial" as const,
      indice: i,
      pregunta: p,
      etiqueta: `Comprensión Inferencial · Pregunta ${i + 1} de ${preguntasInferenciales.length}`,
      estacionId: `I-${i}`,
    })),
    ...(requiereResumen
      ? [
          {
            tipo: "resumen" as const,
            etiqueta: "Actividad Final · Redacción de Resumen",
            estacionId: "RES-0",
          },
        ]
      : []),
  ];

  const indicePasoSeguro = Math.min(pasoActual, Math.max(0, pasosSecuenciales.length - 1));
  const pasoActivo = pasosSecuenciales[indicePasoSeguro];

  const parrafosTexto = (texto || "")
    .replace(/\\n/g, "\n")
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const bloquearPegado = (
    e: React.ClipboardEvent<HTMLTextAreaElement> | React.DragEvent<HTMLTextAreaElement>
  ) => {
    e.preventDefault();
    setAvisoPegado(
      "🚫 No está permitido pegar texto. Redacta la respuesta con tus propias palabras."
    );
    setTimeout(() => setAvisoPegado(null), 4500);
  };

  const obtenerCorreccionPaso = (paso?: PasoSecuencial): CorreccionItem | null => {
    if (!paso || !evaluacion) return null;
    if (paso.tipo === "literal") {
      return evaluacion.correcciones_literales?.[paso.indice] || null;
    }
    if (paso.tipo === "inferencial") {
      return evaluacion.correcciones_inferenciales?.[paso.indice] || null;
    }
    return evaluacion.correccion_resumen || null;
  };

  const corrPasoActivo = obtenerCorreccionPaso(pasoActivo);
  const pasoActivoDominado = Boolean(
    corrPasoActivo &&
      esNivelDominado(corrPasoActivo.nivel_comprension) &&
      esNivelDominado(corrPasoActivo.nivel_expresion)
  );
  const esUltimoPaso = indicePasoSeguro >= pasosSecuenciales.length - 1;

  const manejarCorreccion = async () => {
    if (modoSecuencial && pasoActivo) {
      if (pasoActivo.tipo === "literal" && !respLiterales[pasoActivo.indice]?.trim()) {
        alert("Escribe tu respuesta antes de comprobarla con el entrenador.");
        return;
      }
      if (pasoActivo.tipo === "inferencial" && !respInferenciales[pasoActivo.indice]?.trim()) {
        alert("Escribe tu respuesta razonada antes de comprobarla con el entrenador.");
        return;
      }
      if (pasoActivo.tipo === "resumen" && !resumenCumpleMinimo) {
        alert(
          `El resumen es obligatorio y debe tener al menos ${resumenMinPalabras} palabras (llevas ${palabrasActualesResumen}).`
        );
        return;
      }
    } else {
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
    }

    setCorrigiendo(true);
    if (!modoSecuencial) {
      setEvaluacion(null);
    }

    try {
      const payload =
        modoSecuencial && pasoActivo
          ? {
              titulo,
              texto,
              edad,
              intentoActual: 1,
              preguntas_literales:
                pasoActivo.tipo === "literal" ? [pasoActivo.pregunta] : [],
              preguntas_inferenciales:
                pasoActivo.tipo === "inferencial" ? [pasoActivo.pregunta] : [],
              respuestasAlumnoLiterales:
                pasoActivo.tipo === "literal" ? [respLiterales[pasoActivo.indice] || ""] : [],
              respuestasAlumnoInferenciales:
                pasoActivo.tipo === "inferencial"
                  ? [respInferenciales[pasoActivo.indice] || ""]
                  : [],
              resumenMinPalabras: pasoActivo.tipo === "resumen" ? resumenMinPalabras : 0,
              resumenModelo: pasoActivo.tipo === "resumen" ? resumenModelo : "",
              respuestaAlumnoResumen: pasoActivo.tipo === "resumen" ? respResumen : undefined,
            }
          : {
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
            };

      const res = await fetch("/api/corregir-lectura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const rawText = await res.text();
      let data: ResultadoCorreccion & { error?: string };
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

      if (modoSecuencial && pasoActivo) {
        const base: ResultadoCorreccion = evaluacion || {
          nivel_global: data.nivel_global,
          nivel_comprension_global: data.nivel_comprension_global,
          nivel_expresion_global: data.nivel_expresion_global,
          comentario_general: data.comentario_general,
          correcciones_literales: [],
          correcciones_inferenciales: [],
          correccion_resumen: null,
        };

        const nuevasLit = [...(base.correcciones_literales || [])];
        const nuevasInf = [...(base.correcciones_inferenciales || [])];
        let nuevoRes = base.correccion_resumen || null;

        if (pasoActivo.tipo === "literal" && data.correcciones_literales?.[0]) {
          nuevasLit[pasoActivo.indice] = data.correcciones_literales[0];
        } else if (pasoActivo.tipo === "inferencial" && data.correcciones_inferenciales?.[0]) {
          nuevasInf[pasoActivo.indice] = data.correcciones_inferenciales[0];
        } else if (pasoActivo.tipo === "resumen" && data.correccion_resumen) {
          nuevoRes = data.correccion_resumen;
        }

        setEvaluacion({
          ...base,
          nivel_global: data.nivel_global,
          nivel_comprension_global: data.nivel_comprension_global,
          nivel_expresion_global: data.nivel_expresion_global,
          comentario_general: data.comentario_general,
          correcciones_literales: nuevasLit,
          correcciones_inferenciales: nuevasInf,
          correccion_resumen: nuevoRes,
        });

        setGamificacion((prevGamif) =>
          actualizarGamificacionTrasEvaluacion({
            estadoAnterior: prevGamif,
            estacionIdEvaluada: pasoActivo.estacionId,
            esActividadOral: Boolean(mediaUrl),
            correccionesLiterales: nuevasLit,
            correccionesInferenciales: nuevasInf,
            correccionResumen: nuevoRes,
            numLiterales: preguntasLiterales.length,
            numInferenciales: preguntasInferenciales.length,
            tieneResumen: requiereResumen,
          })
        );
      } else {
        setEvaluacion(data);
        setGamificacion((prevGamif) =>
          actualizarGamificacionTrasEvaluacion({
            estadoAnterior: prevGamif,
            esActividadOral: Boolean(mediaUrl),
            correccionesLiterales: data.correcciones_literales || [],
            correccionesInferenciales: data.correcciones_inferenciales || [],
            correccionResumen: data.correccion_resumen || null,
            numLiterales: preguntasLiterales.length,
            numInferenciales: preguntasInferenciales.length,
            tieneResumen: requiereResumen,
          })
        );
      }
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

  const deshabilitarBotonEnviar =
    corrigiendo ||
    (modoSecuencial
      ? pasoActivo?.tipo === "resumen" && !resumenCumpleMinimo
      : !resumenCumpleMinimo);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5 print:hidden">
      <div className="bg-white w-full max-w-6xl h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Cabecera de la Ventana */}
        <div className="bg-indigo-900 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-bold text-indigo-200 block">
              DialectIA · IESO Sierra la Mesta · Entrenador de Competencia Lingüística — Programa NEXO (Educalectura-Educalem)
            </span>
            <h2 className="text-base sm:text-lg font-extrabold truncate">
              Entrenamiento Interactivo: {titulo}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {bloqueoSecuencial ? (
              <span className="bg-indigo-950/80 border border-indigo-400/30 text-indigo-100 px-3 py-1 rounded-xl text-[11px] font-bold">
                🔒 Bloqueo secuencial activo
              </span>
            ) : (
              <div className="inline-flex bg-indigo-950/70 p-0.5 rounded-xl border border-indigo-400/30 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setModoSecuencial(true)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    modoSecuencial
                      ? "bg-white text-indigo-950 shadow-xs"
                      : "text-indigo-200 hover:text-white"
                  }`}
                >
                  🎯 Paso a paso
                </button>
                <button
                  type="button"
                  onClick={() => setModoSecuencial(false)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    !modoSecuencial
                      ? "bg-white text-indigo-950 shadow-xs"
                      : "text-indigo-200 hover:text-white"
                  }`}
                >
                  📋 Vista libre
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onCerrar}
              className="px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition cursor-pointer"
            >
              ✕ Cerrar ventana
            </button>
          </div>
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
          <div className="lg:col-span-7 p-5 overflow-y-auto space-y-5 bg-white">
            {/* Módulos independientes de Gamificación */}
            <PanelGamificacionAlumno gamificacion={gamificacion} />
            <RutaEscudoDual
              estaciones={gamificacion.estaciones}
              indiceActivo={indicePasoSeguro}
              onSeleccionarEstacion={(idx) => {
                if (!bloqueoSecuencial) {
                  setPasoActual(idx);
                }
              }}
            />

            {avisoPegado && (
              <div className="bg-rose-50 border-2 border-rose-300 text-rose-950 rounded-xl px-4 py-2.5 text-xs font-bold shadow-xs">
                {avisoPegado}
              </div>
            )}

            {/* MODO SECUENCIAL POR DOMINIO */}
            {modoSecuencial && pasoActivo ? (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>
                      🎯 Avance secuencial por dominio · Paso {indicePasoSeguro + 1} de{" "}
                      {pasosSecuenciales.length}
                    </span>
                    <span className="text-indigo-700">
                      {Math.round(((indicePasoSeguro + 1) / pasosSecuenciales.length) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full transition-all duration-300"
                      style={{
                        width: `${((indicePasoSeguro + 1) / pasosSecuenciales.length) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Alcanza al menos <strong>Conseguido</strong> tanto en Comprensión como en Expresión escrita para iluminar las dos mitades del escudo y avanzar.
                  </p>
                </div>

                {pasoActivo.tipo === "literal" && (
                  <div className="border-2 border-blue-200 rounded-2xl p-4 space-y-3 bg-blue-50/20">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-800 bg-blue-100 inline-block px-3 py-1 rounded-lg">
                      {pasoActivo.etiqueta}
                    </span>
                    <label className="block text-base font-bold text-slate-900">
                      {pasoActivo.indice + 1}. {pasoActivo.pregunta.pregunta}
                    </label>
                    <textarea
                      rows={3}
                      onPaste={bloquearPegado}
                      onDrop={bloquearPegado}
                      placeholder="Redacta una oración completa con tus propias palabras (pegar deshabilitado)..."
                      value={respLiterales[pasoActivo.indice] || ""}
                      onChange={(e) => {
                        const copia = [...respLiterales];
                        copia[pasoActivo.indice] = e.target.value;
                        setRespLiterales(copia);
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600"
                    />
                    {corrPasoActivo &&
                      renderBloqueFeedbackEstructurado(
                        corrPasoActivo,
                        "Comprensión (fondo y contenido):",
                        "Expresión escrita (ortografía, gramática y coherencia):"
                      )}
                  </div>
                )}

                {pasoActivo.tipo === "inferencial" && (
                  <div className="border-2 border-indigo-200 rounded-2xl p-4 space-y-3 bg-indigo-50/20">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 bg-indigo-100 inline-block px-3 py-1 rounded-lg">
                      {pasoActivo.etiqueta}
                    </span>
                    <label className="block text-base font-bold text-slate-900">
                      {pasoActivo.indice + 1}. {pasoActivo.pregunta.pregunta}
                    </label>
                    <textarea
                      rows={3}
                      onPaste={bloquearPegado}
                      onDrop={bloquearPegado}
                      placeholder="Redacta tu respuesta razonada con tus propias palabras (pegar deshabilitado)..."
                      value={respInferenciales[pasoActivo.indice] || ""}
                      onChange={(e) => {
                        const copia = [...respInferenciales];
                        copia[pasoActivo.indice] = e.target.value;
                        setRespInferenciales(copia);
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600"
                    />
                    {corrPasoActivo &&
                      renderBloqueFeedbackEstructurado(
                        corrPasoActivo,
                        "Comprensión (fondo y deducción):",
                        "Expresión escrita (ortografía, gramática y coherencia):"
                      )}
                  </div>
                )}

                {pasoActivo.tipo === "resumen" && (
                  <div className="border-2 border-amber-200 rounded-2xl p-4 space-y-3 bg-amber-50/30">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-900 bg-amber-100 inline-block px-3 py-1 rounded-lg">
                        {pasoActivo.etiqueta}
                      </span>
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
                    <label className="block text-base font-bold text-slate-900">
                      Redacta con tus propias palabras un resumen completo del texto (mínimo{" "}
                      {resumenMinPalabras} palabras):
                    </label>
                    <textarea
                      rows={5}
                      onPaste={bloquearPegado}
                      onDrop={bloquearPegado}
                      placeholder={`Escribe aquí tu resumen con tus propias palabras (mínimo ${resumenMinPalabras} palabras, pegar deshabilitado)...`}
                      value={respResumen}
                      onChange={(e) => setRespResumen(e.target.value)}
                      className="w-full bg-white border border-amber-300 rounded-xl p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600"
                    />
                    {!resumenCumpleMinimo && (
                      <p className="text-xs font-semibold text-amber-900">
                        ⚠️ Requisito obligatorio: escribe al menos {palabrasFaltantes}{" "}
                        {palabrasFaltantes === 1 ? "palabra más" : "palabras más"} para habilitar la corrección.
                      </p>
                    )}
                    {corrPasoActivo &&
                      renderBloqueFeedbackEstructurado(
                        corrPasoActivo,
                        "Comprensión (síntesis de ideas principales):",
                        "Expresión escrita (ortografía, puntuación y cohesión):"
                      )}
                  </div>
                )}

                {/* Controles de avance secuencial */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    disabled={indicePasoSeguro === 0}
                    onClick={() => setPasoActual((p) => Math.max(0, p - 1))}
                    className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    ⬅️ Pregunta anterior
                  </button>

                  {pasoActivoDominado ? (
                    esUltimoPaso ? (
                      <div className="px-4 py-2 rounded-xl bg-emerald-100 border border-emerald-400 text-emerald-950 text-xs font-extrabold">
                        🏆 ¡Actividad completada con dominio en ambos indicadores!
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setPasoActual((p) => Math.min(pasosSecuenciales.length - 1, p + 1))
                        }
                        className="px-5 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-extrabold shadow-sm transition cursor-pointer"
                      >
                        ✅ Dominado · Siguiente pregunta ➡️
                      </button>
                    )
                  ) : (
                    <span className="text-xs font-semibold text-slate-500">
                      🔒 Alcanza <strong>Conseguido</strong> en Comprensión y Expresión para avanzar
                    </span>
                  )}
                </div>
              </div>
            ) : (
              /* VISTA COMPLETA (TODAS LAS PREGUNTAS) */
              <>
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
                            onPaste={bloquearPegado}
                            onDrop={bloquearPegado}
                            placeholder="Redacta una oración completa (pegar deshabilitado)..."
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
                            onPaste={bloquearPegado}
                            onDrop={bloquearPegado}
                            placeholder="Redacta tu respuesta razonada (pegar deshabilitado)..."
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
                        onPaste={bloquearPegado}
                        onDrop={bloquearPegado}
                        placeholder={`Escribe aquí tu resumen con tus propias palabras (debes alcanzar al menos ${resumenMinPalabras} palabras, pegar deshabilitado)...`}
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
              </>
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
              setPasoActual(0);
              setGamificacion(
                crearEstadoGamificacionInicial(
                  preguntasLiterales.length,
                  preguntasInferenciales.length,
                  requiereResumen
                )
              );
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
              disabled={deshabilitarBotonEnviar}
              onClick={manejarCorreccion}
              title={
                !modoSecuencial && !resumenCumpleMinimo
                  ? `Completa el resumen (faltan ${palabrasFaltantes} palabras)`
                  : undefined
              }
              className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-400 disabled:cursor-not-allowed text-white text-sm font-bold shadow-sm transition cursor-pointer"
            >
              {corrigiendo
                ? "Analizando..."
                : modoSecuencial
                ? "🧭 Comprobar esta respuesta"
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