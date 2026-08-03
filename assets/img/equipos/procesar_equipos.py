"""
Genera la seccion de flota de la pagina a partir de equipos.json.

El panel de administracion (admin.html) escribe aqui la foto original y la
ficha del equipo. Este script hace el trabajo pesado: redimensiona, genera
WebP y JPEG en dos anchos y reescribe el bloque de tarjetas en index.html.
Lo ejecuta GitHub Actions en cada push que toque esta carpeta.

Se separa asi a proposito: el panel solo deja el archivo crudo -no puede
optimizar imagenes de forma confiable en el navegador- y el servidor de
Actions se encarga de dejarlas listas para produccion.

Uso:  python procesar_equipos.py
"""

import html
import json
import os
import re

from PIL import Image, ImageOps

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, "procesados")
FICHA = os.path.join(AQUI, "equipos.json")
INDEX = os.path.abspath(os.path.join(AQUI, "..", "..", "..", "index.html"))

# Las tarjetas ocupan un cuarto del ancho en escritorio y todo el ancho en
# movil, asi que con 640 y 1000 px se cubren ambos casos sin desperdiciar.
ANCHOS = [("sm", 640), ("md", 1000)]
PROPORCION = 4 / 3  # recorte uniforme: sin esto la grilla queda despareja
CALIDAD_WEBP = 82
CALIDAD_JPG = 84

# Iconos de respaldo, para los equipos que todavia no tienen foto cargada.
# La clave la elige el campo "icono" de equipos.json; si no calza ninguna se
# usa "generico", asi que un equipo nuevo nunca queda sin dibujo.
ICONOS = {
    "excavadora": ('<path d="M3 19h18" /><path d="M4 19v-4h7v4" />'
                   '<path d="M7 15V9h4l3 4" /><path d="M14 13l4-6" />'
                   '<path d="M17 6l3 1-2 4" />'),
    "retroexcavadora": ('<path d="M2 19h20" /><circle cx="7" cy="16" r="3" />'
                        '<circle cx="17" cy="16" r="3" /><path d="M4 13V9h6l2 4" />'
                        '<path d="M12 10l4-4 3 3-3 3" />'),
    "cargador": ('<path d="M2 19h20" /><circle cx="8" cy="16" r="2.5" />'
                 '<circle cx="17" cy="16" r="2.5" /><path d="M6 13V9h6v4" />'
                 '<path d="M12 11l-6 -1" /><path d="M2 15l4-3" />'),
    "mini": ('<path d="M3 19h18" /><path d="M5 19v-3h6v3" />'
             '<path d="M8 16v-4h3l2 3" /><path d="M13 15l3-4" />'
             '<path d="M16 11l2 1-1 3" />'),
    "camion": ('<path d="M2 18h20" /><circle cx="7" cy="17" r="2" />'
               '<circle cx="17" cy="17" r="2" /><path d="M3 17V8h9v9" />'
               '<path d="M12 11h4l3 3v3" />'),
    "generico": ('<path d="M3 19h18" /><rect x="6" y="9" width="8" height="6" />'
                 '<path d="M14 12h4l2 3" />'),
}


def icono_de(equipo) -> str:
    clave = (equipo.get("icono") or equipo.get("id") or "").lower()
    trazos = ICONOS.get(clave, ICONOS["generico"])
    return f'<svg viewBox="0 0 24 24" aria-hidden="true">{trazos}</svg>'


def leer_ficha():
    if not os.path.exists(FICHA):
        return []
    with open(FICHA, encoding="utf-8") as fh:
        datos = json.load(fh)
    return [e for e in datos if e.get("visible", True)]


def guardar_si_cambio(im: Image.Image, destino: str, **opciones) -> bool:
    """Escribe solo si el resultado difiere del que ya esta en disco.

    Se compara el archivo generado en memoria contra el existente. Sin esto,
    cada corrida en un entorno con otra version de Pillow reescribiria todas
    las variantes y ensuciaria el historial con binarios identicos.
    """
    import io

    buffer = io.BytesIO()
    im.save(buffer, **opciones)
    nuevo = buffer.getvalue()

    if os.path.exists(destino):
        with open(destino, "rb") as fh:
            if fh.read() == nuevo:
                return False

    with open(destino, "wb") as fh:
        fh.write(nuevo)
    return True


def derivar(origen: str, base: str):
    """Genera las variantes responsivas. Devuelve cuantos archivos escribio."""
    escritos = 0
    with Image.open(origen) as im:
        # Respeta la orientacion EXIF: las fotos de telefono vienen giradas.
        im = ImageOps.exif_transpose(im).convert("RGB")

        for sufijo, ancho in ANCHOS:
            alto = round(ancho / PROPORCION)
            recorte = ImageOps.fit(im, (ancho, alto), Image.LANCZOS, centering=(0.5, 0.5))
            escritos += guardar_si_cambio(
                recorte, os.path.join(SALIDA, f"{base}-{sufijo}.webp"),
                format="WEBP", quality=CALIDAD_WEBP, method=6,
            )
            escritos += guardar_si_cambio(
                recorte, os.path.join(SALIDA, f"{base}-{sufijo}.jpg"),
                format="JPEG", quality=CALIDAD_JPG, optimize=True, progressive=True,
            )
    return escritos


def tarjeta(equipo, tiene_foto: bool) -> str:
    titulo = html.escape(equipo["titulo"])
    subtitulo = html.escape(equipo.get("subtitulo", ""))
    base = equipo["id"]

    if tiene_foto:
        medio = f'''            <div class="fleet-foto">
              <picture>
                <source
                  type="image/webp"
                  sizes="(max-width: 900px) 100vw, 25vw"
                  srcset="assets/img/equipos/procesados/{base}-sm.webp 640w, assets/img/equipos/procesados/{base}-md.webp 1000w"
                />
                <img
                  src="assets/img/equipos/procesados/{base}-sm.jpg"
                  sizes="(max-width: 900px) 100vw, 25vw"
                  srcset="assets/img/equipos/procesados/{base}-sm.jpg 640w, assets/img/equipos/procesados/{base}-md.jpg 1000w"
                  alt="{titulo}"
                  width="640" height="480" loading="lazy" decoding="async"
                />
              </picture>
            </div>'''
    else:
        medio = f'            <div class="fleet-icon">{icono_de(equipo)}</div>'

    clase = "fleet-card fleet-card--foto" if tiene_foto else "fleet-card"
    return (f'          <article class="{clase}" data-reveal>\n'
            f"{medio}\n"
            f"            <h3>{titulo}</h3>\n"
            f"            <p>{subtitulo}</p>\n"
            f"          </article>")


def main():
    os.makedirs(SALIDA, exist_ok=True)
    equipos = leer_ficha()

    tarjetas = []
    escritos = 0
    usados = set()

    for equipo in equipos:
        nombre = (equipo.get("imagen") or "").strip()
        origen = os.path.join(AQUI, nombre) if nombre else ""
        tiene_foto = bool(nombre) and os.path.exists(origen)

        if nombre and not tiene_foto:
            print(f"  AVISO  {equipo['id']}: falta la imagen '{nombre}'")

        if tiene_foto:
            escritos += derivar(origen, equipo["id"])
            for sufijo, _ in ANCHOS:
                usados.update({f"{equipo['id']}-{sufijo}.webp", f"{equipo['id']}-{sufijo}.jpg"})

        tarjetas.append(tarjeta(equipo, tiene_foto))
        print(f"  {equipo['id']:22} {'con foto' if tiene_foto else 'con icono'}")

    # Limpia variantes de equipos que ya no existen o perdieron su foto.
    for archivo in os.listdir(SALIDA):
        if archivo not in usados:
            os.remove(os.path.join(SALIDA, archivo))
            print(f"  eliminado  procesados/{archivo}")

    bloque = "\n\n".join(tarjetas)
    doc = open(INDEX, encoding="utf-8").read()
    nuevo, n = re.subn(
        r"<!-- EQUIPOS:INICIO -->.*?<!-- EQUIPOS:FIN -->",
        lambda _: ("<!-- EQUIPOS:INICIO -->\n" + bloque
                   + "\n          <!-- EQUIPOS:FIN -->"),
        doc,
        flags=re.S,
    )
    if n != 1:
        raise SystemExit("No se encontraron los marcadores EQUIPOS:INICIO / EQUIPOS:FIN")

    if nuevo != doc:
        open(INDEX, "w", encoding="utf-8", newline="\n").write(nuevo)
        print(f"\nindex.html actualizado: {len(equipos)} equipos, {escritos} imagenes escritas.")
    else:
        print(f"\nSin cambios: {len(equipos)} equipos, {escritos} imagenes escritas.")


if __name__ == "__main__":
    main()
