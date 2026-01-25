# Errores a Resolver (input del usuario)

Además, en todos los módulos debería existir no solamente la selección   
  de modelos locales, sino también la selección de modelos API. Lo hemos   
  intentado varias veces, te lo he pedido varias veces y no lo logras      
  hacer. No sé por qué. Yo tengo que tener la capacidad de seleccionar un  
  modelo API también. Ese modelo API es con el que generaré hacer las      
  cosas. Por supuesto, todos los modelos API no funcionan para todos los   
  módulos. Eso debe ser algo que tú hicieras y que coloques el que
  funciona en cada módulo, como para la elección del usuario. Además de    
  los modelos API, debemos tener la capacidad de saber si están
  configuradas las APIs o no y que hagas una validación. Poder validar     
  que está funcionando el token, pero una validación rápida.Si no está     
  configurado, hay que ir al modelo. Hay que saber qué tipo de error está  
  dando, no cualquier error genérico.Tiene que haber guías para cada       
  modelo de API, según el error, y enlaces que le den directamente a       
  donde tienes que ir. Y el modelo Orpheus 3B del grande, cuando intento   
  descargar, no funciona. O sea, pasa la pantalla de cargando, vuelve a    
  la pantalla de modelos rápidamente y demuestra que está todavía con la   
  opción de descargar de nuevo. No funciona la descarga y no te dice por   
  qué. Te dice un error exacto. Y mira además todos estos errores que      
  tengo en el backend, que no sé por qué son y cómo resolverlos.  Además, instalé el modelo Faster TTT, F5 TTT 
  (perdón, Kokoro TTS). Todo eso lo instalé. Fui de nuevo al módulo Text   
  to speech y el único que aparece instalado es Chatterbox. Los demás no   
  reconoce que ya están instalados. No muestran sus diversas opciones de   
  tamaño de modelo, si es que lo tienen. No muestran nada. En el caso de   
  Kokoro, no muestra nada: las diferentes voces que vienen preinstaladas   
  no muestra nada, absolutamente nada. Esto no está funcionando. Y en los  
  otros módulos, como Realtime Reader, no hay nada:
  - No hay selección de API por modelo.
  - No hay selección de modelos locales.  Nada, absolutamente nada. No     
  has cambiado nada de eso cuando te lo he pedido varias veces. En el módulo "speech to text" tampoco hay ninguna selección de modelos locales, selección de modelos API, nada, nada, nada de eso. De eso que debería ser estándar para todos los módulos. Pero lo único que debe cambiar son los modelos que se pueden seleccionar, porque no todos los módulos corresponden a las habilidades de todos los módulos. Pero eso no está; eso está solamente en el primer módulo y, quizás, en el de transcripción, no lo recuerdo. Pero en el "speech to text" y en el que te mencioné anteriormente, nada de eso tiene la selección para seleccionar con qué motor vamos a generar lo que se genera o vamos a hacer la acción que promete ese módulo. Además, cuando tú lees un modelo o un módulo, acuerdate que todo esto funciona con Hotkey también y debería funcionar a nivel de Windows sin necesidad de abrir la aplicación en muchos casos. Por ejemplo, esto debe funcionar para transcribir de voz a texto y poder copiar lo que transcribe automáticamente dentro de un campo de texto, dentro del lugar donde estés colocando el cursor. Por eso, tiene que haber permanencia, tiene que haber memoria, tiene que haber persistencia de las opciones de configuración que uno elige. Si en un módulo tienes seleccionado un proveedor de modelo, ya sea API o ya sea local, ese es el que debe ser utilizado cuando utilizas los Hotkeys para hacer acciones en Windows o como leer un texto que seleccionaste en el navegador o en una aplicación en voz alta, pausarlo, etc. Todas esas cosas que no sé si ya están implementadas acá, pero me parece que no. O como generar una voz, no, perdón, leer con una voz específica, o como transcribir de tu voz a texto en un documento Word que tengas abierto. Todo tiene que ser con el modelo que hayas elegido. O como traducir un texto, y que te aparezca, entonces en el navegador o en la aplicación, te aparezca un pop-up o una modal pequeña, dinámica, que vaya cambiando según selecciones al texto, al idioma al que quieras traducirlo. No sé si todo eso está, porque realmente no lo veo por ninguna parte, pero lo que sí debe suceder es que los modelos persistan. La elección de los modelos persista. Fíjate que en el módulo de transcripción tampoco veo la selección de los modelos, ya sea API o modelo normal. No los veo tampoco. Tampoco en la librería de voces, que además las voces a partir de ahora tienen que tener un tag para saber con qué modelos se generaron, bajo qué parámetros, bajo qué configuración, y poder filtrar por el tipo de modelo que generó la voz. Y hay que saber si una voz generada por un modelo puede ser utilizada por otro o no. Esas interacciones tienen que ser tomadas en cuenta.  Y es que veo que, en "providers", para "text to speak", para "speak to text", para "IEDIT" en "settings", tenemos selección de modelos locales. Pero no deberíamos tenerlos porque ya lo estamos seleccionando a nivel de módulo. Y creo que uno de los problemas que tenemos a la hora de descargar los modelos es que tenemos dos formas, dos lugares donde descargarlo. En "Settings" tenemos "Local Models" y también tenemos una página específica para modelos. Yo creo que esa página específica de modelos debería ir directamente a este "Settings". Y que todo lo que te he dicho que debe hacer la página específica de modelos sea el hecho en la UI que está aquí en "Settings".  En apariencia, me da opción de tema light y dark, pero sin embargo no funciona: no lo tienen. Y en lenguaje, igual me da opción de inglés y español. Sin embargo, no funciona: no lo tienen.'

Por favor, antes de ponerte a trabajar este prompt tal y como está aquí, copialo en "plans", donde diga "errores a resolver", y luego haz tu propia planificación, tu propia lista de errores, para irlos resolviendo uno por uno, porque esto te lo he dicho varias veces y no se ha resuelto mucho de esto. En historia y el historial debe haber historial para cada módulo. Cada módulo hace cosas y debe haber historial para cada uno de ellos, no solamente para TTS, Generation y Transkitchen como está ahora. Y otra cosa que me perturba es que, en todos los local models, aparece que Wispr, speakwhisper o lo que sea no está instalado. Sin embargo, en algunos modos me aparece como una opción elegible.


En "setting" también me va dando 80 notificaciones que no hacen nada. Y minimis to try, o sea, keep the app running in the try when closed.

<image>

---

## Codex lista de trabajo (por resolver)

Estado: pendiente. Ire tachando uno por uno.

1) Arreglar rutas duplicadas de settings (/api/settings/{path}) y errores en Settings (api-keys, hotkeys).
2) Unificar seleccion de proveedores (API/local) por modulo y persistencia de seleccion (incluye hotkeys).
3) Quitar duplicidad Settings vs Models: un solo lugar para modelos, con errores claros de descarga.
4) Mostrar progreso real y error en descargas (Orpheus 3B y otros).
5) Historial por modulo (TTS, STT, Reader, AI Edit, Translate, Transcribe).
6) Aplicar Theme/Language de Settings (sin dejar toggles muertos).
7) "Minimize to tray" y notificaciones: aplicar settings a Electron.
8) Reducir 404 de __next.*.txt (prefetch) en Electron.
9) Mensajes no tecnicos en UI (evitar "pip install ...").
10) Modelos locales: estados consistentes en todos los modulos (no mostrar instalable como listo).
