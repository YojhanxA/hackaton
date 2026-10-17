CREATE TABLE importaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archivo TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  estado_asignado TEXT NOT NULL CHECK (estado_asignado IN ('pendiente', 'realizado', 'rechazado', 'anulado')),
  filas INTEGER NOT NULL DEFAULT 0,
  validos INTEGER NOT NULL DEFAULT 0,
  duplicados INTEGER NOT NULL DEFAULT 0,
  omitidas INTEGER NOT NULL DEFAULT 0,
  raiz_filas TEXT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX importaciones_sha_idx ON importaciones (sha256);

ALTER TABLE reintegros ADD COLUMN articulo TEXT;
ALTER TABLE reintegros ADD COLUMN categoria TEXT CHECK (categoria IN ('mobiliario', 'electrico'));
ALTER TABLE reintegros ADD COLUMN importacion_id INTEGER REFERENCES importaciones(id) ON DELETE SET NULL;
CREATE INDEX reintegros_articulo_idx ON reintegros (articulo);
CREATE INDEX reintegros_categoria_idx ON reintegros (categoria);
CREATE INDEX reintegros_importacion_idx ON reintegros (importacion_id);

CREATE TABLE imagen_contenidos (
  archivo TEXT PRIMARY KEY,
  datos BLOB NOT NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
