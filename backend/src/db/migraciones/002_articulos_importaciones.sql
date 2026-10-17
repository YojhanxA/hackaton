-- =========================================================
-- 002 · Artículos, categorías, importaciones de Excel y
-- almacenamiento opcional de imágenes en PostgreSQL.
-- =========================================================

-- Archivos de reintegros importados (equivale a ArchivoImportado de la app de reintegros)
CREATE TABLE importaciones (
  id           serial PRIMARY KEY,
  archivo      varchar(255) NOT NULL,
  sha256       char(64)     NOT NULL,
  estado_asignado varchar(10) NOT NULL CHECK (estado_asignado IN ('pendiente', 'realizado', 'rechazado', 'anulado')),
  filas        integer NOT NULL DEFAULT 0,
  validos      integer NOT NULL DEFAULT 0,
  duplicados   integer NOT NULL DEFAULT 0,
  omitidas     integer NOT NULL DEFAULT 0,
  raiz_filas   char(64),
  usuario_id   integer REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX importaciones_sha_idx ON importaciones (sha256);

-- Familia del artículo (SILLA, COMPUTADOR PORTATIL…) y categoría, como en la app de reintegros
ALTER TABLE reintegros
  ADD COLUMN articulo varchar(120),
  ADD COLUMN categoria varchar(12) CHECK (categoria IN ('mobiliario', 'electrico')),
  ADD COLUMN importacion_id integer REFERENCES importaciones(id) ON DELETE SET NULL;
CREATE INDEX reintegros_articulo_idx ON reintegros (articulo);
CREATE INDEX reintegros_categoria_idx ON reintegros (categoria);
CREATE INDEX reintegros_importacion_idx ON reintegros (importacion_id);

-- Contenido de imágenes cuando ALMACENAMIENTO=postgres (servicios con disco efímero).
-- Va en una tabla aparte, en binario (bytea); los registros de instituciones nunca guardan Base64.
CREATE TABLE imagen_contenidos (
  archivo    varchar(80) PRIMARY KEY,
  datos      bytea       NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
