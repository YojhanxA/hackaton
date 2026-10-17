/* Importación de los Excel de reintegros de la Secretaría en dos pasos:
   1) Revisar: el backend lee el archivo y explica fila por fila qué pasaría, sin guardar nada.
   2) Importar: se guardan las filas válidas en una sola transacción y la bitácora certifica el archivo. */
import { useMemo, useState } from 'react';
import { api } from '../api/cliente';
import { ESTADOS_REINTEGRO } from '../config';
import { fecha, fechaHora, num } from '../formato';
import { CATEGORIAS } from './Graficos';
import { Campo } from './ui';

const INSIGNIA = { Ok: ['ok', '✓', 'Nueva'], Duplicado: ['neutro', '=', 'Duplicada'], Omitida: ['warn', '!', 'Omitida'], Error: ['crit', '✕', 'Error'] };

export default function ImportarExcel({ alTerminar }) {
  const [archivo, setArchivo] = useState(null);
  const [estado, setEstado] = useState('realizado');
  const [fechaDef, setFechaDef] = useState('');
  const [previa, setPrevia] = useState(null);
  const [ver, setVer] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState('');

  const enviar = async confirmar => {
    if (!archivo) { setError('Selecciona un archivo .xlsx.'); return; }
    setOcupado(true); setError(''); setProgreso(0);
    const fd = new FormData();
    fd.append('estado', estado);
    if (fechaDef) fd.append('fecha_por_defecto', fechaDef);
    fd.append('confirmar', confirmar ? 'true' : 'false');
    fd.append('archivo', archivo);
    try {
      const r = await api.subir('/importaciones', fd, setProgreso);
      if (confirmar) alTerminar(r); else { setPrevia(r); setVer(''); }
    } catch (e) { setError(e.message); }
    finally { setOcupado(false); }
  };
  const elegir = f => { setArchivo(f || null); setPrevia(null); setError(''); };
  const detalles = useMemo(() => (previa ? previa.detalles.filter(d => !ver || d.estado === ver) : []), [previa, ver]);

  return (
    <div className="importar">
      {error && <p className="msg-error" role="alert"><span aria-hidden="true">✕</span>{error}</p>}
      <div className="campos">
        <Campo etiqueta="Archivo de Excel (.xlsx)" requerido ancho="doble" ayuda="Formato de las actas de reintegro: columnas de placa, cantidad y artículo. La fecha se toma del acta o, si falta, de una fecha completa en el nombre del archivo. La institución sale de la celda “Dependencia”. Si tienes un .xls, guárdalo como .xlsx.">
          {p => <input {...p} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => elegir(e.target.files[0])} disabled={ocupado} />}
        </Campo>
        <Campo etiqueta="Estado que se asigna" ayuda="“Pendiente” = aún hay que recogerlos: aparecen en la ruta óptima de recogida.">
          {p => <select {...p} value={estado} onChange={e => { setEstado(e.target.value); setPrevia(null); }} disabled={ocupado}>{Object.entries(ESTADOS_REINTEGRO).map(([k, e]) => <option key={k} value={k}>{e.t}</option>)}</select>}
        </Campo>
        <Campo etiqueta="Fecha por defecto" ayuda="Opcional: solo para filas sin fecha en el acta ni en la fila.">
          {p => <input {...p} type="date" value={fechaDef} onChange={e => { setFechaDef(e.target.value); setPrevia(null); }} disabled={ocupado} />}
        </Campo>
      </div>

      {previa && (
        <section className="previa" aria-live="polite">
          {previa.importado_antes && <p className="aviso-warn">Este mismo archivo ya se importó {previa.importado_antes.map(x => fechaHora(x.creado_en)).join(', ')}. Las filas repetidas se marcan como duplicadas.</p>}
          <div className="kpis-mini">
            <span><b>{num(previa.filas)}</b> filas</span>
            <span className="ok"><b>{num(previa.validos)}</b> nuevas</span>
            <span><b>{num(previa.duplicados)}</b> duplicadas</span>
            <span className="warn"><b>{num(previa.omitidas)}</b> omitidas</span>
            <span className="crit"><b>{num(previa.errores)}</b> con error</span>
          </div>
          <p className="m">
            {num(previa.hojas)} hoja(s) con tabla · {num(previa.asociados)} de {num(previa.validos)} filas nuevas asociadas a una institución del catálogo
            {previa.fecha_heredada ? ` · ${num(previa.fecha_heredada)} con fecha heredada de otra hoja` : ''}{previa.fecha_archivo ? ` · ${num(previa.fecha_archivo)} con fecha extraída del nombre del archivo` : ''}{previa.fecha_por_defecto ? ` · ${num(previa.fecha_por_defecto)} con la fecha por defecto` : ''}.
            {' '}Elementos: <i className="pt-cat" style={{ background: CATEGORIAS.mobiliario.color }} />{num(previa.por_categoria.mobiliario)} mobiliario · <i className="pt-cat" style={{ background: CATEGORIAS.electrico.color }} />{num(previa.por_categoria.electrico)} eléctrico.
          </p>
          <div className="pestanas" role="group" aria-label="Filtrar filas">
            {['', 'Ok', 'Duplicado', 'Omitida', 'Error'].map(k => <button key={k || 'todas'} type="button" className={'btn xs' + (ver === k ? ' pri' : '')} onClick={() => setVer(k)}>{k || 'Todas'}</button>)}
          </div>
          <div className="tabla-envoltura previa-tabla">
            <table>
              <thead><tr><th>Fila</th><th>Resultado</th><th>Elemento</th><th>Detalle</th></tr></thead>
              <tbody>
                {detalles.slice(0, 200).map((d, k) => (
                  <tr key={d.fila + k}>
                    <td className="mono nw">{d.fila}</td>
                    <td><span className={'insignia ' + INSIGNIA[d.estado][0]}><i aria-hidden="true">{INSIGNIA[d.estado][1]}</i>{INSIGNIA[d.estado][2]}</span></td>
                    <td><span className="doble"><span>{d.desc || '—'}</span>{d.articulo && <small>{d.articulo} · {CATEGORIAS[d.categoria].t}</small>}</span></td>
                    <td className="m">{[d.motivo, d.fecha && fecha(d.fecha), d.institucion, d.advertencia].filter(Boolean).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(detalles.length > 200 || previa.detalles_total > previa.detalles.length) && <p className="m">Se muestran las primeras filas del detalle ({num(previa.detalles_total)} en total).</p>}
        </section>
      )}

      <div className="acciones">
        {ocupado && progreso > 0 && progreso < 100 && <span className="m">Subiendo… {progreso} %</span>}
        <button type="button" className="btn" onClick={() => alTerminar(null)} disabled={ocupado}>Cancelar</button>
        {!previa
          ? <button type="button" className="btn pri" onClick={() => enviar(false)} disabled={ocupado || !archivo}>{ocupado ? 'Revisando archivo…' : 'Revisar archivo'}</button>
          : <button type="button" className="btn pri" onClick={() => enviar(true)} disabled={ocupado || !previa.validos}>{ocupado ? 'Importando…' : `Importar ${num(previa.validos)} reintegros`}</button>}
      </div>
    </div>
  );
}
