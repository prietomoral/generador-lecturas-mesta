"use client";
import { useState, useEffect } from "react";

interface Pregunta {
  pregunta: string;
  respuesta: string;
}

interface ResultadoLectura {
  titulo: string;
  texto: string;
  preguntas_literales: Pregunta[];
  preguntas_inferenciales: Pregunta[];
}

const TIEMPO_LIMITE_SEGUNDOS = 200;

export default function GeneradorLectura() {
  const [form, setForm] = useState({
    edad: "12-14 años (1º-2º ESO)",
    tipoTextoSelect: "Narrativo (cuento o relato)",
    tipoTextoOtro: "",
    dificultad: "Media",
    extension: "Media (250 - 350 palabras)",
    tematica: "",
    saberes: "",
    numLiterales: 3,
    numInferenciales: 2,
  });

  const [resultado, setResultado] = useState<ResultadoLectura | null>(null);
  const [cargando, setCargando] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(TIEMPO_LIMITE_SEGUNDOS);
  const [mostrarRespuestas, setMostrarRespuestas] = useState(false);

  // Efecto para la cuenta atrás en tiempo real mientras carga
  useEffect(() => {
    if (!cargando) {
      setSegundosRestantes(TIEMPO_LIMITE_SEGUNDOS);
      return;
    }

    const intervalo = setInterval(() => {
      setSegundosRestantes((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(intervalo);
  }, [cargando]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSegundosRestantes(TIEMPO_LIMITE_SEGUNDOS);
    setCargando(true);
    setResultado(null);

    const tipoTextoFinal =
      form.tipoTextoSelect === "Otro" ? form.tipoTextoOtro : form.tipoTextoSelect;

    const controlador = new AbortController();
    const temporizador = setTimeout(
      () => controlador.abort(),
      TIEMPO_LIMITE_SEGUNDOS * 1000
    );

    try {
      const res = await fetch("/api/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tipoTexto: tipoTextoFinal }),
        signal: controlador.signal,
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Error en la respuesta del servidor");
      }
      setResultado(data);
    } catch (err: any) {
      if (err.name === "AbortError") {
        alert(
          `La petición tardó demasiado (más de ${TIEMPO_LIMITE_SEGUNDOS}s). Inténtalo de nuevo.`
        );
      } else {
        alert("Error: " + (err.message || "No se pudo generar la lectura."));
      }
    } finally {
      clearTimeout(temporizador);
      setCargando(false);
    }
  };

  const descargarPDF = () => {
    window.print();
  };

  const ajustarPreguntas = (campo: "numLiterales" | "numInferenciales", delta: number) => {
    setForm((prev) => ({
      ...prev,
      [campo]: Math.min(10, Math.max(0, prev[campo] + delta)),
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16 print:bg-white print:pb-0">
      {/* Cabecera Superior (oculta en PDF) */}
      <header className="bg-gradient-to-r from-blue-800 via-blue-700 to-indigo-800 text-white shadow-md print:hidden">
        <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              IESO Sierra la Mesta · Herramienta Docente
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Generador de Comprensión Lectora
            </h1>
            <p className="text-blue-100 text-sm mt-1">
              Crea textos a medida con preguntas literales e inferenciales listos para imprimir en clase.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 -mt-5 print:mt-0 print:px-0 print:max-w-none">
        {/* Tarjeta del Formulario (oculta en PDF) */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-lg shadow-slate-200/70 border border-slate-200/80 p-6 sm:p-8 space-y-6 print:hidden"
        >
          {/* Bloque 1: Nivel y Características */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center text-xs">
                1
              </span>
              Nivel y estructura del texto
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Edad */}
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

              {/* Dificultad */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Complejidad léxica y sintáctica
                </label>
                <select
                  className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition"
                  value={form.dificultad}
                  onChange={(e) => setForm({ ...form, dificultad: e.target.value })}
                >
                  <option value="Baja (vocabulario sencillo y frases cortas)">
                    Baja (vocabulario sencillo)
                  </option>
                  <option value="Media">Media (estándar del nivel)</option>
                  <option value="Alta (léxico rico y sintaxis compleja)">
                    Alta (léxico rico y complejo)
                  </option>
                </select>
              </div>

              {/* Tipo de texto */}
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

              {/* Extensión (Selector segmentado) */}
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
                        className={`py-1.5 px-2 rounded-lg text-center transition-all ${
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
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Bloque 2: Contenido Curricular */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs">
                2
              </span>
              Temática y currículo
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Tema principal de la lectura <span className="text-red-500">*</span>
                </label>
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
              {/* Contador Literales */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200/90 rounded-xl p-3.5">
                <div>
                  <div className="text-sm font-semibold text-slate-800">Preguntas Literales</div>
                  <div className="text-xs text-slate-500">Información explícita en el texto</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => ajustarPreguntas("numLiterales", -1)}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition"
                  >
                    -
                  </button>
                  <span className="w-6 text-center font-bold text-slate-800">
                    {form.numLiterales}
                  </span>
                  <button
                    type="button"
                    onClick={() => ajustarPreguntas("numLiterales", 1)}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Contador Inferenciales */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200/90 rounded-xl p-3.5">
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    Preguntas Inferenciales
                  </div>
                  <div className="text-xs text-slate-500">Deducción e interpretación</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => ajustarPreguntas("numInferenciales", -1)}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition"
                  >
                    -
                  </button>
                  <span className="w-6 text-center font-bold text-slate-800">
                    {form.numInferenciales}
                  </span>
                  <button
                    type="button"
                    onClick={() => ajustarPreguntas("numInferenciales", 1)}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Botón Generar con Cuenta Atrás */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2.5 disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer"
            >
              {cargando ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>Redactando lectura y preguntas...</span>
                  <span className="ml-1 bg-white/20 px-2.5 py-0.5 rounded-md text-xs font-mono">
                    {segundosRestantes}s
                  </span>
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                    />
                  </svg>
                  <span>Generar Actividad de Lectura</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Resultado / Ficha Imprimible */}
        {resultado && (
          <section className="mt-8 bg-white p-6 sm:p-10 rounded-2xl shadow-lg shadow-slate-200/70 border border-slate-200/80 space-y-6 print:mt-0 print:p-0 print:shadow-none print:border-none">
            {/* Barra de herramientas superior (solo visible en pantalla, oculta en PDF) */}
            <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 print:hidden">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    mostrarRespuestas ? "bg-emerald-500" : "bg-blue-500"
                  }`}
                ></span>
                <span>
                  Vista:{" "}
                  <strong className="text-slate-900">
                    {mostrarRespuestas ? "Ficha Profesor (con soluciones)" : "Ficha Alumnado"}
                  </strong>
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMostrarRespuestas(!mostrarRespuestas)}
                  className="text-sm bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-3.5 py-2 rounded-lg font-medium transition cursor-pointer"
                >
                  {mostrarRespuestas ? "Ocultar Solucionario" : "Ver Solucionario"}
                </button>
                <button
                  type="button"
                  onClick={descargarPDF}
                  className="text-sm bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg font-semibold shadow-sm transition flex items-center gap-2 cursor-pointer"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"
                    />
                  </svg>
                  Descargar PDF
                </button>
              </div>
            </div>

            {/* Encabezado Oficial (solo aparece al exportar a PDF / imprimir) */}
            <div className="hidden print:block border-b-2 border-gray-800 pb-4 mb-6">
              <div className="flex justify-between items-center mb-4">
                <span className="font-bold text-lg uppercase tracking-wide">
                  IESO Sierra la Mesta
                </span>
                <span className="text-sm text-gray-600">
                  Actividad de Comprensión Lectora
                </span>
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

            {/* Título y Cuerpo del Texto */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-center mb-6 text-slate-900 print:text-2xl print:mb-4">
                {resultado.titulo}
              </h2>
              <div className="whitespace-pre-line leading-relaxed text-base sm:text-lg text-slate-700 text-justify bg-slate-50/60 p-6 rounded-xl border border-slate-100 print:bg-transparent print:p-0 print:border-none print:text-base print:leading-7 print:text-black">
                {resultado.texto}
              </div>
            </div>

            <hr className="border-slate-200 print:border-gray-300" />

            {/* Preguntas Literales */}
            {resultado.preguntas_literales?.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-blue-700 bg-blue-50 inline-block px-3 py-1 rounded-lg uppercase tracking-wider print:bg-transparent print:p-0 print:text-base print:text-black">
                  1. Comprensión Literal
                </h3>
                <ol className="list-decimal pl-5 space-y-5">
                  {resultado.preguntas_literales.map((item, i) => (
                    <li key={i} className="break-inside-avoid">
                      <p className="font-medium text-slate-900">{item.pregunta}</p>
                      {mostrarRespuestas ? (
                        <p className="text-emerald-800 text-sm mt-2 bg-emerald-50 border border-emerald-200/70 p-3 rounded-lg print:bg-transparent print:border-none print:p-0 print:mt-1 print:italic print:text-black">
                          <strong>Respuesta:</strong> {item.respuesta}
                        </p>
                      ) : (
                        <div className="hidden print:block mt-3 space-y-5">
                          <div className="border-b border-gray-400 h-4"></div>
                          <div className="border-b border-gray-400 h-4"></div>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Preguntas Inferenciales */}
            {resultado.preguntas_inferenciales?.length > 0 && (
              <div className="space-y-4 pt-2">
                <h3 className="text-sm font-bold text-indigo-700 bg-indigo-50 inline-block px-3 py-1 rounded-lg uppercase tracking-wider print:bg-transparent print:p-0 print:text-base print:text-black">
                  2. Comprensión Inferencial
                </h3>
                <ol className="list-decimal pl-5 space-y-5">
                  {resultado.preguntas_inferenciales.map((item, i) => (
                    <li key={i} className="break-inside-avoid">
                      <p className="font-medium text-slate-900">{item.pregunta}</p>
                      {mostrarRespuestas ? (
                        <p className="text-emerald-800 text-sm mt-2 bg-emerald-50 border border-emerald-200/70 p-3 rounded-lg print:bg-transparent print:border-none print:p-0 print:mt-1 print:italic print:text-black">
                          <strong>Respuesta:</strong> {item.respuesta}
                        </p>
                      ) : (
                        <div className="hidden print:block mt-3 space-y-5">
                          <div className="border-b border-gray-400 h-4"></div>
                          <div className="border-b border-gray-400 h-4"></div>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}