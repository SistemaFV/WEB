/* =========================================================
   Panel de flota — Construcciones FV

   Escribe directamente en la carpeta del sitio usando la File System Access
   API. No hay servidor, no hay contraseña y no se guarda nada en el
   navegador: el panel solo puede actuar sobre la carpeta que el usuario
   elige a mano en cada sesión. Por eso abrirlo sin esa carpeta es inofensivo.
   ========================================================= */

const RUTA_EQUIPOS = ["assets", "img", "equipos"];
const FICHA = "equipos.json";
const EXTENSIONES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 12 * 1024 * 1024;

const $ = (sel) => document.querySelector(sel);

const ui = {
  incompatible: $("#incompatible"),
  conectar: $("#conectar"),
  editor: $("#editor"),
  btnConectar: $("#btn-conectar"),
  errorConexion: $("#error-conexion"),
  ruta: $("#ruta-carpeta"),
  estado: $("#estado"),
  btnDesconectar: $("#btn-desconectar"),
  btnGuardar: $("#btn-guardar"),
  lista: $("#lista"),
  listaVacia: $("#lista-vacia"),
  contador: $("#contador"),
  formulario: $("#formulario"),
  tituloFormulario: $("#titulo-formulario"),
  btnCancelar: $("#btn-cancelar"),
  campoTitulo: $("#campo-titulo"),
  campoSubtitulo: $("#campo-subtitulo"),
  contadorSub: $("#contador-sub"),
  zonaFoto: $("#zona-foto"),
  zonaFotoTexto: $("#zona-foto-texto"),
  vistaPrevia: $("#vista-previa"),
  campoImagen: $("#campo-imagen"),
  btnQuitarFoto: $("#btn-quitar-foto"),
  btnAgregar: $("#btn-agregar"),
  errorFormulario: $("#error-formulario"),
  publicar: $("#publicar"),
};

/* ---------- Estado ---------- */

let carpetaEquipos = null; // FileSystemDirectoryHandle
let equipos = [];
let editandoId = null;
let archivoPendiente = null; // File elegido en el formulario
let quitarFoto = false;
let sucio = false;

/* ---------- Utilidades ---------- */

const texto = (s) => (s ?? "").toString().trim();

function aClave(titulo) {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "equipo";
}

function claveUnica(titulo, exceptoId = null) {
  const base = aClave(titulo);
  let clave = base;
  let n = 2;
  while (equipos.some((e) => e.id === clave && e.id !== exceptoId)) {
    clave = `${base}-${n}`;
    n += 1;
  }
  return clave;
}

function marcarSucio(valor = true) {
  sucio = valor;
  ui.btnGuardar.disabled = !valor;
  ui.estado.textContent = valor
    ? "Hay cambios sin guardar"
    : "Todo guardado en tu carpeta";
  ui.estado.classList.toggle("pendiente", valor);
}

function mostrarError(nodo, mensaje) {
  nodo.textContent = mensaje;
  nodo.hidden = !mensaje;
}

/* ---------- Acceso a archivos ---------- */

async function bajarA(raiz, partes) {
  let actual = raiz;
  for (const parte of partes) {
    actual = await actual.getDirectoryHandle(parte, { create: true });
  }
  return actual;
}

async function leerJSON(carpeta, nombre) {
  try {
    const handle = await carpeta.getFileHandle(nombre);
    const contenido = await (await handle.getFile()).text();
    return JSON.parse(contenido);
  } catch {
    return []; // aún no existe: se crea al guardar
  }
}

async function escribirArchivo(carpeta, nombre, datos) {
  const handle = await carpeta.getFileHandle(nombre, { create: true });
  const flujo = await handle.createWritable();
  await flujo.write(datos);
  await flujo.close();
}

async function borrarArchivo(carpeta, nombre) {
  try {
    await carpeta.removeEntry(nombre);
  } catch {
    /* ya no estaba */
  }
}

/* ---------- Conexión ---------- */

async function conectar() {
  mostrarError(ui.errorConexion, "");
  let raiz;
  try {
    raiz = await window.showDirectoryPicker({ mode: "readwrite", id: "sitio-fv" });
  } catch {
    return; // el usuario cerró el selector
  }

  // Comprobación de que es la carpeta correcta: sin esto, elegir una carpeta
  // cualquiera crearía dentro una estructura assets/img/equipos huérfana.
  try {
    await raiz.getFileHandle("index.html");
  } catch {
    mostrarError(
      ui.errorConexion,
      "Esa carpeta no parece la del sitio: no encontré index.html dentro. " +
        "Elige la carpeta WEB."
    );
    return;
  }

  if ((await raiz.requestPermission({ mode: "readwrite" })) !== "granted") {
    mostrarError(ui.errorConexion, "Sin permiso de escritura no puedo guardar los cambios.");
    return;
  }

  carpetaEquipos = await bajarA(raiz, RUTA_EQUIPOS);
  equipos = await leerJSON(carpetaEquipos, FICHA);

  ui.ruta.textContent = `${raiz.name} / assets / img / equipos`;
  ui.conectar.hidden = true;
  ui.editor.hidden = false;
  marcarSucio(false);
  await renderizarLista();
}

/* ---------- Lista ---------- */

async function miniatura(equipo) {
  if (!equipo.imagen) return null;
  try {
    const handle = await carpetaEquipos.getFileHandle(equipo.imagen);
    return URL.createObjectURL(await handle.getFile());
  } catch {
    return null;
  }
}

async function renderizarLista() {
  ui.lista.innerHTML = "";
  ui.listaVacia.hidden = equipos.length > 0;
  ui.contador.textContent = equipos.length
    ? `${equipos.length} ${equipos.length === 1 ? "equipo" : "equipos"}`
    : "";

  for (const [indice, equipo] of equipos.entries()) {
    const url = await miniatura(equipo);
    const visible = equipo.visible !== false;

    const li = document.createElement("li");
    li.className = "fila" + (visible ? "" : " oculto");
    li.innerHTML = `
      ${url
        ? `<img class="fila-miniatura" src="${url}" alt="" />`
        : '<div class="fila-miniatura fila-miniatura--vacia">sin<br>foto</div>'}
      <div>
        <div class="fila-titulo"></div>
        <div class="fila-sub"></div>
      </div>
      <div class="fila-acciones">
        <button class="icono-btn" data-accion="subir" title="Subir" ${indice === 0 ? "disabled" : ""}>↑</button>
        <button class="icono-btn" data-accion="bajar" title="Bajar" ${indice === equipos.length - 1 ? "disabled" : ""}>↓</button>
        <button class="icono-btn" data-accion="visible" title="${visible ? "Ocultar del sitio" : "Mostrar en el sitio"}">${visible ? "👁" : "🚫"}</button>
        <button class="icono-btn" data-accion="editar" title="Editar">✎</button>
        <button class="icono-btn icono-btn--peligro" data-accion="borrar" title="Eliminar">✕</button>
      </div>`;

    // Se asigna como texto y no dentro del HTML para que un título con < o &
    // no pueda romper la lista ni inyectar marcado.
    li.querySelector(".fila-titulo").textContent = equipo.titulo;
    li.querySelector(".fila-sub").textContent = equipo.subtitulo || "Sin descripción";

    li.querySelectorAll("[data-accion]").forEach((boton) => {
      boton.addEventListener("click", () => accionFila(boton.dataset.accion, indice));
    });

    ui.lista.append(li);
  }
}

async function accionFila(accion, indice) {
  const equipo = equipos[indice];

  if (accion === "subir" || accion === "bajar") {
    const destino = accion === "subir" ? indice - 1 : indice + 1;
    [equipos[indice], equipos[destino]] = [equipos[destino], equipos[indice]];
  } else if (accion === "visible") {
    equipo.visible = equipo.visible === false;
  } else if (accion === "editar") {
    cargarEnFormulario(equipo);
    return;
  } else if (accion === "borrar") {
    if (!confirm(`¿Eliminar "${equipo.titulo}" de la flota?`)) return;
    if (equipo.imagen) await borrarArchivo(carpetaEquipos, equipo.imagen);
    equipos.splice(indice, 1);
    if (editandoId === equipo.id) limpiarFormulario();
  }

  marcarSucio();
  await renderizarLista();
}

/* ---------- Formulario ---------- */

function limpiarFormulario() {
  editandoId = null;
  archivoPendiente = null;
  quitarFoto = false;
  ui.formulario.reset();
  ui.contadorSub.textContent = "0";
  ui.vistaPrevia.hidden = true;
  ui.vistaPrevia.removeAttribute("src");
  ui.zonaFotoTexto.hidden = false;
  ui.btnQuitarFoto.hidden = true;
  ui.tituloFormulario.textContent = "Agregar equipo";
  ui.btnAgregar.textContent = "Agregar a la flota";
  ui.btnCancelar.hidden = true;
  mostrarError(ui.errorFormulario, "");
}

async function cargarEnFormulario(equipo) {
  limpiarFormulario();
  editandoId = equipo.id;
  ui.campoTitulo.value = equipo.titulo;
  ui.campoSubtitulo.value = equipo.subtitulo || "";
  ui.contadorSub.textContent = String((equipo.subtitulo || "").length);
  ui.tituloFormulario.textContent = "Editar equipo";
  ui.btnAgregar.textContent = "Guardar el equipo";
  ui.btnCancelar.hidden = false;

  const url = await miniatura(equipo);
  if (url) mostrarVistaPrevia(url);

  ui.campoTitulo.focus();
}

function mostrarVistaPrevia(url) {
  ui.vistaPrevia.src = url;
  ui.vistaPrevia.hidden = false;
  ui.zonaFotoTexto.hidden = true;
  ui.btnQuitarFoto.hidden = false;
}

function tomarArchivo(archivo) {
  if (!archivo) return;
  if (!EXTENSIONES[archivo.type]) {
    mostrarError(ui.errorFormulario, "Formato no admitido. Usa JPG, PNG o WebP.");
    return;
  }
  if (archivo.size > MAX_BYTES) {
    mostrarError(
      ui.errorFormulario,
      `La foto pesa ${(archivo.size / 1048576).toFixed(1)} MB y el máximo es 12 MB.`
    );
    return;
  }
  mostrarError(ui.errorFormulario, "");
  archivoPendiente = archivo;
  quitarFoto = false;
  mostrarVistaPrevia(URL.createObjectURL(archivo));
}

async function enviarFormulario(evento) {
  evento.preventDefault();
  const titulo = texto(ui.campoTitulo.value);
  const subtitulo = texto(ui.campoSubtitulo.value);

  if (!titulo) {
    mostrarError(ui.errorFormulario, "El título es obligatorio.");
    ui.campoTitulo.focus();
    return;
  }

  const existente = editandoId ? equipos.find((e) => e.id === editandoId) : null;
  const equipo = existente ?? {
    id: claveUnica(titulo),
    visible: true,
    icono: "generico",
    imagen: "",
  };

  equipo.titulo = titulo;
  equipo.subtitulo = subtitulo;

  if (archivoPendiente) {
    const nombre = `${equipo.id}.${EXTENSIONES[archivoPendiente.type]}`;
    // Si cambió el formato, la foto anterior quedaría huérfana en la carpeta.
    if (equipo.imagen && equipo.imagen !== nombre) {
      await borrarArchivo(carpetaEquipos, equipo.imagen);
    }
    await escribirArchivo(carpetaEquipos, nombre, archivoPendiente);
    equipo.imagen = nombre;
  } else if (quitarFoto && equipo.imagen) {
    await borrarArchivo(carpetaEquipos, equipo.imagen);
    equipo.imagen = "";
  }

  if (!existente) equipos.push(equipo);

  limpiarFormulario();
  marcarSucio();
  await renderizarLista();
}

/* ---------- Guardar ---------- */

async function guardar() {
  ui.btnGuardar.disabled = true;
  ui.estado.textContent = "Guardando…";
  try {
    const json = JSON.stringify(equipos, null, 2) + "\n";
    await escribirArchivo(carpetaEquipos, FICHA, new Blob([json], { type: "application/json" }));
    marcarSucio(false);
    ui.publicar.hidden = false;
    ui.publicar.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (e) {
    ui.estado.textContent = "No se pudo guardar: " + e.message;
    ui.btnGuardar.disabled = false;
  }
}

/* ---------- Arranque ---------- */

if (!("showDirectoryPicker" in window)) {
  ui.incompatible.hidden = false;
  ui.conectar.hidden = true;
} else {
  ui.btnConectar.addEventListener("click", conectar);
}

ui.btnDesconectar.addEventListener("click", () => {
  if (sucio && !confirm("Hay cambios sin guardar. ¿Cambiar de carpeta igual?")) return;
  carpetaEquipos = null;
  equipos = [];
  limpiarFormulario();
  ui.editor.hidden = true;
  ui.conectar.hidden = false;
  ui.publicar.hidden = true;
});

ui.btnGuardar.addEventListener("click", guardar);
ui.formulario.addEventListener("submit", enviarFormulario);
ui.btnCancelar.addEventListener("click", limpiarFormulario);

ui.campoSubtitulo.addEventListener("input", () => {
  ui.contadorSub.textContent = String(ui.campoSubtitulo.value.length);
});

ui.zonaFoto.addEventListener("click", () => ui.campoImagen.click());
ui.zonaFoto.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    ui.campoImagen.click();
  }
});
ui.campoImagen.addEventListener("change", (e) => tomarArchivo(e.target.files[0]));

["dragenter", "dragover"].forEach((evento) =>
  ui.zonaFoto.addEventListener(evento, (e) => {
    e.preventDefault();
    ui.zonaFoto.classList.add("encima");
  })
);
["dragleave", "drop"].forEach((evento) =>
  ui.zonaFoto.addEventListener(evento, (e) => {
    e.preventDefault();
    ui.zonaFoto.classList.remove("encima");
  })
);
ui.zonaFoto.addEventListener("drop", (e) => tomarArchivo(e.dataTransfer.files[0]));

ui.btnQuitarFoto.addEventListener("click", () => {
  archivoPendiente = null;
  quitarFoto = true;
  ui.vistaPrevia.hidden = true;
  ui.vistaPrevia.removeAttribute("src");
  ui.zonaFotoTexto.hidden = false;
  ui.btnQuitarFoto.hidden = true;
});

// Red de seguridad: cerrar con cambios sin guardar los perdería.
window.addEventListener("beforeunload", (e) => {
  if (sucio) e.preventDefault();
});
