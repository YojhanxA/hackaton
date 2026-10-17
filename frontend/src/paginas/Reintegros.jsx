import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api/cliente';
import { useDatos } from '../api/useDatos';
import { useAvisos } from '../contexto/Avisos';
import { useSesion } from '../contexto/Sesion';
import { Campo, Cargando, Confirmar, Encabezado, EstadoReintegro, MensajeError, Modal, Paginacion, Tabla } from '../componentes/ui';
import { FILTROS_VACIOS, FiltrosReintegros, SelectorInstitucion } from '../componentes/Reintegros';
import { CATEGORIAS } from '../componentes/Graficos';
import ImportarExcel from '../componentes/ImportarExcel';
import { ESTADOS_REINTEGRO } from '../config';
import { cop, fecha, fechaHora, hoyBogota, num } from '../formato';

const VACIO = { institucion_id: '', institucion_texto: '', fecha_reintegro: '', placa: '', cantidad: '1', descripcion: '', referencia_soporte: '', valor: '', estado: 'pendiente', observaciones: '' };

function validar(f) {
  const e = {};
  if (!f.institucion_id && !f.institucion_texto.trim()) e.institucion_id = 'Selecciona la institución o escribe su nombre.';
  if (!f.fecha_reintegro) e.fecha_reintegro = 'La fecha es obligatoria.';
  else if (f.fecha_reintegro > hoyBogota()) e.fecha_reintegro = 'La fecha no puede estar en el futuro.';
  if (!Number.isInteger(Number(f.cantidad)) || Number(f.cantidad) < 1) e.cantidad = 'La cantidad debe ser un entero mayor o igual a 1.';
  if (f.descripcion.trim().length < 3) e.descripcion = 'Describe el elemento reintegrado.';
  if (f.valor !== '' && (isNaN(Number(f.valor)) || Number(f.valor) < 0)) e.valor = 'El valor debe ser un número positivo.';
  return e;
}

function Formulario({ inicial, alGuardar, alCancelar }) {
  const [f, setF] = useState(inicial);
  const [errores, setErrores] = useState({});
  const [general, setGeneral] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = k => e => { setF(x => ({ ...x, [k]: e.target.value })); setErrores(x => ({ ...x, [k]: undefined })); };
  const enviar = async e => {
    e.preventDefault();
    const errs = validar(f); setErrores(errs); setGeneral('');
    if (Object.keys(errs).length) return;
    setOcupado(true);
    try {
      const cuerpo = { ...f, institucion_id: f.institucion_id === '' ? null : Number(f.institucion_id), cantidad: Number(f.cantidad), valor: f.valor === '' ? null : Number(f.valor) };
      delete cuerpo.id;
      await alGuardar(cuerpo);
    } catch (err) { setErrores(err.porCampo || {}); setGeneral(err.message); setOcupado(false); }
  };
  return (
    <form onSubmit={enviar} noValidate>
      {general && <p className="msg-error" role="alert"><span aria-hidden="true">✕</span>{general}</p>}
      <div className="campos">
        <Campo etiqueta="Institución" requerido={!f.institucion_texto} error={errores.institucion_id} ancho="doble">{p => <SelectorInstitucion {...p} valor={f.institucion_id} alCambiar={v => { setF(x => ({ ...x, institucion_id: v })); setErrores(x => ({ ...x, institucion_id: undefined })); }} />}</Campo>
        <Campo etiqueta="Institución (texto del soporte)" error={errores.institucion_texto} ayuda="Úsalo si la institución no está registrada o para conservar el nombre del archivo original." ancho="doble">{p => <input {...p} value={f.institucion_texto} onChange={set('institucion_texto')} maxLength={255} />}</Campo>
        <Campo etiqueta="Fecha del reintegro" requerido error={errores.fecha_reintegro}>{p => <input {...p} type="date" max={hoyBogota()} value={f.fecha_reintegro} onChange={set('fecha_reintegro')} />}</Campo>
        <Campo etiqueta="Estado del trámite" requerido error={errores.estado}>{p => <select {...p} value={f.estado} onChange={set('estado')}>{Object.entries(ESTADOS_REINTEGRO).map(([k, e]) => <option key={k} value={k}>{e.t}</option>)}</select>}</Campo>
        <Campo etiqueta="Placa" error={errores.placa}>{p => <input {...p} value={f.placa} onChange={set('placa')} maxLength={100} placeholder="SEM-123456" />}</Campo>
        <Campo etiqueta="Cantidad" requerido error={errores.cantidad}>{p => <input {...p} type="number" min="1" step="1" value={f.cantidad} onChange={set('cantidad')} />}</Campo>
        <Campo etiqueta="Descripción del elemento" requerido error={errores.descripcion} ancho="doble">{p => <input {...p} value={f.descripcion} onChange={set('descripcion')} maxLength={2000} placeholder="Ej.: Computador portátil" />}</Campo>
        <Campo etiqueta="Número de referencia o soporte" error={errores.referencia_soporte}>{p => <input {...p} value={f.referencia_soporte} onChange={set('referencia_soporte')} maxLength={120} />}</Campo>
        <Campo etiqueta="Valor (COP)" error={errores.valor} ayuda="Opcional.">{p => <input {...p} type="number" min="0" step="1" value={f.valor} onChange={set('valor')} />}</Campo>
        <Campo etiqueta="Observaciones" error={errores.observaciones} ancho="completo">{p => <textarea {...p} rows={2} value={f.observaciones} onChange={set('observaciones')} maxLength={2000} />}</Campo>
      </div>
      <div className="acciones">
        <button type="button" className="btn" onClick={alCancelar} disabled={ocupado}>Cancelar</button>
        <button type="submit" className="btn pri" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  );
}

export default function Reintegros() {
  const { puede } = useSesion();
  const avisar = useAvisos();
  const [params] = useSearchParams();
  const [filtros, setFiltros] = useState({ ...FILTROS_VACIOS, institucion_id: params.get('institucion_id') || '' });
  const [pagina, setPagina] = useState(1);
  const [editar, setEditar] = useState(null);
  const [borrar, setBorrar] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [importar, setImportar] = useState(false);
  const fechasOk = !(filtros.desde && filtros.hasta && filtros.desde > filtros.hasta);
  const { datos, cargando, error, recargar } = useDatos('/reintegros' + qs({ ...filtros, pagina, por_pagina: 20 }), { activo: fechasOk });
  const cambiar = f => { setFiltros(f); setPagina(1); };

  const guardar = async cuerpo => {
    if (editar.id) await api.put('/reintegros/' + editar.id, cuerpo); else await api.post('/reintegros', cuerpo);
    avisar(editar.id ? 'Reintegro actualizado y registrado en la bitácora.' : 'Reintegro registrado en la bitácora.');
    setEditar(null); recargar();
  };
  const eliminar = async () => {
    setOcupado(true);
    try { await api.del('/reintegros/' + borrar.id); avisar('Reintegro eliminado. El registro queda en la bitácora.'); setBorrar(null); recargar(); }
    catch (e) { avisar(e.message, 'error'); } finally { setOcupado(false); }
  };
  const abrir = r => setEditar(r ? { id: r.id, ...Object.fromEntries(Object.keys(VACIO).map(k => [k, r[k] == null ? '' : String(r[k])])) } : { ...VACIO, fecha_reintegro: hoyBogota() });

  return (
    <>
      <Encabezado antetitulo="Gestión" titulo="Reintegros">
        {puede('editor') && <button type="button" className="btn" onClick={() => setImportar(true)}>Importar Excel</button>}
        {puede('editor') && <button type="button" className="btn pri" onClick={() => abrir(null)}>Registrar reintegro</button>}
      </Encabezado>
      <FiltrosReintegros valor={filtros} alCambiar={cambiar} alLimpiar={() => cambiar(FILTROS_VACIOS)} />
      <section className="tarjeta">
        <MensajeError error={error} alReintentar={recargar} />
        {cargando && !datos ? <Cargando /> : datos && (
          <div className={cargando ? 'atenuado' : ''}>
            <Tabla filas={datos.datos} alClic={puede('editor') ? abrir : null} columnas={[
              { k: 'codigo', t: 'Código', clase: 'mono' },
              { k: 'fecha', t: 'Fecha', clase: 'nw', render: r => fecha(r.fecha_reintegro) },
              { k: 'inst', t: 'Institución', render: r => <span className="doble"><span>{r.institucion_nombre || r.institucion_texto || '—'}</span><small>{r.institucion_municipio || ''}</small></span> },
              { k: 'elem', t: 'Elemento', render: r => <span className="doble"><span>{r.descripcion}</span><small>{[r.placa, r.referencia_soporte].filter(Boolean).join(' · ')}</small></span> },
              { k: 'obj', t: 'Objeto', render: r => <span className="doble"><span>{r.articulo || '—'}</span><small><i className="pt-cat" style={{ background: CATEGORIAS[r.categoria]?.color }} aria-hidden="true" />{CATEGORIAS[r.categoria]?.t || ''}</small></span> },
              { k: 'cantidad', t: 'Cant.', clase: 'num', render: r => num(r.cantidad) },
              { k: 'valor', t: 'Valor', clase: 'num', render: r => cop(r.valor) },
              { k: 'estado', t: 'Estado', render: r => <span className="doble"><EstadoReintegro estado={r.estado} />{r.estado === 'pendiente' && r.institucion_id && <Link className="enlace-ruta" to={'/mapa?destinos=' + r.institucion_id} onClick={e => e.stopPropagation()}>Ver ruta de recogida</Link>}</span> },
              { k: 'act', t: 'Actualizado', clase: 'nw', render: r => <span className="doble"><span>{fechaHora(r.actualizado_en)}</span><small>{r.actualizado_por_nombre || r.creado_por_nombre || 'Carga'}</small></span> },
              ...(puede('admin') ? [{ k: 'acc', t: '', render: r => <button type="button" className="btn xs peligro" onClick={e => { e.stopPropagation(); setBorrar(r); }}>Eliminar</button> }] : [])
            ]} />
            <Paginacion pagina={datos.pagina} porPagina={datos.por_pagina} total={datos.total} alCambiar={setPagina} />
          </div>
        )}
      </section>
      <Modal titulo={editar && editar.id ? `Editar reintegro` : 'Registrar reintegro'} abierto={!!editar} alCerrar={() => setEditar(null)} ancho="lg">
        {editar && <Formulario key={editar.id || 'nuevo'} inicial={editar} alGuardar={guardar} alCancelar={() => setEditar(null)} />}
      </Modal>
      <Modal titulo="Importar reintegros desde Excel" abierto={importar} alCerrar={() => setImportar(false)} ancho="lg">
        {importar && <ImportarExcel alTerminar={imp => { setImportar(false); recargar(); if (imp) avisar(`${num(imp.insertados)} reintegros importados y certificados en la bitácora.`); }} />}
      </Modal>
      <Confirmar abierto={!!borrar} titulo="Eliminar reintegro" peligro accion="Eliminar" ocupado={ocupado} alCerrar={() => setBorrar(null)} alConfirmar={eliminar}
        texto={borrar ? `¿Eliminar ${borrar.codigo} (${borrar.descripcion})? Si fue un error de trámite, es mejor marcarlo como anulado para conservarlo en los informes.` : ''} />
    </>
  );
}
