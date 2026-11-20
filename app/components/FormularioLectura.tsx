"use client";

import React, { useState } from "react";
import { FormLectura, obtenerTemaAleatorio } from "../types/lectura";

interface FormularioLecturaProps {
  form: FormLectura;
  setForm: React.Dispatch<React.SetStateAction<FormLectura>>;
  cargando: boolean;
  segundosRestantes: number;
  onSubmit: (e: React.FormEvent) => void;
}

export default function FormularioLectura({
  form,
  setForm,
  cargando,
  segundosRestantes,
  onSubmit,
}: FormularioLecturaProps) {
  const [extrayendoArchivo, setExtrayendoArchivo] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState("");

  const modo = form.modoOrigen || "generar";

  const ajustarPreguntas = (campo: "numLiterales" | "numInferenciales", delta: number) => {
    setForm((prev) => ({
      ...prev,
      [campo]: Math.min(10, Math.max(0, prev[campo] + delta)),
    }));
  };

  const manejarSubidaArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtrayendoArchivo(true);
    setNombreArchivo(file.name);

    try {
      const fd = new FormData();
      fd.append("archivo", file);

      const res = await fetch("/api/extraer-texto", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "No se pudo extraer el texto del documento.");
      }

      setForm((prev) => ({
        ...prev,
        tituloPropio: prev.tituloPropio || data.tituloSugerido,
        textoPropio: data.texto,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al leer el archivo.";
      alert(msg);
      setNombreArchivo("");
    } finally {
      setExtrayendoArchivo(false);
      e.target.value = "";
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white rounded-2xl shadow-lg shadow-slate-200/70 border border-slate-200/80 p-6 sm:p-8 space-y-6 print:hidden"
    >
      {/* Selector de Origen: Generar con IA vs Subir documento multiformato */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200/80">
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, modoOrigen: "generar" }))}
          className={`py-2.5 px-4 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${
            modo === "generar"
              ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          ✨ Generar lectura con IA
        </button>
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, modoOrigen: "subir" }))}
          className={`py-2.5 px-4 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${
            modo === "subir"
              ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          📄 Subir archivo (.PDF, .DOCX, .TXT) o pegar texto
        </button>
      </div>

      {/* Bloque 1: Nivel y Características */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center text-xs">
            1
          </span>
          {modo === "subir" ? "Nivel del alumnado y dificultad de preguntas" : "Nivel y estructura del texto"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Edad / Nivel del alumnado
            </label>
            <select
              className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition"
              value={form.edad}
              onChange={(e) => setForm({ ...form, edad: e.target.value })}
            >
              <option>6-7 años (1º-2º Primaria)</option>
              <option>8-9 años (3º-4º Primaria)</option>
              <option>10-11 años (5º-6º Primaria)</option>
              <option>12-14 años (1º-2º ESO)</option>
              <option>15-16 años (3º-4º ESO)</option>
              <option>+17 años (Bachillerato / Adultos)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              {modo === "subir" ? "Complejidad de las preguntas" : "Complejidad léxica y sintáctica"}
            </label>
            <select
              className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition"
              value={form.dificultad}
              onChange={(e) => setForm({ ...form, dificultad: e.target.value })}
            >
              <option value="Baja (vocabulario sencillo y frases cortas)">
                Baja (vocabulario sencillo / apoyo NEAE)
              </option>
              <option value="Media">Media (estándar del nivel)</option>
              <option value="Alta (léxico rico y sintaxis compleja)">
                Alta (léxico rico y complejo)
              </option>
            </select>
          </div>

          {modo === "generar" && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Tipología textual
                </label>
                <select
                  className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition"
                  value={form.tipoTextoSelect}
                  onChange={(e) => setForm({ ...form, tipoTextoSelect: e.target.value })}
                >
                  <option>Narrativo (cuento o relato)</option>
                  <option>Expositivo / Divulgativo</option>
                  <option>Argumentativo / Opinión</option>
                  <option>Periodístico (noticia o crónica)</option>
                  <option>Instructivo (receta o experimento)</option>
                  <option value="Otro">Otro (especificar formato...)</option>
                </select>
                {form.tipoTextoSelect === "Otro" && (
                  <input
                    type="text"
                    required
                    placeholder="Ej: Carta formal, diálogo teatral, fábula..."
                    className="w-full border border-blue-300 bg-blue-50/50 text-sm rounded-xl px-3.5 py-2.5 mt-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition"
                    value={form.tipoTextoOtro}
                    onChange={(e) => setForm({ ...form, tipoTextoOtro: e.target.value })}
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Extensión aproximada
                </label>
                <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                  {[
                    { label: "Corta", sub: "~125 pal.", val: "Corta (100 - 150 palabras)" },
                    { label: "Media", sub: "~300 pal.", val: "Media (250 - 350 palabras)" },
                    { label: "Larga", sub: "~575 pal.", val: "Larga (500 - 650 palabras)" },
                  ].map((op) => {
                    const activo = form.extension === op.val;
                    return (
                      <button
                        type="button"
                        key={op.label}
                        onClick={() => setForm({ ...form, extension: op.val })}
                        className={`py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer ${
                          activo
                            ? "bg-white text-blue-700 shadow-sm font-bold ring-1 ring-slate-200"
                            : "text-slate-600 hover:text-slate-900 font-medium"
                        }`}
                      >
                        <div className="text-xs sm:text-sm">{op.label}</div>
                        <div className="text-[10px] opacity-75">{op.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Bloque 2: Contenido Curricular O Documento Subido */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs">
            2
          </span>
          {modo === "subir" ? "Documento o texto propio" : "Temática y currículo"}
        </h2>

        {modo === "subir" ? (
          <div className="space-y-4 bg-indigo-50/40 border border-indigo-200/80 rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-indigo-950">
                  Importar archivo o pegar fragmento
                </div>
                <div className="text-xs text-slate-600">
                  Soporta <strong>.pdf</strong>, <strong>.docx</strong> (Word), <strong>.txt</strong> y <strong>.md</strong>.
                </div>
              </div>

              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer">
                <span>
                  {extrayendoArchivo ? "⏳ Extrayendo texto..." : "📂 Subir documento"}
                </span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  disabled={extrayendoArchivo}
                  onChange={manejarSubidaArchivo}
                  className="hidden"
                />
              </label>
            </div>

            {nombreArchivo && (
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                <span>✓ Archivo cargado: {nombreArchivo}</span>
                <button
                  type="button"
                  onClick={() => {
                    setNombreArchivo("");
                    setForm((prev) => ({ ...prev, tituloPropio: "", textoPropio: "" }));
                  }}
                  className="text-emerald-900 underline hover:text-rose-700 cursor-pointer"
                >
                  Quitar
                </button>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Título de la lectura{" "}
                <span className="text-slate-400 font-normal">(opcional, si lo dejas vacío la IA creará uno)</span>
              </label>
              <input
                type="text"
                placeholder="Ej: Capítulo 1 de El Lazarillo de Tormes"
                className="w-full bg-white border border-slate-300 text-slate-800 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 transition"
                value={form.tituloPropio || ""}
                onChange={(e) => setForm({ ...form, tituloPropio: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Texto base para trabajar <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={7}
                required
                placeholder="Aquí aparecerá el contenido extraído de tu PDF/Word, o puedes pegar directamente cualquier texto..."
                className="w-full bg-white border border-slate-300 text-slate-800 text-sm leading-relaxed rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 transition"
                value={form.textoPropio || ""}
                onChange={(e) => setForm({ ...form, textoPropio: e.target.value })}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="block text-sm font-semibold text-slate-700">
                  Tema principal de la lectura <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        tematica: obtenerTemaAleatorio(prev.tematica),
                      }))
                    }
                    className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                  >
                    🎲 Otro tema aleatorio
                  </button>
                  {form.tematica && (
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, tematica: "" }))}
                      className="text-xs font-medium text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg transition cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                required
                placeholder="Ej: La historia de Extremadura, el cambio climático, un misterio en el instituto..."
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl px-4 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition"
                value={form.tematica}
                onChange={(e) => setForm({ ...form, tematica: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Saberes básicos o contenidos relacionados{" "}
                <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                placeholder="Ej: Ecosistemas mediterráneos, tiempos verbales del pasado, fracciones..."
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl px-4 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition"
                value={form.saberes}
                onChange={(e) => setForm({ ...form, saberes: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      <hr className="border-slate-100" />

      {/* Bloque 3: Preguntas de Comprensión */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">
            3
          </span>
          Batería de preguntas
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200/90 rounded-xl p-3.5">
            <div>
              <div className="text-sm font-semibold text-slate-800">Preguntas Literales</div>
              <div className="text-xs text-slate-500">Información explícita en el texto</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => ajustarPreguntas("numLiterales", -1)}
                className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition cursor-pointer"
              >
                -
              </button>
              <span className="w-6 text-center font-bold text-slate-800">
                {form.numLiterales}
              </span>
              <button
                type="button"
                onClick={() => ajustarPreguntas("numLiterales", 1)}
                className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-50 border border-slate-200/90 rounded-xl p-3.5">
            <div>
              <div className="text-sm font-semibold text-slate-800">Preguntas Inferenciales</div>
              <div className="text-xs text-slate-500">Deducción e interpretación</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => ajustarPreguntas("numInferenciales", -1)}
                className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition cursor-pointer"
              >
                -
              </button>
              <span className="w-6 text-center font-bold text-slate-800">
                {form.numInferenciales}
              </span>
              <button
                type="button"
                onClick={() => ajustarPreguntas("numInferenciales", 1)}
                className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Botón Generar */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={cargando || extrayendoArchivo}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2.5 disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer"
        >
          {cargando ? (
            <>
              <span className="animate-spin inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              <span>
                {modo === "subir"
                  ? "Creando preguntas sobre tu texto..."
                  : "Redactando lectura y preguntas..."}
              </span>
              <span className="ml-1 bg-white/20 px-2.5 py-0.5 rounded-md text-xs font-mono">
                {segundosRestantes}s
              </span>
            </>
          ) : (
            <span>
              {modo === "subir"
                ? "🪄 Crear Preguntas a partir de mi Texto"
                : "✨ Generar Actividad de Lectura"}
            </span>
          )}
        </button>
      </div>
    </form>
  );
}