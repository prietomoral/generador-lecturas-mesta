"use client";

import React, { useState } from "react";
import { ResultadoLectura } from "../types/lectura";
import { supabase } from "../lib/supabase";
import PanelSeguimientoClase from "./PanelSeguimientoClase";

interface FichaLecturaProps {
  resultado: ResultadoLectura;
  edad: string;
  pdfPreviewUrl?: string | null;
  avisoExito: boolean;
  onCerrarAviso: () => void;
  onAbrirCorrector: () => void;
  onRefinarResultado: (instruccion: string) => Promise<void>;
  refinando: boolean;
  seccionRef: React.RefObject<HTMLElement | null>;
}

const SUGERENCIAS_RAPIDAS = [
  "Haz el texto un poco más breve",
  "Simplifica el vocabulario (nivel NEAE)",
  "Dale un tono más cercano y narrativo",
  "Añade un párrafo final con moraleja",
  "Haz las preguntas un poco más desafiantes",
];

export default function FichaLectura({
  resultado,
  edad,
  pdfPreviewUrl,
  avisoExito,
  onCerrarAviso,
  onAbrirCorrector,
  onRefinarResultado,
  refinando,
  seccionRef,
}: FichaLecturaProps) {
  const [mostrarRespuestas, setMostrarRespuestas] = useState(false);
  const [codigoAula, setCodigoAula] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [vistaDocumento, setVistaDocumento] = useState<"pdf" | "texto">("pdf");

  const [panelRefinarAbierto, setPanelRefinarAbierto] = useState(false);
  const [instruccion, setInstruccion] = useState("");
  const [historialCambios, setHistorialCambios] = useState<string[]>([]);

  const parrafosTexto = (resultado.texto || "")
    .replace(/\\n/g, "\n")
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const publicarParaClase = async () => {
    setPublicando(true);
    try {
      const codigoGenerado = `MESTA-${Math.floor(100 + Math.random() * 900)}`;
      const { error } = await supabase.from("actividades").insert({
        codigo: codigoGenerado,
        titulo: resultado.titulo,
        texto: resultado.texto,
        edad,
        preguntas_literales: resultado.preguntas_literales || [],
        preguntas_inferenciales: resultado.preguntas_inferenciales || [],
      });

      if (error) {
        throw new Error(error.message);
      }

      setCodigoAula(codigoGenerado);
      const urlAlumno = `${window.location.origin}/alumno?codigo=${codigoGenerado}`;
      navigator.clipboard?.writeText(urlAlumno);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al publicar la lectura.";
      alert("No se pudo publicar en Supabase: " + msg);
    } finally {
      setPublicando(false);
    }
  };

  const manejarEnvioRefinamiento = async (e: React.FormEvent) => {
    e.preventDefault();
    const textoInstruccion = instruccion.trim();
    if (!textoInstruccion || refinando) return;

    await onRefinarResultado(textoInstruccion);
    setHistorialCambios((prev) => [...prev, textoInstruccion]);
    setInstruccion("");
  };

  return (
    <section
      ref={seccionRef}
      className="mt-8 bg-white p-6 sm:p-10 rounded-2xl shadow-lg shadow-slate-200/70 border border-slate-200/80 space-y-6 scroll-mt-6 print:mt-0 print:p-0 print:shadow-none print:border-none"
    >
      {/* Aviso visual de confirmación */}
      {avisoExito && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl shadow-sm print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
              ✓
            </span>
            <div className="text-sm">
              <strong>¡Actividad lista!</strong> Ya puedes revisarla, ajustarla con instrucciones, descargarla en PDF o compartirla con tu clase.
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrarAviso}
            className="text-emerald-700 hover:text-emerald-950 text-xs font-bold px-2 py-1 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Barra de herramientas superior */}
      <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 print:hidden">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              mostrarRespuestas ? "bg-emerald-500" : "bg-blue-500"
            }`}
          />
          <span>
            Vista:{" "}
            <strong className="text-slate-900">
              {mostrarRespuestas ? "Ficha Profesor (con soluciones)" : "Ficha Alumnado"}
            </strong>
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPanelRefinarAbierto(!panelRefinarAbierto)}
            className={`text-sm px-4 py-2 rounded-lg font-bold shadow-sm transition cursor-pointer ${
              panelRefinarAbierto
                ? "bg-amber-600 text-white"
                : "bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300"
            }`}
          >
            💬 {panelRefinarAbierto ? "Ocultar ajustes IA" : "Ajustar texto / preguntas"}
          </button>

          {!codigoAula && (
            <button
              type="button"
              disabled={publicando}
              onClick={publicarParaClase}
              className="text-sm bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition cursor-pointer"
            >
              {publicando ? "Generando código..." : "📢 Compartir con la clase"}
            </button>
          )}

          <button
            type="button"
            onClick={onAbrirCorrector}
            className="text-sm bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition cursor-pointer"
          >
            ✍️ Probar corrección IA
          </button>

          <button
            type="button"
            onClick={() => setMostrarRespuestas(!mostrarRespuestas)}
            className="text-sm bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-3.5 py-2 rounded-lg font-medium transition cursor-pointer"
          >
            {mostrarRespuestas ? "Ocultar Solucionario" : "Ver Solucionario"}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="text-sm bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg font-semibold shadow-sm transition cursor-pointer"
          >
            🖨️ Descargar PDF
          </button>
        </div>
      </div>

      {/* PANEL DE ITERACIÓN / CONVERSACIÓN CON LA IA */}
      {panelRefinarAbierto && (
        <div className="bg-amber-50/70 border-2 border-amber-200 rounded-2xl p-4 sm:p-5 space-y-3.5 print:hidden">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Asistente de Edición Docente
              </span>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                ¿Qué quieres ajustar en esta actividad?
              </h3>
            </div>
            {historialCambios.length > 0 && (
              <span className="text-xs font-semibold bg-white border border-amber-200 text-amber-900 px-2.5 py-1 rounded-full">
                {historialCambios.length}{" "}
                {historialCambios.length === 1 ? "ajuste aplicado" : "ajustes aplicados"}
              </span>
            )}
          </div>

          {historialCambios.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {historialCambios.map((item, idx) => (
                <span
                  key={idx}
                  className="bg-white/90 border border-amber-200 text-slate-700 px-2.5 py-1 rounded-lg"
                >
                  ✓ {item}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {SUGERENCIAS_RAPIDAS.map((sug) => (
              <button
                key={sug}
                type="button"
                disabled={refinando}
                onClick={() => setInstruccion(sug)}
                className="text-xs bg-white hover:bg-amber-100 text-amber-950 border border-amber-200 px-2.5 py-1 rounded-lg transition cursor-pointer disabled:opacity-50"
              >
                + {sug}
              </button>
            ))}
          </div>

          <form onSubmit={manejarEnvioRefinamiento} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              disabled={refinando}
              placeholder="Ej: Acorta el segundo párrafo, cambia el tono a más humorístico o añade un dato sobre Extremadura..."
              value={instruccion}
              onChange={(e) => setInstruccion(e.target.value)}
              className="flex-1 bg-white border border-amber-300 text-slate-800 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <button
              type="submit"
              disabled={refinando || !instruccion.trim()}
              className="bg-amber-700 hover:bg-amber-600 disabled:bg-slate-400 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-xs transition cursor-pointer shrink-0 flex items-center justify-center gap-2"
            >
              {refinando ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  <span>Aplicando cambio...</span>
                </>
              ) : (
                <span>🪄 Aplicar ajuste</span>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Panel de seguimiento en vivo si ya se ha compartido con la clase */}
      {codigoAula && (
        <PanelSeguimientoClase
          codigoActividad={codigoAula}
          tituloActividad={resultado.titulo}
        />
      )}

      {/* BLOQUE 1: FICHA PARA EL ALUMNADO */}
      <div>
        <div className="hidden print:block border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex justify-between items-center mb-4">
            <span className="font-bold text-lg uppercase tracking-wide">
              IESO Sierra la Mesta
            </span>
            <span className="text-sm text-gray-600">Actividad de Comprensión Lectora</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm pt-2">
            <div className="col-span-2">
              <strong>Nombre y apellidos:</strong> ________________________________________
            </div>
            <div>
              <strong>Curso / Fecha:</strong> _______________
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-6 text-slate-900 print:text-2xl print:mb-4">
            {resultado.titulo}
          </h2>

          {/* Selector entre Visor PDF original (si existe) y Texto extraído */}
          {pdfPreviewUrl && (
            <div className="flex justify-center mb-4 print:hidden">
              <div className="inline-flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setVistaDocumento("pdf")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    vistaDocumento === "pdf"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  📑 Ver PDF original (con imágenes y maquetación)
                </button>
                <button
                  type="button"
                  onClick={() => setVistaDocumento("texto")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    vistaDocumento === "texto"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  📝 Ver texto extraído limpio
                </button>
              </div>
            </div>
          )}

          {pdfPreviewUrl && vistaDocumento === "pdf" && (
            <div className="w-full h-[540px] rounded-xl overflow-hidden border border-slate-300 bg-slate-200 shadow-inner mb-4 print:hidden">
              <iframe
                src={`${pdfPreviewUrl}#toolbar=1&navpanes=0`}
                title="Documento PDF original"
                className="w-full h-full"
              />
            </div>
          )}

          <div
            className={`${
              pdfPreviewUrl && vistaDocumento === "pdf" ? "hidden print:block" : "block"
            } space-y-4 leading-relaxed text-base sm:text-lg text-slate-700 text-justify bg-slate-50/60 p-6 rounded-xl border border-slate-100 print:bg-transparent print:p-0 print:border-none print:text-base print:leading-7 print:text-black print:space-y-3`}
          >
            {parrafosTexto.map((parrafo, idx) => (
              <p key={idx} className="indent-4 sm:indent-6 print:indent-4">
                {parrafo}
              </p>
            ))}
          </div>
        </div>

        <hr className="border-slate-200 my-6 print:border-gray-300" />

        {resultado.preguntas_literales?.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-blue-700 bg-blue-50 inline-block px-3 py-1 rounded-lg uppercase tracking-wider print:bg-transparent print:p-0 print:text-base print:text-black">
              1. Comprensión Literal
            </h3>
            <ol className="list-decimal pl-5 space-y-5">
              {resultado.preguntas_literales.map((item, i) => (
                <li key={i} className="break-inside-avoid">
                  <p className="font-medium text-slate-900">{item.pregunta}</p>
                  {mostrarRespuestas && (
                    <p className="text-emerald-800 text-sm mt-2 bg-emerald-50 border border-emerald-200/70 p-3 rounded-lg print:hidden">
                      <strong>Respuesta:</strong> {item.respuesta}
                    </p>
                  )}
                  <div className="hidden print:block mt-3 space-y-5">
                    <div className="border-b border-gray-400 h-4" />
                    <div className="border-b border-gray-400 h-4" />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {resultado.preguntas_inferenciales?.length > 0 && (
          <div className="space-y-4 pt-6">
            <h3 className="text-sm font-bold text-indigo-700 bg-indigo-50 inline-block px-3 py-1 rounded-lg uppercase tracking-wider print:bg-transparent print:p-0 print:text-base print:text-black">
              2. Comprensión Inferencial
            </h3>
            <ol className="list-decimal pl-5 space-y-5">
              {resultado.preguntas_inferenciales.map((item, i) => (
                <li key={i} className="break-inside-avoid">
                  <p className="font-medium text-slate-900">{item.pregunta}</p>
                  {mostrarRespuestas && (
                    <p className="text-emerald-800 text-sm mt-2 bg-emerald-50 border border-emerald-200/70 p-3 rounded-lg print:hidden">
                      <strong>Respuesta:</strong> {item.respuesta}
                    </p>
                  )}
                  <div className="hidden print:block mt-3 space-y-5">
                    <div className="border-b border-gray-400 h-4" />
                    <div className="border-b border-gray-400 h-4" />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* BLOQUE 2 (SOLO PDF): SOLUCIONARIO EN HOJA APARTE */}
      <div className="hidden print:block print:break-before-page">
        <div className="border-b-2 border-gray-800 pb-3 mb-6">
          <div className="flex justify-between items-center">
            <span className="font-bold text-lg uppercase tracking-wide">
              IESO Sierra la Mesta
            </span>
            <span className="text-sm font-semibold uppercase tracking-wider text-gray-700">
              Solucionario para el Docente
            </span>
          </div>
          <p className="text-base font-bold text-black mt-2">
            Lectura: {resultado.titulo}
          </p>
        </div>

        {resultado.preguntas_literales?.length > 0 && (
          <div className="space-y-3 mb-6">
            <h3 className="text-base font-bold uppercase tracking-wider text-black">
              1. Soluciones — Comprensión Literal
            </h3>
            <ol className="list-decimal pl-5 space-y-4">
              {resultado.preguntas_literales.map((item, i) => (
                <li key={i} className="break-inside-avoid text-sm">
                  <p className="font-bold text-black">{item.pregunta}</p>
                  <p className="text-gray-800 mt-1">
                    <strong>Respuesta:</strong> {item.respuesta}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {resultado.preguntas_inferenciales?.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-base font-bold uppercase tracking-wider text-black">
              2. Soluciones — Comprensión Inferencial
            </h3>
            <ol className="list-decimal pl-5 space-y-4">
              {resultado.preguntas_inferenciales.map((item, i) => (
                <li key={i} className="break-inside-avoid text-sm">
                  <p className="font-bold text-black">{item.pregunta}</p>
                  <p className="text-gray-800 mt-1">
                    <strong>Respuesta:</strong> {item.respuesta}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}