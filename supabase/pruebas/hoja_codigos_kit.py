"""Hoja de códigos Code 128 (juego B) del kit de prueba: SVG dentro de un HTML, sin dependencias.

Uso: python -I supabase/pruebas/hoja_codigos_kit.py "<ruta de salida .html>"
Verificado el 05-11-2026 decodificando los 5 códigos con ZXing (zxing-wasm).
"""
import sys, os, html

P = ("212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 "
     "122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 "
     "321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 "
     "211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 "
     "213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 "
     "121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 "
     "241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 "
     "412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 "
     "211214 211232").split()
STOP = "2331112"
assert len(P) == 106 and len(set(P)) == 106 and all(sum(map(int, p)) == 11 for p in P)


def codificar(texto):
    vals = [ord(c) - 32 for c in texto]
    assert all(0 <= v < 95 for v in vals)
    chk = (104 + sum((i + 1) * v for i, v in enumerate(vals))) % 103
    return ''.join(P[x] for x in [104] + vals + [chk]) + STOP


def svg(texto, modulo=3, alto=110, quieta=12):
    anchos = codificar(texto)
    x = quieta * modulo
    barras = []
    for i, w in enumerate(anchos):
        w = int(w) * modulo
        if i % 2 == 0:
            barras.append(f'<rect x="{x}" y="0" width="{w}" height="{alto}"/>')
        x += w
    total = x + quieta * modulo
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total} {alto}" width="{total}" height="{alto}" '
            f'role="img" aria-label="Código {html.escape(texto)}"><rect width="{total}" height="{alto}" fill="#fff"/>'
            f'<g fill="#000">{"".join(barras)}</g></svg>'), anchos


def main(salida):
    tarjetas, patrones = [], {}
    for n in range(1, 6):
        serie, codigo = f'PRUEBA-0{n}', f'KITPRUEBA0{n}'
        s, anchos = svg(codigo)
        patrones[codigo] = anchos
        tarjetas.append(f'<section class="t"><div class="cb">{s}</div><p class="serie">{serie}</p>'
                        f'<p class="cod">código {codigo} · Code 128</p></section>')
    doc = f'''<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Kit de prueba FPC</title>
<style>
body{{margin:0;padding:24px 16px;background:#fff;color:#111;font:16px/1.4 system-ui,sans-serif}}
h1{{font-size:20px;margin:0 0 4px}} .nota{{color:#555;margin:0 0 20px;font-size:14px}}
.g{{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:20px}}
.t{{border:1px solid #ccc;border-radius:8px;padding:16px;text-align:center;break-inside:avoid}}
.cb svg{{max-width:100%;height:auto}} .serie{{font-size:28px;font-weight:700;margin:8px 0 0;letter-spacing:1px}}
.cod{{margin:2px 0 0;color:#555;font-size:13px}}
@media print{{body{{padding:0}} .t{{border-color:#999}}}}
</style></head><body>
<h1>Kit de prueba — cilindros ficticios</h1>
<p class="nota">Solo para pruebas y la demo. Escanear con la app (cuenta de técnico de prueba, camión PRUEBA).
Cliente: CLIENTE DE PRUEBA, sucursales PRUEBA y PRUEBA 2. Al terminar: <code>node supabase/pruebas/limpiar_kit_prueba.mjs --aplicar</code>.
Si la cámara no lee, la serie se puede tipear a mano.</p>
<div class="g">{"".join(tarjetas)}</div>
<script id="patrones" type="application/json">{__import__('json').dumps(patrones)}</script>
</body></html>'''
    os.makedirs(os.path.dirname(salida), exist_ok=True)
    with open(salida, 'w', encoding='utf-8') as f:
        f.write(doc)
    print(salida)


if __name__ == '__main__':
    main(sys.argv[1])
