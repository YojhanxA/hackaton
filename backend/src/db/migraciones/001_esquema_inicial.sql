-- =========================================================
-- Traza Educativa · Esquema inicial
-- Instituciones, imágenes, reintegros, usuarios, configuración
-- y bitácora encadenada (solo inserción) para la trazabilidad.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------- Usuarios y roles ----------
CREATE TABLE usuarios (
  id            serial PRIMARY KEY,
  usuario       varchar(60)  NOT NULL UNIQUE CHECK (usuario ~ '^[a-z0-9._-]{3,60}$'),
  nombre        varchar(120) NOT NULL,
  hash_clave    varchar(100) NOT NULL,
  rol           varchar(10)  NOT NULL CHECK (rol IN ('admin', 'editor', 'lector')),
  activo        boolean      NOT NULL DEFAULT true,
  creado_en     timestamptz  NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- ---------- Instituciones (sedes educativas) ----------
CREATE TABLE instituciones (
  id              serial PRIMARY KEY,
  codigo          varchar(40)  NOT NULL UNIQUE CHECK (length(trim(codigo)) > 0),
  nombre          varchar(200) NOT NULL CHECK (length(trim(nombre)) > 1),
  institucion     varchar(200),                 -- institución educativa a la que pertenece la sede
  sector          varchar(12)  CHECK (sector IN ('oficial', 'no_oficial')),
  clase           varchar(60),
  direccion       varchar(200),
  barrio          varchar(120),
  comuna          varchar(120),
  municipio       varchar(100) NOT NULL,
  departamento    varchar(100) NOT NULL,
  latitud         numeric(9,6) CHECK (latitud BETWEEN -90 AND 90),
  longitud        numeric(9,6) CHECK (longitud BETWEEN -180 AND 180),
  contacto_nombre varchar(120),
  telefono        varchar(40),
  correo          varchar(120),
  descripcion     text,
  estudiantes     integer CHECK (estudiantes >= 0),
  estado          varchar(10) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coordenadas_completas CHECK ((latitud IS NULL) = (longitud IS NULL))
);
CREATE INDEX instituciones_nombre_trgm ON instituciones USING gin (nombre gin_trgm_ops);
CREATE INDEX instituciones_institucion_trgm ON instituciones USING gin (institucion gin_trgm_ops);
CREATE INDEX instituciones_municipio_idx ON instituciones (municipio);
CREATE INDEX instituciones_comuna_idx ON instituciones (comuna);
CREATE INDEX instituciones_estado_idx ON instituciones (estado);

-- ---------- Imágenes (metadatos; el archivo vive en el almacenamiento del backend) ----------
CREATE TABLE institucion_imagenes (
  id             serial PRIMARY KEY,
  institucion_id integer NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
  archivo        varchar(80)  NOT NULL UNIQUE,     -- nombre aleatorio en el almacenamiento
  nombre_original varchar(255) NOT NULL,
  tipo_mime      varchar(30)  NOT NULL CHECK (tipo_mime IN ('image/jpeg', 'image/png', 'image/webp')),
  tamano_bytes   integer      NOT NULL CHECK (tamano_bytes > 0),
  sha256         char(64)     NOT NULL,
  es_principal   boolean      NOT NULL DEFAULT false,
  orden          integer      NOT NULL DEFAULT 0,
  creado_por     integer REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en      timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX imagenes_institucion_idx ON institucion_imagenes (institucion_id, orden);
CREATE UNIQUE INDEX imagenes_una_principal ON institucion_imagenes (institucion_id) WHERE es_principal;
CREATE UNIQUE INDEX imagenes_sin_duplicar ON institucion_imagenes (institucion_id, sha256);

-- ---------- Reintegros ----------
-- Conserva los campos de la aplicación de reintegros existente (placa, cantidad, descripción,
-- institución tal como llega en el archivo, huella para evitar duplicados) y agrega los del trámite.
CREATE SEQUENCE reintegros_codigo_seq;
CREATE TABLE reintegros (
  id                 serial PRIMARY KEY,
  codigo             varchar(20) NOT NULL UNIQUE DEFAULT ('RI-' || lpad(nextval('reintegros_codigo_seq')::text, 6, '0')),
  institucion_id     integer REFERENCES instituciones(id) ON DELETE SET NULL,
  institucion_texto  varchar(255),
  fecha_reintegro    date         NOT NULL,
  placa              varchar(100),
  cantidad           integer      NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  descripcion        text         NOT NULL CHECK (length(trim(descripcion)) > 2),
  referencia_soporte varchar(120),
  valor              numeric(14,2) CHECK (valor >= 0),
  estado             varchar(10)  NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'realizado', 'rechazado', 'anulado')),
  observaciones      text,
  hash_registro      char(64)     NOT NULL UNIQUE,
  creado_por         integer REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_por    integer REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en          timestamptz  NOT NULL DEFAULT now(),
  actualizado_en     timestamptz  NOT NULL DEFAULT now()
);
ALTER SEQUENCE reintegros_codigo_seq OWNED BY reintegros.codigo;
CREATE INDEX reintegros_fecha_idx ON reintegros (fecha_reintegro);
CREATE INDEX reintegros_estado_fecha_idx ON reintegros (estado, fecha_reintegro);
CREATE INDEX reintegros_institucion_idx ON reintegros (institucion_id);
CREATE INDEX reintegros_placa_idx ON reintegros (placa);
CREATE INDEX reintegros_descripcion_trgm ON reintegros USING gin (descripcion gin_trgm_ops);

-- ---------- Configuración ----------
CREATE TABLE configuracion (
  clave          varchar(60) PRIMARY KEY,
  valor          jsonb       NOT NULL,
  actualizado_por integer REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- ---------- Bitácora encadenada (trazabilidad) ----------
-- Cada cambio queda como un evento con la huella SHA-256 de su contenido y la del evento anterior.
-- La tabla es de solo inserción: un disparador impide UPDATE y DELETE.
CREATE TABLE bitacora (
  n          bigint      PRIMARY KEY CHECK (n >= 0),
  ts         timestamptz NOT NULL,
  usuario    varchar(60) NOT NULL,
  accion     varchar(40) NOT NULL,
  entidad    varchar(30) NOT NULL,
  entidad_id varchar(40),
  datos      jsonb       NOT NULL,
  prev       char(64)    NOT NULL,
  hash       char(64)    NOT NULL UNIQUE
);
CREATE INDEX bitacora_entidad_idx ON bitacora (entidad, entidad_id);

CREATE FUNCTION bitacora_solo_insercion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora es de solo inserción: no se puede % un evento', lower(TG_OP);
END $$;
CREATE TRIGGER bitacora_inmutable BEFORE UPDATE OR DELETE ON bitacora
  FOR EACH ROW EXECUTE FUNCTION bitacora_solo_insercion();
CREATE TRIGGER bitacora_sin_truncate BEFORE TRUNCATE ON bitacora
  FOR EACH STATEMENT EXECUTE FUNCTION bitacora_solo_insercion();

-- ---------- Anclajes en blockchain ----------
-- Recibos de las huellas de la bitácora publicadas en el contrato TrazaAnclaje.
CREATE TABLE anclajes (
  id         serial PRIMARY KEY,
  n_eventos  bigint      NOT NULL CHECK (n_eventos > 0),
  raiz       char(64)    NOT NULL,
  red        varchar(60) NOT NULL,
  chain_id   bigint      NOT NULL,
  contrato   char(42)    NOT NULL,
  tx_hash    char(66)    NOT NULL UNIQUE,
  cuenta     char(42)    NOT NULL,
  usuario_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, contrato, raiz)
);
