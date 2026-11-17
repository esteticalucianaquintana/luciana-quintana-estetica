CREATE TABLE experiencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firma TEXT NOT NULL,
  servicio TEXT NOT NULL,
  opinion TEXT NOT NULL,
  consentimiento INTEGER NOT NULL CHECK (consentimiento = 1),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','publicada','descartada'))
);
CREATE INDEX experiencias_estado_id ON experiencias(estado,id);
