import { Link, useNavigate } from 'react-router-dom';
import { useDatos } from '../api/useDatos';
import { Cargando, Encabezado, EstadoReintegro, KPI, MensajeError, Tabla } from '../componentes/ui';
import { ReintegrosPorMes } from '../componentes/Graficos';
import { compacto, cop, fecha, fechaHora, num } from '../formato';

export default function Panel() {
  const { datos: d, cargando, error, recargar } = useDatos('/panel');
  const nav = useNavigate();
  if (cargando && !d) return <Cargando />;
  if (error && !d) return <MensajeError error={error} alReintentar={recargar} />;
  const i = d.instituciones, r = d.reintegros;
  const vari = r.realizados_mes_anterior ? Math.round((r.realizados_mes - r.realizados_mes_anterior) / r.realizados_mes_anterior * 100) : null;
  return (
    <>
      <Encabezado antetitulo={`Corte: ${fecha(d.fecha_corte)}`} titulo="Panel principal">
        <Link to="/reintegros" className="btn pri">Registrar reintegro</Link>
      </Encabezado>
      <section className="kpis" aria-label="Indicadores">
        <KPI titulo="Instituciones activas" valor={num(i.activas)} detalle={`de ${num(i.total)} registradas`} />
        <KPI titulo="Ubicadas en el mapa" valor={num(i.con_coordenadas)} detalle={`${num(i.total - i.con_coordenadas)} sin coordenadas`} />
        <KPI titulo="Con fotografías" valor={num(i.con_imagenes)} detalle={`${num(i.total - i.con_imagenes)} sin imágenes`} />
        <KPI titulo="Estudiantes" valor={compacto(i.estudiantes)} detalle="matrícula de 0° a 11°" />
        <KPI titulo="Reintegros realizados" valor={num(r.realizados)} detalle={`${num(r.total)} registrados en total`} tono="ok" />
        <KPI titulo="Pendientes" valor={num(r.pendientes)} detalle={`${num(r.rechazados)} rechazados · ${num(r.anulados)} anulados`} tono="warn" />
        <KPI titulo="Valor realizado" valor={cop(r.valor_realizado)} detalle="solo reintegros realizados" />
        <KPI titulo="Realizados este mes" valor={num(r.realizados_mes)} detalle={vari == null ? `mes anterior: ${num(r.realizados_mes_anterior)}` : `${vari >= 0 ? '+' : ''}${vari} % frente al mes anterior (${num(r.realizados_mes_anterior)})`} />
      </section>
      <div className="rejilla-2">
        <section className="tarjeta">
          <div className="tarjeta-h"><h2>Reintegros por mes</h2><Link to="/informes">Ver informes</Link></div>
          <p className="m">Últimos 12 meses, por estado del trámite.</p>
          {d.por_mes.length ? <ReintegrosPorMes datos={d.por_mes} /> : <p className="vacio">Aún no hay reintegros registrados.</p>}
        </section>
        <section className="tarjeta">
          <div className="tarjeta-h"><h2>Últimos movimientos</h2><Link to="/reintegros">Ver todos</Link></div>
          <Tabla filas={d.recientes} alClic={() => nav('/reintegros')} vacio="Aún no hay reintegros registrados." columnas={[
            { k: 'codigo', t: 'Código', clase: 'mono' },
            { k: 'inst', t: 'Institución', render: f => f.institucion_nombre || f.institucion_texto || '—' },
            { k: 'desc', t: 'Elemento', render: f => `${f.descripcion} ×${f.cantidad}` },
            { k: 'estado', t: 'Estado', render: f => <EstadoReintegro estado={f.estado} /> }
          ]} />
          <p className="m pie">Bitácora certificada: {num(d.bitacora.n)} eventos · último {fechaHora(d.bitacora.ultimo)} · <Link to="/trazabilidad">verificar</Link></p>
        </section>
      </div>
    </>
  );
}
