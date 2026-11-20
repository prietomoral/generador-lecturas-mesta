import { NextResponse } from "next/server";
import mammoth from "mammoth";
import PDFParser from "pdf2json";

function extraerTextoDePdf(buffer) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);

    pdfParser.on("pdfParser_dataError", (errData) => {
      reject(new Error(errData?.parserError || "Error interno al leer el PDF."));
    });

    pdfParser.on("pdfParser_dataReady", () => {
      resolve(pdfParser.getRawTextContent() || "");
    });

    pdfParser.parseBuffer(buffer);
  });
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const archivo = formData.get("archivo");

    if (!archivo) {
      return NextResponse.json(
        { error: "No se ha recibido ningún archivo." },
        { status: 400 }
      );
    }

    const nombre = archivo.name.toLowerCase();
    const arrayBuffer = await archivo.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let textoExtraido = "";

    if (nombre.endsWith(".txt") || nombre.endsWith(".md")) {
      textoExtraido = buffer.toString("utf-8");
    } else if (nombre.endsWith(".docx")) {
      const resultado = await mammoth.extractRawText({ buffer });
      textoExtraido = resultado.value;
    } else if (nombre.endsWith(".pdf")) {
      textoExtraido = await extraerTextoDePdf(buffer);
    } else {
      return NextResponse.json(
        { error: "Formato no soportado. Usa PDF, DOCX, TXT o MD." },
        { status: 400 }
      );
    }

    const textoLimpio = textoExtraido
      .replace(/----------------Page \(\d+\) Break----------------/g, "\n")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (textoLimpio.length < 40) {
      return NextResponse.json(
        {
          error:
            "El documento parece estar vacío o es un PDF escaneado como imagen sin texto seleccionable.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      tituloSugerido: archivo.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
      texto: textoLimpio,
    });
  } catch (error) {
    console.error("❌ [extraer-texto] Error:", error);
    return NextResponse.json(
      { error: "No se pudo leer el archivo: " + error.message },
      { status: 500 }
    );
  }
}