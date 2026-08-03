"""
Normaliza los logos de clientes a siluetas monocromas transparentes.

Los originales vienen en formatos incompatibles entre si: unos sobre blanco,
otros sobre fondo oscuro, uno con canal alfa propio y uno que es una foto con
el logo encima. Pegados tal cual, el muro de clientes se ve como un collage de
parches.

La salida es un PNG por logo con la marca en negro y el resto transparente.
En claro se muestran a media opacidad; en oscuro basta invertirlos por CSS.
Ese es el tratamiento habitual de un muro de clientes y ademas los iguala
opticamente, que es lo que hace que se lean como un conjunto.

Uso:  python _normalizar.py
"""

import os

import numpy as np
from PIL import Image

SALIDA = "mono"

# Todos los logos se encajan en la MISMA caja, centrados. Normalizar solo por
# alto hacia que un wordmark ancho como Malpo se comiera el muro: con caja
# comun, los anchos se escalan por ancho y los cuadrados por alto, que es lo
# que iguala el peso visual. En pantalla se muestran a ~44 px de alto.
CAJA = (420, 150)

# Realce de medios tonos de la silueta. Las marcas de bajo contraste -un
# contorno fino, un naranjo sobre negro- quedan lavadas sin esto.
GAMMA = 0.72

# Como extraer la marca de cada archivo:
#   "alfa"   el PNG ya trae la silueta en su canal alfa
#   "claro"  marca oscura sobre fondo claro -> alfa = 255 - luminancia
#   "oscuro" marca clara sobre fondo oscuro -> se estima el fondo y se resta
#   "foto"   marca clara sobre fotografia   -> igual, con margen mas alto
# El segundo valor es el margen sobre el fondo: cuanto hay que superar para
# contar como marca. Mas alto = mas agresivo limpiando el fondo.
CONFIG = {
    "ByS_Hormigones.png": ("claro", None),
    "auter.jpg": ("claro", None),
    "grenergy.png": ("alfa", None),
    "iSiete.jpg": ("claro", None),
    "independencia.jpg": ("claro", None),
    "malpo.png": ("oscuro", 34),
    "nuevos_aires.png": ("oscuro", 26),
    "rahuen.jpg": ("oscuro", 22),
    "saurias.jpg": ("foto", 115),
    "sigdo_koopers.png": ("claro", None),
}


def luminancia(rgb: np.ndarray) -> np.ndarray:
    return 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]


def fondo_del_borde(lum: np.ndarray) -> float:
    """Luminancia del fondo, medida en el marco exterior de la imagen.

    Suponer que el fondo es negro puro es lo que convirtio a malpo y a nuevos
    aires en rectangulos rellenos: sus fondos son rojo oscuro y gris, con
    luminancia suficiente para quedar semiopacos. Se mide y se resta.
    """
    borde = np.concatenate([
        lum[0, :], lum[-1, :], lum[:, 0], lum[:, -1],
    ])
    return float(np.median(borde))


def extraer(ruta: str, modo: str, umbral):
    im = Image.open(ruta).convert("RGBA")
    datos = np.asarray(im).astype(float)

    if modo == "alfa":
        alfa = datos[:, :, 3].copy()
    else:
        # Se aplana sobre blanco para que el antialias del borde no quede
        # mezclado con negro y engorde la silueta.
        a = datos[:, :, 3:4] / 255.0
        rgb = datos[:, :, :3] * a + 255.0 * (1 - a)
        lum = luminancia(rgb)

        if modo == "claro":
            alfa = 255.0 - lum
        else:
            # "oscuro" y "foto" comparten formula: todo lo que supere el fondo
            # por el margen indicado cuenta como marca, y lo demas se descarta.
            piso = fondo_del_borde(lum) + (umbral or 30)
            alfa = np.clip((lum - piso) / max(255.0 - piso, 1.0), 0, 1) * 255.0

    # Estira el rango para que las marcas de bajo contraste no queden lavadas,
    # sin llegar a binarizar: se conserva el antialias del contorno.
    pico = alfa.max()
    if pico > 0:
        alfa = np.clip(alfa / pico, 0, 1) ** GAMMA * 255.0
    alfa[alfa < 14] = 0  # limpia el polvo de fondo

    ancho, alto = im.size
    salida = np.zeros((alto, ancho, 4), dtype=np.uint8)
    salida[:, :, 3] = alfa.astype(np.uint8)  # tinta negra: RGB queda en 0
    return Image.fromarray(salida, "RGBA")


def main():
    os.makedirs(SALIDA, exist_ok=True)
    for archivo, (modo, umbral) in CONFIG.items():
        if not os.path.exists(archivo):
            print(f"FALTA {archivo}")
            continue

        im = extraer(archivo, modo, umbral)
        caja = im.getbbox()
        if caja:
            im = im.crop(caja)

        cw, ch = CAJA
        escala = min(cw / im.width, ch / im.height)
        im = im.resize((max(1, round(im.width * escala)),
                        max(1, round(im.height * escala))), Image.LANCZOS)

        lienzo = Image.new("RGBA", CAJA, (0, 0, 0, 0))
        lienzo.paste(im, ((cw - im.width) // 2, (ch - im.height) // 2))

        destino = os.path.join(SALIDA, os.path.splitext(archivo)[0] + ".png")
        lienzo.save(destino, optimize=True)
        print(f"{archivo:24} -> {os.path.basename(destino):24} ocupa {im.size}")


if __name__ == "__main__":
    main()
