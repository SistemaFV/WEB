"""
Genera la seccion de flota de la pagina a partir de equipos.json.

El panel de administracion escribe aqui las fotos originales y la ficha del
equipo. Este script hace el trabajo pesado: redimensiona, genera WebP y JPEG
en dos anchos y reescribe el bloque de tarjetas en index.html. Lo ejecuta
GitHub Actions en cada push que toque esta carpeta.

Se separa asi a proposito: el panel solo deja el archivo crudo -no puede
optimizar imagenes de forma confiable en el navegador- y el servidor de
Actions se encarga de dejarlas listas para produccion.

Cada equipo admite hasta dos fotos. La cantidad y el campo "ancho" deciden
la forma de la tarjeta:

    0 fotos, normal   ->  icono + texto, un cuarto de la fila
    1 foto,  normal   ->  foto + texto, un cuarto de la fila
    ancho: true       ->  fila completa, con el texto al costado de las fotos
    2 fotos           ->  siempre fila completa (dos fotos no caben en un cuarto)

Uso:  python procesar_equipos.py
"""

import html
import io
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
MAX_FOTOS = 2

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
    "camion": ('<path d="M2 17h20" /><circle cx="6" cy="17" r="2" />'
               '<circle cx="12" cy="17" r="2" /><circle cx="19" cy="17" r="2" />'
               '<path d="M2 15v-3h5V7h5v8" /><path d="M12 13h10v2" />'),
    "rodillo": ('<path d="M2 19h20" /><circle cx="7" cy="15" r="4" />'
                '<circle cx="18" cy="16" r="3" /><path d="M7 11V8h8v4" />'
                '<path d="M15 10h3l2 3" />'),
    "generico": ('<path d="M3 19h18" /><rect x="6" y="9" width="8" height="6" />'
                 '<path d="M14 12h4l2 3" />'),
}


def icono_de(equipo) -> str:
    clave = (equipo.get("icono") or equipo.get("id") or "").lower()
    trazos = ICONOS.get(clave, ICONOS["generico"])
    return f'<svg viewBox="0 0 24 24" aria-hidden="true">{trazos}</svg>'


def fotos_de(equipo):
    """Lista de nombres de archivo del equipo, en orden.

    Acepta el formato antiguo de un solo campo `imagen` para no romper fichas
    guardadas antes de que existieran las dos fotos.
    """
    crudas = equipo.get("imagenes")
    if crudas is None:
        una = equipo.get("imagen")
        crudas = [una] if una else []
    return [n.strip() for n in crudas if isinstance(n, str) and n.strip()][:MAX_FOTOS]


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


def figura(base: str, alt: str, medidas: str) -> str:
    """Un <picture> responsivo apuntando a las variantes ya generadas."""
    ruta = "assets/img/equipos/procesados"
    return f'''<div class="fleet-foto">
                <picture>
                  <source
                    type="image/webp"
                    sizes="{medidas}"
                    srcset="{ruta}/{base}-sm.webp 640w, {ruta}/{base}-md.webp 1000w"
                  />
                  <img
                    src="{ruta}/{base}-sm.jpg"
                    sizes="{medidas}"
                    srcset="{ruta}/{base}-sm.jpg 640w, {ruta}/{base}-md.jpg 1000w"
                    alt="{alt}"
                    width="640" height="480" loading="lazy" decoding="async"
                  />
                </picture>
              </div>'''


def tarjeta(equipo, bases) -> str:
    """Arma el HTML de una tarjeta. `bases` son los nombres de las variantes."""
    titulo = html.escape(equipo["titulo"])
    subtitulo = html.escape(equipo.get("subtitulo", ""))
    n = len(bases)

    # Dos fotos no entran en una columna de un cuarto de fila: la tarjeta se
    # promueve a ancha aunque la ficha no lo pida.
    ancho = bool(equipo.get("ancho")) or n == 2

    clases = ["fleet-card"]
    if ancho:
        clases.append("fleet-card--wide")
    if n:
        clases.append("fleet-card--foto")

    if n == 0:
        medio = f'<div class="fleet-icon">{icono_de(equipo)}</div>'
    else:
        if not ancho:
            medidas = "(max-width: 900px) 100vw, 25vw"
        elif n == 2:
            medidas = "(max-width: 900px) 100vw, 28vw"
        else:
            medidas = "(max-width: 900px) 100vw, 46vw"

        alts = [titulo, f"{titulo}, otra vista"]
        piezas = [figura(b, alts[i], medidas) for i, b in enumerate(bases)]
        medio = (f'<div class="fleet-fotos fleet-fotos--{n}">\n              '
                 + "\n              ".join(piezas)
                 + "\n            </div>")

    # En la tarjeta ancha el texto va envuelto: comparte la fila con las fotos
    # y necesita su propia caja para poder centrarse en ella.
    if ancho:
        cuerpo = (f'<div class="fleet-wide-body">\n'
                  f"              <h3>{titulo}</h3>\n"
                  f"              <p>{subtitulo}</p>\n"
                  f"            </div>")
    else:
        cuerpo = f"<h3>{titulo}</h3>\n            <p>{subtitulo}</p>"

    return (f'          <article class="{" ".join(clases)}" data-reveal>\n'
            f"            {medio}\n"
            f"            {cuerpo}\n"
            f"          </article>")


def main():
    os.makedirs(SALIDA, exist_ok=True)
    equipos = leer_ficha()

    tarjetas = []
    escritos = 0
    usados = set()

    for equipo in equipos:
        bases = []
        for indice, nombre in enumerate(fotos_de(equipo), start=1):
            origen = os.path.join(AQUI, nombre)
            if not os.path.exists(origen):
                print(f"  AVISO  {equipo['id']}: falta la imagen '{nombre}'")
                continue
            base = f"{equipo['id']}-{indice}"
            escritos += derivar(origen, base)
            for sufijo, _ in ANCHOS:
                usados.update({f"{base}-{sufijo}.webp", f"{base}-{sufijo}.jpg"})
            bases.append(base)

        tarjetas.append(tarjeta(equipo, bases))
        forma = "ancha" if (equipo.get("ancho") or len(bases) == 2) else "normal"
        print(f"  {equipo['id']:22} {len(bases)} foto(s), {forma}")

    # Limpia variantes de equipos que ya no existen o perdieron su foto.
    for archivo in sorted(os.listdir(SALIDA)):
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
