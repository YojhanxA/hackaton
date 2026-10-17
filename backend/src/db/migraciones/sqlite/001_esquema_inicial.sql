CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL UNIQUE CHECK (length(usuario) BETWEEN 3 AND 60),
  nombre TEXT NOT NULL,
  hash_clave TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'editor', 'lector')),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE instituciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE CHECK (length(trim(codigo)) > 0),
  nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 1),
  institucion TEXT,
  sector TEXT CHECK (sector IN ('oficial', 'no_oficial')),
  clase TEXT,
  direccion TEXT,
  barrio TEXT,
  comuna TEXT,
  municipio TEXT NOT NULL,
  departamento TEXT NOT NULL,
  latitud REAL CHECK (latitud BETWEEN -90 AND 90),
  longitud REAL CHECK (longitud BETWEEN -180 AND 180),
  contacto_nombre TEXT,
  telefono TEXT,
  correo TEXT,
  descripcion TEXT,
  estudiantes INTEGER CHECK (estudiantes >= 0),
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((latitud IS NULL) = (longitud IS NULL))
);
CREATE INDEX instituciones_nombre_idx ON instituciones (nombre);
CREATE INDEX instituciones_institucion_idx ON instituciones (institucion);
CREATE INDEX instituciones_municipio_idx ON instituciones (municipio);
CREATE INDEX instituciones_comuna_idx ON instituciones (comuna);
CREATE INDEX instituciones_estado_idx ON instituciones (estado);

CREATE TABLE institucion_imagenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institucion_id INTEGER NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
  archivo TEXT NOT NULL UNIQUE,
  nombre_original TEXT NOT NULL,
  tipo_mime TEXT NOT NULL CHECK (tipo_mime IN ('image/jpeg', 'image/png', 'image/webp')),
  tamano_bytes INTEGER NOT NULL CHECK (tamano_bytes > 0),
  sha256 TEXT NOT NULL,
  es_principal INTEGER NOT NULL DEFAULT 0 CHECK (es_principal IN (0, 1)),
  orden INTEGER NOT NULL DEFAULT 0,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX imagenes_institucion_idx ON institucion_imagenes (institucion_id, orden);
CREATE UNIQUE INDEX imagenes_una_principal ON institucion_imagenes (institucion_id) WHERE es_principal = 1;
CREATE UNIQUE INDEX imagenes_sin_duplicar ON institucion_imagenes (institucion_id, sha256);

CREATE TABLE reintegros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT GENERATED ALWAYS AS ('RI-' || printf('%06d', id)) STORED UNIQUE,
  institucion_id INTEGER REFERENCES instituciones(id) ON DELETE SET NULL,
  institucion_texto TEXT,
  fecha_reintegro TEXT NOT NULL,
  placa TEXT,
  cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  descripcion TEXT NOT NULL CHECK (length(trim(descripcion)) > 2),
  referencia_soporte TEXT,
  valor REAL CHECK (valor >= 0),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'realizado', 'rechazado', 'anulado')),
  observaciones TEXT,
  hash_registro TEXT NOT NULL UNIQUE,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX reintegros_fecha_idx ON reintegros (fecha_reintegro);
CREATE INDEX reintegros_estado_fecha_idx ON reintegros (estado, fecha_reintegro);
CREATE INDEX reintegros_institucion_idx ON reintegros (institucion_id);
CREATE INDEX reintegros_placa_idx ON reintegros (placa);
CREATE INDEX reintegros_descripcion_idx ON reintegros (descripcion);

CREATE TABLE configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  actualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bitacora (
  n INTEGER PRIMARY KEY CHECK (n >= 0),
  ts TEXT NOT NULL,
  usuario TEXT NOT NULL,
  accion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_id TEXT,
  datos TEXT NOT NULL,
  prev TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE
);
CREATE INDEX bitacora_entidad_idx ON bitacora (entidad, entidad_id);
CREATE TRIGGER bitacora_no_update BEFORE UPDATE ON bitacora
BEGIN
  SELECT RAISE(ABORT, 'La bitácora es de solo inserción: no se puede actualizar un evento');
END;
CREATE TRIGGER bitacora_no_delete BEFORE DELETE ON bitacora
BEGIN
  SELECT RAISE(ABORT, 'La bitácora es de solo inserción: no se puede eliminar un evento');
END;

CREATE TABLE anclajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  n_eventos INTEGER NOT NULL CHECK (n_eventos > 0),
  raiz TEXT NOT NULL,
  red TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  contrato TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  cuenta TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (chain_id, contrato, raiz)
);
