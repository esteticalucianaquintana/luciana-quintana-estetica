# Luciana Quintana Estética

Web y agenda independiente alojada en la cuenta de Cloudflare de Estética. Código público, sin contraseñas ni datos de pacientes.

## Administración

- `/acceso.html`: acceso con la clave privada generada en la publicación inicial.
- `/gestion.html`: panel de administración.
- `/agenda-lucy.html`: turnos, cambios sujetos a confirmación, cancelaciones, horario semanal y excepciones por fecha. Horario inicial: lunes a viernes 13:30–17:30. Agregar franjas permite sumar una mañana sin alterar otros días.
- `/campanas.html`: biblioteca compartida privada, MP4 e imágenes, texto y estados lista/publicada/archivada. Marcar publicada es un registro manual; no publica en Instagram.

El acceso actual usa una clave compartida por los administradores. Todavía no hay usuarios individuales ni auditoría por persona.

## Desarrollo y despliegue

`npm ci`, `npm test`, `npm run build`.

Antes de conectar Builds al Worker existente, conservar en la configuración el account_id y la base D1 que ya usa el sitio publicado. No crear otra base ni reemplazar ADMIN_KEY. El wrangler.json incluido es una plantilla sin la identificación de la base existente.

Aplicar migraciones con `npx wrangler d1 migrations apply DB --remote` con el binding DB configurado. La migración 0001 agrega campañas sin modificar los turnos.

Para archivos de campañas, enlazar un bucket R2 privado como CAMPAIGN_MEDIA. No se ha creado ni activado: respetar la condición de no activar servicios pagos. Si la cuenta exige facturación, detener esta configuración. Sin ese binding la carga se deshabilita y se explica en pantalla.

Publicación directa en Instagram, WhatsApp Flows y envíos automáticos están pendientes de conectar Meta. Los avisos de agenda son simulados. No hay cron de recordatorios activo.

No subir `.private/`, ACCESO-PRIVADO.txt, credenciales ni datos de pacientes a GitHub.

## Biblioteca de campañas preparada para conexión

Se pueden guardar, buscar, copiar y editar títulos/textos sin R2. Un registro `ready` sin `media_key` se muestra como borrador; puede archivarse o recuperarse. Se conservan los estados actuales de la tabla. No se agregan migraciones ni bases: para borradores se guardan `media_key=''`, `mime=''`, `size=0` en la tabla existente.

Con CAMPAIGN_MEDIA autorizado se habilita la carga opcional y se puede adjuntar un archivo a un borrador existente. Se rechaza reemplazar un archivo para preservar el original. Límite actual: 50 MB; MP4, JPG, PNG, WebP. Guardar un borrador sin archivo NO almacena el video en el navegador ni en el servidor.

Instagram sigue desconectado. Marcar publicada registra una publicación manual; no crea anuncios ni envía contenido a Meta. No se activa R2, facturación ni integraciones. No aplicar migraciones remotas ni desplegar esta propuesta sin aprobación del propietario.
