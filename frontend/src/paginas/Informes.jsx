import { useState } from 'react';
import { api, qs } from '../api/cliente';
import { useDatos } from '../api/useDatos';
import { useAvisos } from '../contexto/Avisos';
import { Cargando, Encabezado, EstadoReintegro, KPI, MensajeError, Paginacion, Tabla } from '../componentes/ui';
import { FILTROS_VACIOS, FiltrosReintegros } from '../componentes/Reintegros';
import { BarrasHorizontales, CATEGORIAS, DivisionCategorias, LeyendaCategorias, ReintegrosPorMes } from '../componentes/Graficos';
import { generarPdf } from '../informes/pdf';
import { ESTADOS_REINTEGRO } from '../config';
import { cop, fecha, num } from '../formato';

const variacion = v => (v == null ? 'sin base de comparación' : `${v > 0 ? '+' : ''}${v.toLocaleString('es-CO')} %`);

export default function Informes() {
  const avisar = useAvisos();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [verObjetos, setVerObjetos] = useState(15);
  const fechasOk = !(filtros.desde && filtros.hasta && filtros.desde > filtros.hasta);
  const consulta = qs(filtros);
  const { datos: r, cargando, error, recargar } = useDatos('/informes/resumen' + consulta, { activo: fechasOk });
  const { datos: det, cargando: cargDet } = useDatos('/reintegros' + qs({ ...filtros, pagina, por_pagina: 10, orden: 'fecha' }), { activo: fechasOk });
  const cambiar = f => { setFiltros(f); setPagina(1); };

  const exportar = async () => {
    setExportando(true);
    try { const x = await api.descargar('/informes/reintegros.xlsx' + consulta, 'reintegros.xlsx'); avisar(`Excel generado: ${x.nombre} con ${num(x.filas)} registros.`); }
    catch (e) { avisar(e.message, 'error'); } finally { setExportando(false); }
  };

  const pdf = async () => {
    setGenerandoPdf(true);
    try { const x = await generarPdf(r, filtros); avisar(`PDF generado (${x.paginas} páginas).`); }
    catch (e) { avisar('No se pudo generar el PDF: ' + e.message, 'error'); } finally { setGenerandoPdf(false); }
  };

  return (
    <>
      <Encabezado antetitulo="Informes y estadísticas" titulo="Reintegros">
        <button type="button" className="btn" onClick={pdf} disabled={generandoPdf || !r || !r.total_registros}>{generandoPdf ? 'Generando PDF…' : 'Reporte en PDF'}</button>
        <button type="button" className="btn pri" onClick={exportar} disabled={exportando || !r || !r.total_registros}>{exportando ? 'Generando Excel…' : 'Exportar a Excel'}</button>
      </Encabezado>
      <FiltrosReintegros valor={filtros} alCambiar={cambiar} alLimpiar={() => cambiar(FILTROS_VACIOS)} />
      <MensajeError error={error} alReintentar={recargar} />
      {cargando && !r ? <Cargando /> : r && (
        <div className={cargando ? 'atenuado' : ''}>
          <section className="kpis seis" aria-label="Resumen">
            <KPI titulo="Registros" valor={num(r.total_registros)} detalle="con los filtros aplicados" />
            <KPI titulo="Realizados" valor={num(r.realizados.n)} detalle={`${num(r.realizados.elementos)} elementos`} tono="ok" />
            <KPI titulo="Valor realizado" valor={cop(r.realizados.valor)} detalle={r.realizados.con_valor < r.realizados.n ? `${num(r.realizados.n - r.realizados.con_valor)} sin valor registrado` : 'todos con valor'} />
            {['pendiente', 'rechazado', 'anulado'].map(e => <KPI key={e} titulo={ESTADOS_REINTEGRO[e].t + 's'} valor={num(r.por_estado[e].n)} detalle={`${cop(r.por_estado[e].valor)} · no cuentan como realizados`} tono={ESTADOS_REINTEGRO[e].clase} />)}
          </section>

          <div className="rejilla-2">
            <section className="tarjeta">
              <h2>Mobiliario frente a eléctrico</h2>
              <p className="m">Elementos reintegrados por categoría. Lo que no es mobiliario se cuenta como eléctrico, igual que en la aplicación de reintegros.</p>
              <DivisionCategorias datos={r.por_categoria} />
              <Tabla claveFila={x => x.categoria} filas={r.por_categoria} columnas={[
                { k: 'categoria', t: 'Categoría', render: x => CATEGORIAS[x.categoria].t }, { k: 'registros', t: 'Registros', clase: 'num', render: x => num(x.registros) },
                { k: 'elementos', t: 'Elementos', clase: 'num', render: x => num(x.elementos) }]} />
            </section>
            <section className="tarjeta">
              <h2>Top 10 de instituciones con más reintegros</h2>
              <p className="m">Por número de registros. Toca una para ver solo sus reintegros.</p>
              <BarrasHorizontales titulo="Top 10 de instituciones" alElegir={x => x.id && cambiar({ ...filtros, institucion_id: String(x.id) })}
                filas={r.top_instituciones.map(x => ({ clave: x.institucion + x.institucion_id, id: x.institucion_id, etiqueta: x.institucion, valor: x.n,
                  detalle: `${num(x.elementos)} elementos · ${num(x.mobiliario)} mobiliario · ${num(x.electrico)} eléctrico${x.pendientes ? ` · ${num(x.pendientes)} pendientes` : ''}` }))} />
            </section>
          </div>

          <section className="tarjeta">
            <div className="tarjeta-h"><h2>Lo que más se reintegra</h2><span className="m">{num(r.articulos_distintos)} objetos distintos · toca uno para filtrar</span></div>
            <LeyendaCategorias />
            <BarrasHorizontales titulo="Elementos reintegrados por objeto" alElegir={x => cambiar({ ...filtros, articulo: x.clave })}
              filas={r.por_articulo.slice(0, verObjetos).map(x => ({ clave: x.articulo, etiqueta: x.articulo, valor: x.elementos, color: (CATEGORIAS[x.categoria] || CATEGORIAS.electrico).color,
                detalle: `${CATEGORIAS[x.categoria]?.t || '—'} · ${num(x.registros)} registros` }))} />
            {r.por_articulo.length > verObjetos && <button type="button" className="btn sm" onClick={() => setVerObjetos(v => v + 25)}>Ver más objetos ({num(r.por_articulo.length - verObjetos)} restantes)</button>}
          </section>

          <div className="rejilla-2">
            <section className="tarjeta">
              <h2>Por período</h2>
              <p className="m">Reintegros por mes y estado. Pasa el cursor sobre una barra para ver el detalle.</p>
              {r.por_periodo.length ? <ReintegrosPorMes datos={r.por_periodo} valorRealizado /> : <p className="vacio">Sin datos para graficar.</p>}
            </section>
            <section className="tarjeta">
              <h2>Comparación entre períodos</h2>
              {r.comparacion ? (
                <>
                  <p className="m">Período elegido frente a los {num(r.comparacion.dias)} días inmediatamente anteriores.</p>
                  <Tabla claveFila={x => x.p} filas={[
                    { p: 'Actual', ...r.comparacion.actual }, { p: 'Anterior', ...r.comparacion.anterior }
                  ]} columnas={[
                    { k: 'p', t: 'Período', render: x => <span className="doble"><b>{x.p}</b><small>{fecha(x.desde)} – {fecha(x.hasta)}</small></span> },
                    { k: 'registros', t: 'Registros', clase: 'num', render: x => num(x.registros) },
                    { k: 'realizados', t: 'Realizados', clase: 'num', render: x => num(x.realizados) },
                    { k: 'valor_realizado', t: 'Valor realizado', clase: 'num', render: x => cop(x.valor_realizado) }
                  ]} />
                  <p className="variacion">Realizados: <b>{variacion(r.comparacion.variacion_realizados_pct)}</b> · Valor: <b>{variacion(r.comparacion.variacion_valor_pct)}</b></p>
                </>
              ) : <p className="vacio">Elige una fecha inicial y una final para compararlas con el período anterior de igual duración.</p>}
            </section>
            <section className="tarjeta">
              <h2>Por institución</h2>
              <p className="m">Las 15 con más reintegros realizados.</p>
              <Tabla claveFila={x => x.institucion + x.institucion_id} filas={r.por_institucion} columnas={[
                { k: 'institucion', t: 'Institución' }, { k: 'n', t: 'Registros', clase: 'num', render: x => num(x.n) },
                { k: 'realizados', t: 'Realizados', clase: 'num', render: x => num(x.realizados) }, { k: 'valor_realizado', t: 'Valor realizado', clase: 'num', render: x => cop(x.valor_realizado) }]} />
            </section>
            <section className="tarjeta">
              <h2>Por municipio y estado</h2>
              <Tabla claveFila={x => x.municipio} filas={r.por_municipio} columnas={[
                { k: 'municipio', t: 'Municipio' }, { k: 'n', t: 'Registros', clase: 'num', render: x => num(x.n) },
                { k: 'realizados', t: 'Realizados', clase: 'num', render: x => num(x.realizados) }, { k: 'valor_realizado', t: 'Valor realizado', clase: 'num', render: x => cop(x.valor_realizado) }]} />
              <h3 className="h3">Por estado</h3>
              <Tabla claveFila={x => x.e} filas={Object.keys(ESTADOS_REINTEGRO).map(e => ({ e, ...r.por_estado[e] }))} columnas={[
                { k: 'e', t: 'Estado', render: x => <EstadoReintegro estado={x.e} /> }, { k: 'n', t: 'Registros', clase: 'num', render: x => num(x.n) },
                { k: 'elementos', t: 'Elementos', clase: 'num', render: x => num(x.elementos) }, { k: 'valor', t: 'Valor', clase: 'num', render: x => cop(x.valor) }]} />
            </section>
          </div>

          <section className="tarjeta">
            <div className="tarjeta-h"><h2>Registros que se exportarán</h2><span className="m">Mismos filtros del resumen y del Excel</span></div>
            {cargDet && !det ? <Cargando /> : det && (
              <>
                <Tabla filas={det.datos} columnas={[
                  { k: 'codigo', t: 'Código', clase: 'mono' }, { k: 'f', t: 'Fecha', clase: 'nw', render: x => fecha(x.fecha_reintegro) },
                  { k: 'i', t: 'Institución', render: x => x.institucion_nombre || x.institucion_texto || '—' }, { k: 'd', t: 'Elemento', render: x => <span className="doble"><span>{x.descripcion} ×{x.cantidad}</span><small>{x.articulo} · {CATEGORIAS[x.categoria]?.t || ''}</small></span> },
                  { k: 'valor', t: 'Valor', clase: 'num', render: x => cop(x.valor) }, { k: 'estado', t: 'Estado', render: x => <EstadoReintegro estado={x.estado} /> }]} />
                <Paginacion pagina={det.pagina} porPagina={det.por_pagina} total={det.total} alCambiar={setPagina} />
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
