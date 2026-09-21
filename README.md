# Rematech Postventa 1.5.1 — operación compartida

La distribución 1.5 usa Supabase Auth, tablas con RLS sin acceso directo del cliente y una Edge Function que valida la identidad, el rol y la revisión del expediente en cada operación. El instalador solo contiene una clave pública.

- Compilación: GitHub Actions `Instaladores Rematech`, Windows x64 NSIS con WebView2 offline y Mac universal.
- Variables de compilación: `VITE_CLOUD_MODE=true`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca usar claves secretas ni service_role en el cliente.
- Migración: `supabase/migrations/202609190001_shared_workspace.sql` y función `supabase/functions/rematech`. El cliente no puede crear por su cuenta el administrador inicial.
- Primer acceso: contraseña temporal obligatoria; administración de usuarios y restablecimiento disponibles en Configuración.
- Expedientes anteriores: transferencia explícita desde Configuración, sin borrar la copia local ni reemplazar registros existentes.
- Ingresos: **Registrar y enviar a Reparación** guarda el expediente, entrega la requisición en la bandeja interna y crea su notificación. No envía correo a Reparación. **Enviar ticket** es una acción separada para el cliente.
- Correo real: Gmail API con autorización de `g.garcia@rematech.mx` y permiso `gmail.send`. El asunto es siempre `Ticket de seguimiento - FOLIO`. Requiere `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` y `GMAIL_ACCOUNT` como secretos de Supabase, nunca en los instaladores. Sin autorización no se simula el envío.
- Preparación del correo: crear un cliente OAuth web interno de la organización con redirección `http://127.0.0.1:8765/oauth2callback`; ejecutar `node scripts/connect-gmail.mjs /ruta/cliente.json` y autorizar la cuenta en Google. El script confirma la identidad y genera `/tmp/rematech-gmail.env` privado para cargarlo con `supabase secrets set --env-file /tmp/rematech-gmail.env --project-ref REF`. Eliminar después el archivo temporal. No guardar el JSON del cliente ni los tokens en el repositorio.
- Pruebas: `npm test` verifica el modo local en Chromium y WebKit. Los scripts `cloud-smoke.mjs` y `cloud-ui-smoke.mjs` crean y eliminan únicamente sus cuentas y registros QA; requieren credenciales de servicio privadas fuera del repositorio. No son parte del instalador.
- Firma comercial y notarización: no configuradas. Los instaladores internos pueden mostrar avisos del sistema operativo.

El resto del documento conserva el historial y las instrucciones de la edición local anterior; sus referencias a demo o almacenamiento local no describen la distribución compartida 1.5.

---

# REMATECH POSTVENTA

Aplicación **nativa de escritorio** con Tauri 2, HTML5, CSS3 y JavaScript modular. Un mismo código fuente para Windows 11 y macOS Apple Silicon / Intel. No utiliza React, Vue, Angular ni CDN. Vite es exclusivamente el compilador y servidor de desarrollo; la aplicación distribuida corre en una ventana Tauri con sus recursos locales.

## Versión 1.4.0: reparación, calidad y notificaciones

El acceso está centrado y el menú utiliza iconos SVG. En Configuración, el administrador crea usuarios con contraseña temporal y modifica roles de otras cuentas; el cambio de rol se aplica al siguiente inicio de sesión. Las cuentas nuevas no obtienen sesión de trabajo hasta reemplazar la contraseña temporal por una distinta. Las cuentas anteriores conservan su acceso.

Registrar un ingreso conserva la captura y las evidencias para revisar e imprimir. **Nuevo ingreso** pide confirmación antes de limpiar el borrador, sin borrar expedientes registrados.

La interfaz usa fondo crema, azul marino y verde Rematech. Ingresos ocupa el ancho disponible con tarjetas de captura y una sección inferior para visualizar el ticket del cliente y la requisición de Reparación. El menú lateral se expande al acercar el cursor o usar el teclado y se contrae al salir o elegir un área; también dispone de botón y tecla Escape.

Esta entrega trabaja **en una sola computadora**. Las cuentas, los expedientes y las bandejas no se sincronizan entre equipos. El login es local; para operar simultáneamente en varias computadoras se requiere conectar un servicio de autenticación y base de datos compartida, como Supabase. No hay credenciales predeterminadas.

1. Al abrir por primera vez, crear el administrador con nombre, correo y contraseña de al menos 10 caracteres.
2. En **Configuración**, dar de alta cuentas para **Ingresos**, **Reparación** y **Calidad**. El administrador puede operar todas las etapas.
3. **Dashboard** queda reservado, sin indicadores nuevos.
4. En **Ingresos**, seleccionar **Tipo de ingreso** (Servicio, Cambio o Devolución; Servicio por defecto) y capturar el equipo y pulsar **Registrar ingreso**. Esto guarda el expediente y sus evidencias de forma independiente del borrador y lo coloca en **Consulta y recepciones**, pendiente de recibir. El correo y el registro interno son acciones distintas: no hace falta enviar un correo para que aparezca en la bandeja local.
5. En **Consulta y recepciones**, buscar por folio, pedido o S/N (admite coincidencias parciales y no distingue mayúsculas). Abrir el expediente y **Confirmar recepción del equipo**.
6. Reparación captura diagnóstico, marca los componentes donde encontró la falla, detalla acciones, resultado y fecha. El técnico se toma de la cuenta que guarda el trabajo; no se captura firma de conformidad. **Guardar información** conserva avances.
7. Solo **Reparado** o **Sin falla detectada** habilitan **Enviar a Calidad**. El envío cierra la edición de Reparación y genera un aviso para Calidad. Los demás resultados habilitan **Notificar al administrador**, con un comentario obligatorio; el expediente queda en seguimiento con Administración.
8. Calidad elige **Inspección de calidad aprobada** para finalizar o **Inspección de calidad no aprobada** para devolver. La devolución exige observaciones, reabre Reparación y notifica a Reparación y Administración. Cada inspección conserva el diagnóstico que se revisó.
9. Los comentarios quedan en el expediente y generan avisos para Reparación; las respuestas de Reparación también notifican a Administración. El botón **Notificaciones** muestra avisos por área, con lectura individual por cuenta, y permite abrir el folio. Se actualizan al operar y cada 10 segundos mientras la aplicación está abierta.

Las notificaciones son internas y locales a esta computadora: no son correos ni avisos entre computadoras. La actualización conserva las cuentas y expedientes existentes. Los resultados antiguos se muestran con los nombres nuevos. Si un expediente antiguo llegó a Calidad con un resultado que ahora corresponde a Administración, Calidad puede devolverlo con observaciones para corregir su seguimiento.

El tipo de ingreso se conserva en el borrador, expediente, ticket y requisición. Los expedientes anteriores sin ese dato muestran «No especificado». Este campo identifica el motivo del ingreso y no cambia el flujo de Reparación y Calidad.

Cada cambio conserva responsable, área y fecha en el historial. El PDF descargado desde el expediente incluye la información técnica y, después del cierre, la revisión de Calidad. Limpiar el formulario de Ingresos **no elimina expedientes registrados**. No se permite registrar dos veces el mismo folio. Las escrituras comprueban la revisión del expediente para evitar sobrescribir cambios concurrentes.

Los campos técnicos se guardan con **Guardar información**, **Enviar a Calidad** o **Notificar al administrador**; las observaciones de Calidad se guardan al devolver el expediente. Cerrar esos formularios sin guardar descarta sus cambios. El autoguardado del formulario de Ingresos sigue funcionando.

### Acceso local

Las contraseñas se guardan como derivaciones PBKDF2-SHA256 con sal individual y 310 000 iteraciones, nunca en texto plano. La sesión permanece en memoria y se vuelve a pedir acceso al reiniciar. La recuperación local mediante código de un solo uso se describe abajo; no se envía correo de recuperación. Las áreas limitan las acciones dentro de la aplicación, pero este almacenamiento local no es una barrera de seguridad frente a quien controla el disco o las herramientas de desarrollo del equipo. Para autenticación y autorización centralizadas se requiere validación en servidor.

Módulos nuevos: `auth.js` (cuentas y sesión), `workflow.js` (estados y validaciones), `case-storage.js` (transacciones, folio único y versiones), `workspace.js` (login, navegación y expedientes) y `styles/workflow.css`.

## Versión 1.1.1: recuperar el acceso

Si aparece **Iniciar sesión**, el administrador ya se creó en esta computadora. La aplicación ahora lo indica expresamente. Para crear usuarios de otras áreas, iniciar sesión como administrador y abrir **Configuración** en la barra lateral.

Si se olvidó la contraseña, el administrador de la computadora puede preparar una autorización local:

```sh
npm run recovery:prepare -- correo@rematech.mx
```

El comando genera un código aleatorio de un solo uso, ligado al correo indicado y válido durante 24 horas. Sustituye cualquier código anterior pendiente. Debe ejecutarse con el mismo usuario del sistema operativo que abre la aplicación. El usuario pulsa **Olvidé mi contraseña**, ingresa su correo y código y escribe personalmente la nueva contraseña dos veces (mínimo 10 caracteres). Después inicia sesión con ella. La operación modifica únicamente la derivación de contraseña de esa cuenta y conserva su identidad, rol, usuarios y expedientes.

La autorización se valida en Rust, no mediante un interruptor del frontend. Solo se guarda el SHA-256 del código en `account-recovery.json`, dentro de la carpeta de datos de la aplicación, y el archivo se consume al autorizar el cambio. En macOS/Linux se crea con permisos 0600. No se obtiene ni muestra la contraseña anterior. Si falla la escritura de la nueva contraseña después de consumir el código, se requiere generar otro; la transacción conserva la contraseña anterior.

Esta herramienta es para el administrador local del equipo, no un sistema remoto de recuperación. No se puede restablecer una cuenta solo por conocer su correo. Las limitaciones de seguridad del almacenamiento local siguen aplicando.

## Requisitos e instalación

1. Instalar **Node.js LTS 22.12+ o 24 LTS** desde https://nodejs.org. El instalador incluye npm. Verificar `node --version` y `npm --version`.
2. Instalar Rust estable mediante https://rustup.rs. Reiniciar la terminal y comprobar `rustc --version` y `cargo --version`.
3. **Windows 11:** instalar Microsoft C++ Build Tools con la carga «Desarrollo para el escritorio con C++» y Windows SDK; disponer de Microsoft Edge WebView2. Usar el toolchain Rust MSVC. **macOS:** instalar las herramientas con `xcode-select --install`; para distribución firmada se recomienda Xcode completo y una cuenta Apple Developer.
4. Abrir **esta carpeta**, `rematech-postventa`, en Visual Studio Code. Se incluyen recomendaciones de extensiones Tauri y rust-analyzer.
5. Ejecutar:

```sh
npm install
npm run tauri dev
```

Esto abre la **ventana de escritorio**, titulada Rematech Postventa, de 1500 × 900 (mínimo 1200 × 700), redimensionable y maximizable.

`npm run dev` abre solo el servidor del frontend, útil para inspección y pruebas. `npm run build` compila el frontend en `dist/`. Ninguno sustituye la aplicación nativa. No hace falta instalar Node ni Rust en los equipos que solo ejecutan el instalador.

Referencias oficiales: [prerrequisitos Tauri](https://v2.tauri.app/start/prerequisites/), [instaladores Windows](https://v2.tauri.app/distribute/windows-installer/), [distribución macOS](https://v2.tauri.app/distribute/macos-application-bundle/).

## Estructura

```text
rematech-postventa/
├── src/
│   ├── index.html                  # Layout, formulario, modales
│   ├── styles/styles.css           # Interfaz, documentos e impresión
│   ├── assets/icons/app.svg        # Icono fuente
│   └── js/
│       ├── app.js                  # Eventos y coordinación de estado
│       ├── catalog.js              # 17 componentes y subfallas
│       ├── config.js               # Demo, destino y URL del backend
│       ├── documents.js            # Vistas previas y datos compartidos
│       ├── warranty.js             # Declaración exacta de garantía
│       ├── pdf.js                  # PDF vectorial, paginación y guardado
│       ├── printing.js             # Impresión encapsulada
│       ├── evidence.js             # Lectura y compresión
│       ├── email.js                # FormData y transporte HTTP
│       ├── storage.js              # Repositorio local reemplazable
│       └── utils.js                # Folio, fechas y validaciones
├── src-tauri/
│   ├── src/lib.rs                  # Inicialización y comando de impresión
│   ├── src/main.rs
│   ├── capabilities/default.json  # Guardado con selector nativo
│   ├── icons/
│   ├── Cargo.toml / Cargo.lock
│   ├── build.rs
│   └── tauri.conf.json
├── tests/app.spec.js
├── .vscode/
├── package.json / package-lock.json
├── playwright.config.js
└── vite.config.js
```

## Operación

- Campos, componentes, fallas, solicitudes técnicas y tamaño de ticket se autoguardan con cada cambio. Las evidencias comprimidas se almacenan como Blob en IndexedDB, **no** en localStorage. Reiniciar la aplicación mantiene el borrador. La base de producción y la del servidor de desarrollo corresponden a orígenes distintos y no comparten capturas.
- Existe **un borrador local de Ingresos**, además de los expedientes registrados y su historial. Limpiar requiere confirmar y elimina únicamente el borrador y sus evidencias temporales; los expedientes registrados se conservan.
- La clasificación es siempre manual. El texto del cliente jamás selecciona fallas. Cada componente admite varias casillas y no puede repetirse en otro bloque.
- Hasta dos imágenes, dimensión mayor de 1600 px y JPEG calidad 0.85. Se admite la selección `image/*`; un formato que no pueda decodificar el sistema muestra un error. Límite de entrada de 30 MB por imagen para evitar saturación de memoria.
- Los PDF son texto vectorial seleccionable, no capturas borrosas. El ticket mide 58 u 80 mm con altura calculada. No contiene fotos ni clasificación interna. La requisición es Carta vertical; las imágenes se incluyen en un anexo, normalmente segunda página. **Si hay muchos componentes o textos largos, la requisición continúa en las páginas necesarias y el anexo queda después**, sin recortar información.
- La vista previa HTML y el PDF contienen la misma información con maquetaciones adaptadas a cada salida; los saltos de página se calculan al exportar.
- La impresión usa el diálogo nativo del WebView. Seleccionar el papel Carta o el rollo de 58/80 mm en el controlador, escala 100 %, sin encabezados/pies adicionales. La longitud del rollo depende de la impresora y su controlador. El PDF siempre lleva las dimensiones físicas exactas y también puede imprimirse desde un visor.
- El folio se genera centralmente en `utils.js`: `RT-YYMMDD-HHMM-XXXX`. El sufijo reduce colisiones de capturas dentro del mismo minuto; no sustituye un identificador transaccional central. Se puede editar y luego reemplazar por el generador de base de datos.

## Compilar Windows 11

Desde **Windows**, en esta misma carpeta:

```powershell
npm install
npm run tauri build -- --bundles nsis,msi
```

Salidas habituales:

- Ejecutable: `src-tauri/target/release/rematech-postventa.exe`
- Instalador EXE: `src-tauri/target/release/bundle/nsis/`
- Instalador MSI: `src-tauri/target/release/bundle/msi/`

El empaquetado MSI puede requerir la característica opcional VBSCRIPT de Windows. Las herramientas de empaquetado pueden descargarse durante la primera compilación. Para distribución comercial conviene configurar firma de código del instalador.

## Compilar macOS

Desde **macOS**:

```sh
npm install
npm run tauri build -- --bundles app,dmg
```

Salidas:

- `.app`: `src-tauri/target/release/bundle/macos/Rematech Postventa.app`
- `.dmg`: `src-tauri/target/release/bundle/dmg/`

Por defecto se compila para la arquitectura del equipo. Para una aplicación universal Apple Silicon + Intel:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin --bundles app,dmg
```

Los paquetes universales quedan en `src-tauri/target/universal-apple-darwin/release/bundle/`. Se debe probar en ambas arquitecturas. Para distribuir fuera de este equipo sin advertencias de Gatekeeper, configurar certificado Developer ID y notarización mediante las variables de entorno de Tauri; no guardar credenciales en el repositorio.

También se puede ejecutar `npm run tauri build`, que genera los paquetes disponibles en el sistema actual. **Windows se compila normalmente en Windows y macOS en macOS.** El repositorio es único. Más adelante puede agregarse una matriz de GitHub Actions para automatizar Windows, macOS ARM e Intel.

## Activar correo real

La configuración inicial de `src/js/config.js` es:

```js
export const DEMO_MODE = true;
export const REPAIR_EMAIL = "reparacion@rematech.mx";
export const API_BASE_URL = "https://api.rematech.mx";
```

Con `true` se genera el PDF y se simula la respuesta; **no se envía ningún correo**. El modal lo indica explícitamente. La URL es una configuración de ejemplo, no un backend aprovisionado por este proyecto.

Para activar:

1. Implementar/desplegar un backend HTTPS con las dos rutas indicadas abajo, servicio SMTP o proveedor de correo y credenciales **solo del servidor**.
2. Configurar `API_BASE_URL` y, si cambia, `REPAIR_EMAIL`. Modificar `DEMO_MODE` a `false`.
3. Si cambia el dominio, actualizar `app.security.csp` → `connect-src` en `src-tauri/tauri.conf.json`. No abrir todos los dominios.
4. Permitir CORS en el servidor para los orígenes reales de Tauri (`tauri://localhost` en macOS y `http://tauri.localhost` en Windows por defecto) y `http://127.0.0.1:1420` en desarrollo. Verificar el encabezado Origin de la aplicación instalada.
5. El servidor debe validar PDF, campos y destinatario, limitar tamaño y frecuencia, y aplicar autenticación/autorización cuando se integre usuarios. La dirección del área técnica debe validarse también en servidor. La app no incorpora una clave privada. El login local no autentica solicitudes ante ese servidor: el backend deberá implementar su propia autenticación de sesión.

### Contrato multipart/form-data

`POST /api/enviar-ticket`

- `correo`, `folio`, `cliente`, `pedido`, `equipo`
- `archivo`: Blob PDF, nombre `Ticket-[folio].pdf`

`POST /api/enviar-requisicion`

- `correo`, `folio`, `cliente`, `pedido`, `serie`, `equipo`
- `archivo`: Blob PDF con anexo de evidencias, nombre `Requisicion-[folio].pdf`

Una respuesta HTTP 2xx indica que el servidor aceptó el envío; otros códigos muestran error. El servidor debe responder 2xx solo al aceptar el mensaje en su proveedor. Tiempo de espera de 60 segundos, sin reintentos automáticos que puedan duplicar correos. No se establece manualmente Content-Type: el navegador añade el boundary de FormData.

## Datos y seguridad

`storage.js` es el contrato reemplazable: `loadDraft`, `saveDraft`, `loadEvidence`, `saveEvidence`, `clear`. Al incorporar Supabase/PostgreSQL conviene convertir la lectura/escritura del borrador a un repositorio asíncrono, agregar estados de sincronización y después usuarios, roles, expedientes, evidencias, historial y realtime. La versión 1.1 incorpora usuarios y roles locales, expedientes e historial en `case-storage.js`. La integración central y realtime no están activados; al conectarlos, las transiciones de `workflow.js` deben validarse también en servidor y las evidencias deben almacenarse en un bucket privado.

El borrador es local al perfil del sistema y no está cifrado por la aplicación. No constituye un respaldo. La app escapa texto antes de insertarlo en HTML. Capacidades limitadas al selector Guardar y escritura del archivo elegido; sin shell, ejecución de comandos externos ni lectura general del disco. El comando Rust únicamente abre impresión de su propia ventana.

## Pruebas

```sh
npx playwright install chromium
npm test
npm run build
npm run tauri info
npm run tauri build
```

Las pruebas cubren selección manual múltiple, duplicados, componentes adicionales/eliminación, otra falla, persistencia, dos evidencias, compresión, limpieza, dimensiones de PDF, anexo condicional, contenido extenso, exclusión de información interna en ticket, modales, validaciones, demo, IDs y errores JavaScript. La impresión física requiere una impresora y verificar el controlador del equipo destino.

Ver `VERIFICACION.md` para los resultados de esta entrega.

### Empaquetado DMG en entornos automatizados

Si falla la personalización de Finder durante la creación del DMG, ejecutar desde macOS:

```sh
CI=true npm run tauri build -- --bundles app,dmg
```

Esto omite la decoración de la ventana de instalación. No modifica las funciones de la aplicación.
