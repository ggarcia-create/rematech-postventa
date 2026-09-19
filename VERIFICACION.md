# Verificación de la distribución compartida 1.5

- 32 pruebas locales aprobadas en Chromium y WebKit.
- Prueba contra Supabase desplegado con cuatro cuentas QA independientes: bloqueo de contraseña temporal, permisos por rol, alta compartida, notificación de ingreso, recepción, envío a Calidad, rechazo con devolución, aviso al administrador y finalización.
- Identidad técnica tomada de la cuenta; intentos de suplantar el nombre ignorados.
- Revisión obsoleta rechazada; acuse individual de notificación persistido.
- Restablecimiento administrativo exige volver a cambiar la contraseña; intento de otro rol rechazado.
- Transferencia local reservada al administrador, preserva el expediente y omite un identificador ya transferido.
- Evidencia PNG sintética guardada en bucket privado y recuperada mediante URL temporal; contenido verificado byte a byte.
- Acceso directo a tablas con la credencial de un usuario rechazado.
- Prueba de la compilación web de producción contra el servicio real en Chromium y WebKit: login, rechazo de la misma contraseña, cambio obligatorio, consulta de usuarios, logout y nuevo login inmediato.
- Las cuentas y expedientes de prueba se eliminaron al finalizar cada prueba. No se modificaron expedientes reales.
- Escaneo del repositorio: ninguna clave privada del proyecto incluida; archivos .env y carpeta entrega ignorados.

Instaladores finales: el job Windows del run 35448955404 pasó instalación silenciosa y arranque del ejecutable instalado. El job Mac compiló, pero su comprobación lipo tenía sintaxis incorrecta; se corrigió. El DMG final de Mac se recompiló localmente, se verificaron arm64 y x86_64 por separado, la firma ad hoc con codesign y la integridad del DMG con hdiutil. La aplicación nativa abrió su pantalla de inicio de sesión. El código de aplicación coincide en ambos paquetes; solo cambia el empaquetado de cada sistema. El correo desde rematech.mx sigue pendiente de configuración del proveedor y DNS; no se afirma haber enviado correos. No se cuenta con firma comercial/notarización.

---

## Historial de verificaciones locales anteriores

# Verificación de la entrega 1.4.0

- Login centrado, textos reducidos, iconos SVG coherentes, formularios y expediente con jerarquía visual más sobria.
- Configuración permite crear usuarios con contraseña temporal y asignar roles. No permite cambiar el propio rol administrativo.
- La autenticación conserva una identidad pendiente sin sesión activa hasta guardar la nueva contraseña. Se rechazan contraseñas iguales a la temporal, cortas o con confirmación diferente. Cancelar descarta la identidad pendiente; Escape no evita el cambio.
- 32 pruebas aprobadas en Chromium y WebKit. Incluyen cambio obligatorio y persistente, rechazo posterior de contraseña temporal, permisos, asignación de roles y conservación de ingreso después de registro y recarga.
- Revisión visual de login y Configuración en WebKit. Las cuentas existentes y los datos reales no se modificaron.
- El sistema continúa siendo local; la infraestructura compartida no forma parte de esta entrega.

---

# Verificación de la entrega 1.3.1

- Avisos unificados: registro exitoso desaparece a los 5 segundos, errores a los 10 segundos y cambio de área/cierre de sesión los oculta de inmediato. Un aviso nuevo cancela el temporizador anterior.
- Registrar un ingreso limpia búsqueda y filtro antiguos de Reparación. Cerrar sesión restablece filtros para que otra cuenta no herede una consulta que oculte ingresos.
- Las bandejas abiertas se actualizan cada 10 segundos; no se reemplaza un expediente abierto ni se pierden cambios del formulario.
- 24 pruebas anteriores aprobadas y 4 comprobaciones nuevas aprobadas (dos escenarios en Chromium y WebKit): expiración del aviso, dos ingresos consecutivos, filtros anteriores, cambio de sesión y actualización de la bandeja sin navegar.
- Datos reales conservados. La aplicación sigue siendo local: esta corrección no sincroniza computadoras distintas.

---

# Verificación de la entrega 1.3.0

- Rediseño con crema, azul marino y verde Rematech; tarjetas de captura a ancho completo y sección de visualización de documentos con selector cliente/Reparación.
- Menú lateral automático: expansión por cursor o foco de teclado, contracción al salir o elegir módulo, control manual y Escape. Conserva etiquetas accesibles y títulos de los iconos.
- 24 pruebas aprobadas en Chromium y WebKit después del cambio de estilos. Se conservan los flujos de cuentas, expedientes, comentarios, Calidad, PDF e impresión.
- Inspección visual mediante capturas WebKit a 1500 × 1000 y 1200 × 700. Verificación adicional del menú por cursor/teclado, ambas vistas de documentos y ausencia de desbordamiento horizontal en la ventana mínima.
- Las pruebas usan datos aislados. No se modificaron cuentas ni expedientes reales ni se reinició la aplicación abierta del usuario.
- Esta entrega es visual: continúa el almacenamiento local y el correo de demostración; no incluye conexión a Supabase.

---

# Verificación de la entrega 1.2.1

- Se agregó Tipo de ingreso: Servicio, Cambio o Devolución. Servicio es el valor inicial de nuevas capturas y borradores anteriores; los expedientes históricos sin el dato muestran No especificado.
- Verificación funcional aislada en WebKit: selección de las tres opciones, vista previa, persistencia tras recarga, registro del expediente y generación de ambos PDF.
- 24 pruebas existentes aprobadas en Chromium y WebKit. Se ajustó el espacio del PDF para conservar una hoja en la requisición básica.
- Se conservan las cuentas y expedientes reales; no se reinició la sesión abierta del usuario.

---

# Verificación de la entrega 1.2.0

- 24 pruebas aprobadas: 12 escenarios en Chromium y WebKit. Tras ampliar la cobertura de «Sin falla detectada», las 4 pruebas del archivo de rutas también aprobaron.
- Se verificaron los cuatro resultados dirigidos a Administración, comentario obligatorio, avisos por rol, lectura individual, bloqueo de edición después del envío a Calidad, devolución con observaciones, reapertura y segundo envío, inspecciones conservadas y nombre técnico tomado de la cuenta.
- Compatibilidad comprobada con resultados anteriores y expedientes sin los nuevos campos. Las pruebas usan datos aislados; no modifican las cuentas ni los expedientes reales.
- Formularios de Reparación y rechazo de Calidad revisados visualmente con capturas WebKit.
- PDF actualizado sin firma de conformidad de Reparación; incluye componentes, revisiones y comentarios. La firma del cliente en el ticket se conserva.
- Compilación de producción y Tauri release completadas. Paquetes `.app` y `.dmg` 1.2.0 generados para macOS Apple Silicon.
- Los avisos siguen siendo internos y locales. No se implementó sincronización entre computadoras ni notificación por correo.
- No se reinició la aplicación del usuario ni se reemplazó su sesión abierta. Para cargar los cambios, guardar el trabajo actual, cerrar la versión anterior y abrir/instalar 1.2.0.

---

# Corrección de acceso 1.1.1

- Se confirmó que la pantalla de inicio de sesión correspondía a una cuenta local existente, no a una falla al crear el primer administrador. No se eliminó ni reemplazó esa cuenta.
- Se agregó recuperación de contraseña mediante código aleatorio de un solo uso, ligado al correo, con vigencia de 24 horas y validación nativa en Rust. La contraseña nueva la escribe el usuario en la aplicación.
- Prueba Rust: rechazo de correo/código incorrectos y códigos caducados; consumo único verificado.
- Pruebas funcionales ampliadas a Chromium y WebKit, incluyendo recuperación sin pérdida de cuenta, rol ni expediente, rechazo de contraseña anterior después del cambio y creación de usuarios.
- Se corrigió la persistencia de imágenes en WebKit guardando ArrayBuffers en IndexedDB, manteniendo compatibilidad de lectura con Blobs anteriores.
- Se corrigió una carrera al iniciar sesión: el formulario ahora se restaura antes de habilitar el espacio de trabajo para evitar sobrescribir una captura iniciada inmediatamente.
- No se ha cambiado la contraseña del usuario durante estas verificaciones. Las pruebas utilizan cuentas aisladas.

---

# Verificación de la versión 1.1

## Pruebas del flujo por áreas

- `npm test`: **9 pruebas aprobadas** (6 regresiones y 3 escenarios nuevos).
- Primer administrador, login con contraseña, rechazo de contraseña incorrecta, cierre de sesión y creación de usuarios por área.
- Barra lateral con Dashboard reservado, Ingresos, Consulta y recepciones y Calidad.
- Registro de expediente único; limpieza del borrador sin eliminar expedientes.
- Búsqueda por folio, pedido y número de serie, con coincidencias parciales sin distinguir mayúsculas.
- Recepción por Reparación; validaciones, guardado del diagnóstico y persistencia tras reiniciar.
- Envío a Calidad, aparición del folio en su bandeja y cierre por un usuario de Calidad.
- Historial con responsables y fechas, campos bloqueados después del envío/cierre y PDF con información técnica y de Calidad.
- Rechazo de roles incorrectos, transiciones duplicadas y escrituras con una revisión desactualizada.
- `npm run build`: correcto. Paquetes macOS Apple Silicon 1.1.0 generados con Tauri.
- Aplicación nativa 1.1 abierta y pantalla inicial de creación del administrador revisada visualmente.
- Instalador 1.1.0 comprobado con `hdiutil verify`: checksum válido.

## Alcance de esta versión

Las cuentas y los expedientes son **locales a esta computadora**. No hay sincronización entre computadoras, autenticación de servidor ni recuperación de contraseña por correo. Para compartir los folios entre equipos debe integrarse un backend. El modo demo de correo permanece activo.

La primera apertura permite que el usuario cree su administrador; no se deja una cuenta ni contraseña preconfigurada. Windows, Intel, notarización y prueba con impresora física siguen pendientes de sus respectivos entornos.

---

# Verificación de la entrega 1.0

Fecha: 17 de septiembre de 2026. Equipo: macOS Apple Silicon.

## Resultados

- `npm test`: **6 pruebas pasaron**. Cubren selección manual múltiple, ausencia de clasificación automática, componentes únicos, agregar/eliminar, otra falla, autoguardado, dos imágenes comprimidas y persistidas, limpieza, ticket de 58/80 mm, exclusión de clasificación/fotos del ticket, requisición Carta, anexo condicional, desbordamiento a páginas adicionales, modales, validación, simulación de correo, IDs HTML, errores JavaScript y dimensiones CSS de impresión.
- `npm run build`: compilación de producción correcta.
- `npm audit --omit=dev`: **0 vulnerabilidades** reportadas. Se actualizó jsPDF a 4.2.1 durante la revisión.
- Tauri: compilación Rust de release y creación de `.app` y `.dmg` para **aarch64-apple-darwin**.
- Ventana nativa abierta y revisada visualmente, origen `tauri://localhost`.
- Guardado nativo de PDF probado mediante el selector de macOS; el archivo se escribió correctamente con los permisos mínimos configurados.
- Diálogo de impresión nativo abierto y cancelado correctamente. No había impresora seleccionada; no se imprimió papel.
- Integridad de imagen de disco comprobada con `hdiutil verify`.

## Particularidades del entorno

La primera creación de DMG falló al personalizar su ventana. La compilación con `CI=true npm run tauri build -- --bundles app,dmg` permitió empaquetar sin la personalización de Finder, una opción útil para entornos automatizados. El código de la aplicación es el mismo.

`npm run tauri info` detectó Command Line Tools y señaló que Xcode completo no está instalado. Esto no impidió compilar el `.app` ni generar el `.dmg` en este equipo. Node/npm y Rust se usaron desde runtimes de trabajo; para ejecutar los comandos desde una terminal propia hay que instalar los requisitos indicados en README y tenerlos en PATH.

## Pendiente de entorno o servicios externos

- No se compiló ni ejecutó Windows en este equipo macOS. El código, configuración y comandos de empaquetado Windows están preparados.
- No se ejecutó una compilación Intel/universal ni se probó en hardware Intel.
- Los paquetes no tienen firma Developer ID ni notarización de distribución.
- No se verificó impresión física térmica o Carta. Requiere impresora, papel y controlador configurados.
- No se envió correo real. Se requiere implementar el backend y su proveedor de correo; el modo demo está activo y se identifica en la interfaz.
- No se incorporaron usuarios, login ni base de datos central, según el alcance de esta primera versión.
