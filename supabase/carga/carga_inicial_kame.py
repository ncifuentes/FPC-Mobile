"""Carga inicial desde KAME: códigos de cliente, clientes faltantes y ubicación de los cilindros.

Cruza los archivos que entrega FPC (exportados de KAME ONE) con la base de producción y genera
una VISTA PREVIA. Nunca escribe en la base: el SQL que produce con --sql se revisa y se ejecuta
aparte.

Uso (desde la raíz del repo; los insumos y la salida quedan FUERA del repo porque traen RUT,
nombres, direcciones y teléfonos):

    python -I supabase/carga/carga_inicial_kame.py "<carpeta de insumos>" \
        --fichas "<ruta a KAME ONE Fichas.xlsx>" [--desde AAAA-MM-DD] [--salida "<carpeta>"]

La carpeta de insumos debe tener:
    Clientes_cod-nombre-rut_*.csv          código;nombre;RUT  (sin encabezado, Latin-1)
    Numero_de_series_en_clientes_*.csv     serie;código cliente;...  (con encabezado, Latin-1)

El estado de la base se lee con `npx supabase db query --remote --read-only` (proyecto enlazado,
sin credenciales en el script). Con --db-json <archivo> se usa una foto ya guardada.

Reglas de cruce (acordadas el 05-11-2026):
  * Clientes por RUT normalizado. Si un RUT tiene dos códigos, codigo_kame = el menor; el otro
    es un alias que solo sirve para ubicar cilindros en el mismo cliente.
  * Se crean los clientes con cilindros que no están en la base, solo si su ficha en KAME es de
    tipo Cliente y está activa (los proveedores se reportan), con una sucursal PRINCIPAL.
  * Series: coincidencia exacta con serie_normalizada; si no hay, coincidencia ÚNICA por prefijo
    o sin ceros a la izquierda. Lo ambiguo no se ubica: va al reporte.
  * Cilindros con movimientos no se tocan: el trigger manda sobre ellos.
  * Un cilindro sin cliente en el archivo queda como está.
"""
from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import re
import subprocess
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import date

CODIGO_DESPACHO = '99'  # «Despacho», RUT 0: no es un cliente
NOMBRE_SUCURSAL = 'PRINCIPAL'
LARGO_MINIMO_PREFIJO = 4  # una serie más corta no se resuelve por prefijo


# ------------------------------------------------------------------ normalización
def rut_compacto(rut: str) -> str:
    return re.sub(r'[\s.\-]', '', rut or '').upper()


def rut_con_guion(rut: str) -> str:
    r = rut_compacto(rut)
    return f'{r[:-1]}-{r[-1]}' if len(r) >= 2 else r


def serie_norm(serie: str) -> str:
    return re.sub(r'\s', '', serie or '').upper()


def sin_ceros(s: str) -> str:
    return s.lstrip('0') or s


def limpio(v):
    v = re.sub(r'\s+', ' ', v or '').strip()
    return v or None


# ------------------------------------------------------------------ lectura de insumos
def un_archivo(carpeta: str, patron: str) -> str:
    hallados = sorted(glob.glob(os.path.join(carpeta, patron)))
    if len(hallados) != 1:
        sys.exit(f'Se esperaba un archivo {patron} en {carpeta}; hay {len(hallados)}')
    return hallados[0]


def leer_codigos(ruta: str) -> dict[str, dict]:
    """codigo -> {codigo, nombre, rut}."""
    codigos = {}
    with open(ruta, encoding='latin-1', newline='') as f:
        for fila in csv.reader(f, delimiter=';'):
            if not fila or not fila[0].strip():
                continue
            cod, nombre, rut = (c.strip() for c in fila[:3])
            if cod in codigos:
                sys.exit(f'Código KAME repetido en el archivo de clientes: {cod}')
            codigos[cod] = {'codigo': cod, 'nombre': nombre, 'rut': rut_compacto(rut)}
    return codigos


def leer_series(ruta: str) -> list[dict]:
    filas = []
    with open(ruta, encoding='latin-1', newline='') as f:
        lector = csv.reader(f, delimiter=';')
        next(lector)  # encabezado
        for n, fila in enumerate(lector, start=2):
            if not fila:
                continue
            filas.append({'linea': n, 'serie': fila[0].strip(),
                          'norm': serie_norm(fila[0]),
                          'codigo': (fila[1].strip() if len(fila) > 1 else '')})
    return filas


def leer_fichas(ruta: str) -> dict[str, list[dict]]:
    """RUT compacto -> fichas. Se parsea el XML de la hoja: openpyxl falla con los estilos."""
    with zipfile.ZipFile(ruta) as z:
        crudo = z.read('xl/worksheets/sheet1.xml')
        compartidas = []
        if 'xl/sharedStrings.xml' in z.namelist():
            ss = z.read('xl/sharedStrings.xml').decode('utf-8', 'replace')
            compartidas = [desescapar(''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S)))
                           for si in re.findall(r'<si>(.*?)</si>', ss, re.S)]
    m = re.match(rb'<\?xml[^>]*encoding="([^"]+)"', crudo)
    texto = crudo.decode(m.group(1).decode() if m else 'utf-8', 'replace')
    if '�' in texto:
        texto = crudo.decode('latin-1')
    filas = []
    for fila in re.findall(r'<row[^>]*>(.*?)</row>', texto, re.S):
        celdas = {}
        for attrs, cuerpo in re.findall(r'<c([^>]*?)(?:/>|>(.*?)</c>)', fila, re.S):
            col = re.search(r'r="([A-Z]+)\d+"', attrs).group(1)
            if 't="s"' in attrs:
                v = re.search(r'<v>(.*?)</v>', cuerpo or '')
                valor = compartidas[int(v.group(1))] if v else ''
            else:
                t = re.findall(r'<t[^>]*>(.*?)</t>', cuerpo or '', re.S)
                v = re.search(r'<v>(.*?)</v>', cuerpo or '')
                valor = desescapar(''.join(t)) if t else (v.group(1) if v else '')
            celdas[col] = valor
        filas.append(celdas)
    encabezado = [filas[0].get(c, '') for c in 'ABCDEFG']
    if not encabezado[0].lower().startswith('rut') or not encabezado[1].lower().startswith('nombre'):
        sys.exit(f'Encabezado inesperado en Fichas: {encabezado}')
    fichas = defaultdict(list)
    for celdas in filas[1:]:
        rut = rut_compacto(celdas.get('A', ''))
        if rut:
            fichas[rut].append({'rut': rut, 'nombre': limpio(celdas.get('B')),
                                'tipo': limpio(celdas.get('C')) or '',
                                'direccion': limpio(celdas.get('D')),
                                'telefono': limpio(celdas.get('E')),
                                'email': limpio(celdas.get('F')),
                                'estado': limpio(celdas.get('G')) or ''})
    return fichas


def desescapar(s: str) -> str:
    return (s.replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')
             .replace('&apos;', "'").replace('&amp;', '&'))


# ------------------------------------------------------------------ lectura de la base
CONSULTA_BASE = """
select json_build_object(
  'clientes', (select coalesce(json_agg(json_build_object(
      'id', c.id, 'rut', c.rut, 'nombre', c.nombre, 'codigo_kame', c.codigo_kame, 'activo', c.activo)), '[]')
    from clientes c),
  'sucursales', (select coalesce(json_agg(json_build_object(
      'id', s.id, 'cliente_id', s.cliente_id, 'nombre', s.nombre,
      'es_principal', s.es_principal, 'activo', s.activo)), '[]')
    from sucursales s),
  'cilindros', (select coalesce(json_agg(json_build_object(
      'id', c.id, 'numero_serie', c.numero_serie, 'serie_normalizada', c.serie_normalizada,
      'estado', c.estado, 'sucursal_actual_id', c.sucursal_actual_id,
      'en_cliente_desde', c.en_cliente_desde, 'activo', c.activo,
      'movimientos', (select count(*) from movimientos m where m.cilindro_id = c.id))), '[]')
    from cilindros c)
) as foto
"""


def leer_base(db_json: str | None) -> dict:
    if db_json:
        with open(db_json, encoding='utf-8') as f:
            return json.load(f)
    sql = ' '.join(CONSULTA_BASE.split())
    r = subprocess.run(f'npx supabase db query --remote --read-only "{sql}"', shell=True,
                       capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0:
        sys.exit(f'Falló la lectura de la base:\n{r.stderr}')
    salida = r.stdout[r.stdout.index('{'):]
    foto = json.loads(salida)['rows'][0]['foto']
    return json.loads(foto) if isinstance(foto, str) else foto


# ------------------------------------------------------------------ cruce
def cruzar(codigos, series, fichas, base, desde):
    clientes_por_rut = {rut_compacto(c['rut']): c for c in base['clientes']}
    codigos_en_uso = {c['codigo_kame']: c for c in base['clientes'] if c['codigo_kame']}
    suc_por_cliente = defaultdict(list)
    for s in base['sucursales']:
        if s['activo']:
            suc_por_cliente[s['cliente_id']].append(s)

    # --- códigos por RUT: el menor es el oficial, el resto alias
    codigos_por_rut = defaultdict(list)
    for c in codigos.values():
        if c['codigo'] != CODIGO_DESPACHO:
            codigos_por_rut[c['rut']].append(c['codigo'])
    for lista in codigos_por_rut.values():
        lista.sort(key=lambda x: (int(x) if x.isdigit() else 10**12, x))
    oficial = {rut: lista[0] for rut, lista in codigos_por_rut.items()}
    duplicados = {rut: lista for rut, lista in codigos_por_rut.items() if len(lista) > 1}

    cambios_clientes, avisos_clientes = [], []
    for rut, cli in clientes_por_rut.items():
        if rut not in oficial:
            continue
        cod = oficial[rut]
        if cli['codigo_kame'] == cod:
            continue
        otro = codigos_en_uso.get(cod)
        if cli['codigo_kame'] or (otro and otro['id'] != cli['id']):
            avisos_clientes.append({'rut': rut_con_guion(rut), 'cliente': cli['nombre'],
                                    'codigo_actual': cli['codigo_kame'], 'codigo_archivo': cod,
                                    'motivo': 'ya tiene otro código o el código lo usa otro cliente'})
            continue
        cambios_clientes.append({'rut': rut_con_guion(rut), 'cliente': cli['nombre'],
                                 'codigo_kame': cod,
                                 'alias': ' '.join(duplicados.get(rut, [])[1:])})

    # --- agrupar series del archivo por serie normalizada
    por_serie = defaultdict(list)
    vacias = []
    for f in series:
        (por_serie[f['norm']] if f['norm'] else vacias).append(f)

    def destino_de_codigo(cod):
        """-> ('ok', rut) | ('motivo', detalle)."""
        if cod == CODIGO_DESPACHO:
            return 'codigo_despacho', 'código 99 Despacho no es un cliente'
        if cod not in codigos:
            return 'codigo_desconocido', f'código {cod} no está en el archivo de clientes'
        return 'ok', codigos[cod]['rut']

    # --- clientes a crear: RUT con cilindros que no está en la base
    ruts_con_cilindros = Counter()
    for filas in por_serie.values():
        for f in filas:
            if f['codigo']:
                est, rut = destino_de_codigo(f['codigo'])
                if est == 'ok':
                    ruts_con_cilindros[rut] += 1
    nuevos, no_creados = {}, {}
    for rut, n in ruts_con_cilindros.items():
        if rut in clientes_por_rut:
            continue
        cand = fichas.get(rut, [])
        ficha = next((x for x in cand if 'cliente' in x['tipo'].lower()
                      and x['estado'].lower().startswith('activ')), None)
        cod = oficial[rut]
        if ficha is None:
            tipos = ', '.join(f"{x['tipo']}/{x['estado']}" for x in cand) or 'sin ficha'
            no_creados[rut] = {'rut': rut_con_guion(rut), 'codigo_kame': cod,
                               'nombre': codigos[cod]['nombre'], 'cilindros_en_archivo': n,
                               'motivo': f'no es cliente activo en Fichas ({tipos})'}
        elif not ficha['direccion']:
            no_creados[rut] = {'rut': rut_con_guion(rut), 'codigo_kame': cod,
                               'nombre': ficha['nombre'], 'cilindros_en_archivo': n,
                               'motivo': 'Fichas no trae dirección (sucursales.direccion es obligatoria)'}
        else:
            nuevos[rut] = {'rut': rut_con_guion(rut), 'codigo_kame': cod,
                           'alias': ' '.join(duplicados.get(rut, [])[1:]),
                           'nombre': ficha['nombre'] or codigos[cod]['nombre'],
                           'tipo_ficha': ficha['tipo'], 'sucursal': NOMBRE_SUCURSAL,
                           'direccion': ficha['direccion'], 'telefono': ficha['telefono'],
                           'email': ficha['email'], 'cilindros_en_archivo': n}

    def sucursal_destino(rut):
        """-> (sucursal_id | None para cliente nuevo, nombre sucursal, cliente) | (None, motivo, None)."""
        if rut in nuevos:
            return 'NUEVA', NOMBRE_SUCURSAL, nuevos[rut]['nombre']
        if rut in no_creados:
            return None, 'cliente_no_creado: ' + no_creados[rut]['motivo'], None
        cli = clientes_por_rut.get(rut)
        if cli is None:
            return None, 'cliente_fuera_de_la_base', None
        suc = suc_por_cliente.get(cli['id'], [])
        princ = [s for s in suc if s['es_principal']]
        if len(princ) == 1:
            return princ[0]['id'], princ[0]['nombre'], cli['nombre']
        if len(suc) == 1:
            return suc[0]['id'], suc[0]['nombre'], cli['nombre']
        return None, f'cliente con {len(suc)} sucursales activas y {len(princ)} principales', None

    # --- maestro de la base
    cil_por_norm = {c['serie_normalizada']: c for c in base['cilindros']}
    exactas = {n for n in por_serie if n in cil_por_norm}

    def candidatos(norm):
        if norm in cil_por_norm:
            return [cil_por_norm[norm]], 'exacta'
        base_n = sin_ceros(norm)
        if len(base_n) < LARGO_MINIMO_PREFIJO:
            return [], 'serie demasiado corta para cruzar por prefijo'
        cands = [c for k, c in cil_por_norm.items()
                 if k not in exactas and (sin_ceros(k) == base_n or sin_ceros(k).startswith(base_n))]
        return cands, 'prefijo/ceros'

    a_ubicar, no_ubicados, con_movimientos, sin_cliente_en_cliente = [], [], [], []
    asignados = defaultdict(list)  # cilindro_id -> series del archivo
    for norm, filas in por_serie.items():
        codigos_fila = [f['codigo'] for f in filas if f['codigo']]
        serie_txt = ' | '.join(sorted({f['serie'] for f in filas}))
        lineas = ' '.join(str(f['linea']) for f in filas)
        repetida = len(filas) > 1
        cands, como = candidatos(norm)
        base_reg = {'serie_archivo': serie_txt, 'lineas': lineas,
                    'codigos_archivo': ' '.join(codigos_fila) or '(vacío)',
                    'cliente_archivo': ' | '.join(sorted({codigos[c]['nombre'] if c in codigos else '?'
                                                          for c in codigos_fila}))}
        if len(cands) != 1:
            motivo = ('sin_candidato_en_base' if not cands else
                      f'varios_candidatos ({" ".join(c["numero_serie"] for c in cands[:5])})')
            if not cands and como != 'prefijo/ceros':
                motivo += f' ({como})'
            if codigos_fila:
                no_ubicados.append({**base_reg, 'serie_base': '', 'motivo': motivo})
            continue
        cil = cands[0]
        asignados[cil['id']].append(norm)
        base_reg['serie_base'] = cil['numero_serie']
        base_reg['cruce'] = como

        # resolver cliente (los alias caen en el mismo RUT)
        destinos = set()
        problemas = []
        for cod in codigos_fila:
            est, val = destino_de_codigo(cod)
            (destinos.add(val) if est == 'ok' else problemas.append(val))
        if cil['movimientos'] > 0:
            con_movimientos.append({**base_reg, 'movimientos': cil['movimientos'],
                                    'estado_actual': cil['estado']})
            continue
        if not codigos_fila:
            if cil['estado'] == 'en_cliente':
                sin_cliente_en_cliente.append({**base_reg, 'estado_actual': cil['estado']})
            continue
        if problemas:
            no_ubicados.append({**base_reg, 'motivo': '; '.join(problemas)})
            continue
        if len(destinos) > 1:
            no_ubicados.append({**base_reg, 'motivo': 'serie repetida en clientes distintos'})
            continue
        rut = destinos.pop()
        suc_id, suc_nombre, cliente = sucursal_destino(rut)
        if suc_id is None:
            no_ubicados.append({**base_reg, 'motivo': suc_nombre})
            continue
        ya_esta = (cil['estado'] == 'en_cliente' and cil['sucursal_actual_id'] == suc_id)
        a_ubicar.append({**base_reg, 'cilindro_id': cil['id'], 'rut': rut_con_guion(rut),
                         'cliente': cliente, 'sucursal': suc_nombre,
                         'sucursal_id': '' if suc_id == 'NUEVA' else suc_id,
                         'estado_actual': cil['estado'], 'estado_nuevo': 'en_cliente',
                         'repetida_en_archivo': 'sí' if repetida else '',
                         'sin_cambio': 'sí' if ya_esta else ''})

    # Dos series del archivo que caen en el mismo cilindro: no se ubica ninguna.
    choques = {cid for cid, ns in asignados.items() if len(ns) > 1}
    if choques:
        for lista in (a_ubicar,):
            for r in [r for r in lista if r['cilindro_id'] in choques]:
                lista.remove(r)
                no_ubicados.append({k: r[k] for k in ('serie_archivo', 'lineas', 'codigos_archivo', 'cliente_archivo', 'serie_base')}
                                   | {'motivo': 'dos series del archivo caen en el mismo cilindro'})
    for f in vacias:
        if f['codigo']:
            no_ubicados.append({'serie_archivo': '(vacía)', 'lineas': str(f['linea']),
                                'codigos_archivo': f['codigo'], 'serie_base': '', 'motivo': 'serie vacía'})

    return {'cambios_clientes': cambios_clientes, 'avisos_clientes': avisos_clientes,
            'nuevos': list(nuevos.values()), 'no_creados': list(no_creados.values()),
            'duplicados': duplicados, 'a_ubicar': a_ubicar, 'no_ubicados': no_ubicados,
            'con_movimientos': con_movimientos, 'sin_cliente_en_cliente': sin_cliente_en_cliente,
            'por_serie': por_serie, 'clientes_por_rut': clientes_por_rut, 'oficial': oficial}


# ------------------------------------------------------------------ salida
def escribir_csv(ruta, filas, columnas):
    with open(ruta, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=columnas, delimiter=';', extrasaction='ignore')
        w.writeheader()
        for r in filas:
            w.writerow(r)


def sql_literal(v):
    return 'null' if v is None or v == '' else "'" + str(v).replace("'", "''") + "'"


def generar_sql(res, desde):
    """SQL idempotente en una transacción. Solo escribe donde hay diferencia."""
    l = ['-- Carga inicial KAME: códigos de cliente, clientes faltantes y ubicación de cilindros.',
         f'-- Generado por supabase/carga/carga_inicial_kame.py el {date.today().isoformat()}.',
         f'-- en_cliente_desde = {desde} 00:00 hora de Chile. Idempotente: una segunda corrida no cambia nada.',
         'begin;', '']
    if res['cambios_clientes']:
        l.append('-- 1. codigo_kame de clientes existentes (solo si está vacío)')
        l.append('update public.clientes c set codigo_kame = v.cod from (values')
        l.append(',\n'.join(f"  ({sql_literal(r['rut'])}, {sql_literal(r['codigo_kame'])})"
                            for r in res['cambios_clientes']))
        l.append(') v(rut, cod) where c.rut = v.rut and c.codigo_kame is null;\n')
    if res['nuevos']:
        l.append('-- 2. clientes nuevos y su sucursal principal')
        l.append('insert into public.clientes (rut, codigo_kame, nombre) values')
        l.append(',\n'.join(f"  ({sql_literal(r['rut'])}, {sql_literal(r['codigo_kame'])}, {sql_literal(r['nombre'])})"
                            for r in res['nuevos']))
        l.append('on conflict (rut) do nothing;\n')
        l.append('insert into public.sucursales (cliente_id, nombre, direccion, telefono, email, es_principal)')
        l.append('select c.id, v.nombre, v.direccion, v.telefono, v.email, true from (values')
        l.append(',\n'.join(f"  ({sql_literal(r['rut'])}, {sql_literal(r['sucursal'])}, {sql_literal(r['direccion'])}, "
                            f"{sql_literal(r['telefono'])}, {sql_literal(r['email'])})" for r in res['nuevos']))
        l.append(') v(rut, nombre, direccion, telefono, email)')
        l.append('join public.clientes c on c.rut = v.rut')
        l.append('where not exists (select 1 from public.sucursales s where s.cliente_id = c.id)')
        l.append('on conflict (cliente_id, nombre) do nothing;\n')
    filas = [r for r in res['a_ubicar'] if not r['sin_cambio']]
    if filas:
        l.append('-- 3. ubicación de cilindros SIN movimientos (sucursal principal del cliente)')
        l.append('update public.cilindros k')
        l.append(f"   set estado = 'en_cliente', sucursal_actual_id = s.id, en_cliente_desde = ({sql_literal(desde)}::timestamp at time zone 'America/Santiago')")
        l.append('  from (values')
        l.append(',\n'.join(f"  ({sql_literal(r['serie_base'])}, {sql_literal(r['rut'])})" for r in filas))
        l.append(') v(serie, rut)')
        l.append('  join public.clientes c on c.rut = v.rut')
        l.append('  join public.sucursales s on s.cliente_id = c.id and s.activo and s.es_principal')
        l.append(' where k.numero_serie = v.serie')
        l.append('   and not exists (select 1 from public.movimientos m where m.cilindro_id = k.id)')
        l.append('   and k.sucursal_actual_id is distinct from s.id;\n')
    # Guarda final: si el estado resultante no es el esperado, la transacción completa se revierte.
    n_cli = len(res['cambios_clientes']) + len(res['nuevos'])
    n_cil = len(res['a_ubicar'])
    l.append('-- 4. guarda: el estado final debe ser exactamente el de la vista previa')
    l.append('do $$ declare v_cli int; v_suc int; v_cil int; begin')
    ruts = ', '.join(sql_literal(r['rut']) for r in res['cambios_clientes'] + res['nuevos'])
    l.append(f'  select count(*) into v_cli from public.clientes where codigo_kame is not null and rut in ({ruts or "null"});')
    nuevos = ', '.join(sql_literal(r['rut']) for r in res['nuevos'])
    l.append(f"  select count(*) into v_suc from public.sucursales s join public.clientes c on c.id = s.cliente_id"
             f" where s.es_principal and s.nombre = '{NOMBRE_SUCURSAL}' and c.rut in ({nuevos or 'null'});")
    series = ', '.join(sql_literal(r['serie_base']) for r in res['a_ubicar'])
    l.append(f"  select count(*) into v_cil from public.cilindros where estado = 'en_cliente' and numero_serie in ({series or 'null'});")
    l.append(f"  if v_cli <> {n_cli} or v_suc <> {len(res['nuevos'])} or v_cil <> {n_cil} then")
    l.append(f"    raise exception 'Carga inconsistente: clientes % de {n_cli}, sucursales % de {len(res['nuevos'])}, cilindros % de {n_cil}', v_cli, v_suc, v_cil;")
    l.append('  end if;')
    l.append('end $$;\n')
    l.append('commit;')
    return '\n'.join(l) + '\n'


def resumen_md(res, base, desde, rutas):
    est_actual = Counter(c['estado'] for c in base['cilindros'])
    cambios = Counter((r['estado_actual'], r['estado_nuevo']) for r in res['a_ubicar'] if not r['sin_cambio'])
    est_final = Counter(est_actual)
    for (a, b), n in cambios.items():
        est_final[a] -= n
        est_final[b] += n
    motivos = Counter(re.sub(r' \(.*', '', r['motivo']) for r in res['no_ubicados'])
    clientes_destino = {r['rut'] for r in res['a_ubicar']}
    filas_con_cliente = sum(1 for f in res['por_serie'].values() for x in f if x['codigo'])
    series_con_cliente = sum(1 for f in res['por_serie'].values() if any(x['codigo'] for x in f))
    cods_con_cil = {x['codigo'] for f in res['por_serie'].values() for x in f if x['codigo']}
    repetidas = sum(1 for f in res['por_serie'].values() if len(f) > 1)
    cruce = Counter(r.get('cruce') for r in res['a_ubicar'])
    m = []
    m.append(f'# Carga inicial KAME — vista previa ({date.today().isoformat()})\n')
    m.append('Generado por `supabase/carga/carga_inicial_kame.py`. **Nada se ha escrito en la base.**\n')
    m.append('## Archivo de series\n')
    m.append(f'- Filas con cliente: **{filas_con_cliente}** en **{len(cods_con_cil)}** códigos de cliente; '
             f'series únicas con cliente: {series_con_cliente}.')
    m.append(f'- Series repetidas en el archivo (al normalizar): {repetidas}.\n')
    m.append('## Clientes\n')
    m.append(f'- Clientes en la base: {len(base["clientes"])}.')
    m.append(f'- Reciben `codigo_kame`: **{len(res["cambios_clientes"])}** '
             f'(de ellos {sum(1 for r in res["cambios_clientes"] if r["alias"])} con un código alias por RUT duplicado).')
    m.append(f'- Avisos (código que no se pudo asignar): {len(res["avisos_clientes"])}.')
    m.append(f'- Clientes a crear (con sucursal PRINCIPAL): **{len(res["nuevos"])}**.')
    m.append(f'- Con cilindros pero no se crean: {len(res["no_creados"])} '
             + ''.join(f'\n  - `{r["codigo_kame"]}` {r["nombre"]} — {r["motivo"]} ({r["cilindros_en_archivo"]} cil.)'
                       for r in res['no_creados']))
    m.append(f'- RUT con dos códigos en el archivo: {len(res["duplicados"])} (se asigna el menor; el mayor es alias).\n')
    m.append('## Cilindros\n')
    m.append(f'- A ubicar en cliente: **{sum(1 for r in res["a_ubicar"] if not r["sin_cambio"])}** cilindros '
             f'en **{len(clientes_destino)}** clientes '
             f'(cruce exacto {cruce.get("exacta", 0)}, por prefijo/ceros {cruce.get("prefijo/ceros", 0)}).')
    if any(r['sin_cambio'] for r in res['a_ubicar']):
        m.append(f'- Ya estaban bien ubicados (sin cambio): {sum(1 for r in res["a_ubicar"] if r["sin_cambio"])}.')
    m.append(f'- No ubicados (con cliente en el archivo): **{len(res["no_ubicados"])}**')
    for mot, n in motivos.most_common():
        m.append(f'  - {mot}: {n}')
    m.append(f'- Con movimientos (no se tocan, manda el trigger): **{len(res["con_movimientos"])}**; '
             f'de ellos {sum(1 for r in res["con_movimientos"] if r["codigos_archivo"] != "(vacío)")} con cliente en el archivo.')
    m.append(f'- Sin cliente en el archivo y hoy `en_cliente` (sin movimientos): {len(res["sin_cliente_en_cliente"])}.\n')
    m.append('## Cambios de estado\n')
    m.append('| De | A | Cilindros |\n|---|---|---|')
    for (a, b), n in sorted(cambios.items()):
        m.append(f'| {a} | {b} | {n} |')
    m.append('\n| Estado | Hoy | Después |\n|---|---|---|')
    for e in ('en_planta', 'en_camion', 'en_cliente'):
        m.append(f'| {e} | {est_actual.get(e, 0)} | {est_final.get(e, 0)} |')
    m.append(f'\n`en_cliente_desde` propuesto: **{desde or "(sin definir)"}**.\n')
    m.append('## Archivos\n')
    for r in rutas:
        m.append(f'- `{os.path.basename(r)}`')
    return '\n'.join(m) + '\n'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('insumos')
    ap.add_argument('--fichas', required=True)
    ap.add_argument('--salida')
    ap.add_argument('--desde', help='en_cliente_desde (AAAA-MM-DD). Con esto se genera carga.sql')
    ap.add_argument('--db-json', help='foto de la base ya guardada, en vez de consultarla')
    a = ap.parse_args()

    salida = a.salida or os.path.join(a.insumos, 'Carga inicial - vista previa')
    os.makedirs(salida, exist_ok=True)
    codigos = leer_codigos(un_archivo(a.insumos, 'Clientes_cod-nombre-rut_*.csv'))
    series = leer_series(un_archivo(a.insumos, 'Numero_de_series_en_clientes_*.csv'))
    fichas = leer_fichas(a.fichas)
    base = leer_base(a.db_json)
    if not a.db_json:
        with open(os.path.join(salida, 'foto_base.json'), 'w', encoding='utf-8') as f:
            json.dump(base, f, ensure_ascii=False)

    res = cruzar(codigos, series, fichas, base, a.desde)
    rutas = []

    def csv_(nombre, filas, cols):
        ruta = os.path.join(salida, nombre)
        escribir_csv(ruta, filas, cols)
        rutas.append(ruta)

    csv_('clientes_codigo_kame.csv', res['cambios_clientes'], ['rut', 'cliente', 'codigo_kame', 'alias'])
    csv_('clientes_avisos.csv', res['avisos_clientes'], ['rut', 'cliente', 'codigo_actual', 'codigo_archivo', 'motivo'])
    csv_('clientes_nuevos.csv', res['nuevos'], ['rut', 'codigo_kame', 'alias', 'nombre', 'tipo_ficha', 'sucursal',
                                               'direccion', 'telefono', 'email', 'cilindros_en_archivo'])
    csv_('clientes_no_creados.csv', res['no_creados'], ['rut', 'codigo_kame', 'nombre', 'cilindros_en_archivo', 'motivo'])
    csv_('cilindros_a_ubicar.csv', res['a_ubicar'], ['serie_base', 'serie_archivo', 'lineas', 'codigos_archivo', 'cruce',
                                                    'rut', 'cliente', 'sucursal', 'estado_actual', 'estado_nuevo',
                                                    'repetida_en_archivo', 'sin_cambio'])
    csv_('cilindros_no_ubicados.csv', res['no_ubicados'], ['serie_archivo', 'lineas', 'codigos_archivo', 'cliente_archivo',
                                                          'serie_base', 'motivo'])
    csv_('cilindros_con_movimientos.csv', res['con_movimientos'], ['serie_base', 'serie_archivo', 'codigos_archivo', 'cliente_archivo',
                                                                  'movimientos', 'estado_actual'])
    csv_('cilindros_sin_cliente_hoy_en_cliente.csv', res['sin_cliente_en_cliente'],
         ['serie_base', 'serie_archivo', 'estado_actual'])
    if a.desde:
        date.fromisoformat(a.desde)
        ruta = os.path.join(salida, 'carga.sql')
        with open(ruta, 'w', encoding='utf-8') as f:
            f.write(generar_sql(res, a.desde))
        rutas.append(ruta)
    ruta = os.path.join(salida, 'resumen.md')
    texto = resumen_md(res, base, a.desde, rutas)
    with open(ruta, 'w', encoding='utf-8') as f:
        f.write(texto)
    print(texto)


if __name__ == '__main__':
    main()
