Paquete | Descripción
axios | Cliente HTTP basado en Promesas para hacer solicitudes a APIs REST, útil para consumir servicios externos o internos.
body-parser | Middleware que permite interpretar los cuerpos de las solicitudes entrantes (por ejemplo, JSON, x-www-form-urlencoded). Aunque ya viene integrado en Express desde v4.16, se sigue usando por compatibilidad o preferencias.
cors | Habilita el intercambio de recursos entre distintos orígenes (CORS), permitiendo que el backend acepte solicitudes desde otros dominios o puertos.
dotenv | Permite cargar variables de entorno desde un archivo .env para gestionar configuraciones sensibles como credenciales o claves.
express | Framework de Node.js minimalista y flexible para construir APIs y aplicaciones web de manera rápida. Es el núcleo de este proyecto.
fs | Módulo para manipular el sistema de archivos (crear, leer, escribir, borrar archivos). Nota: fs ya viene con Node.js, no es necesario instalarlo. Esta versión puede ser un placeholder.
install | Herramienta general para instalar paquetes, aunque no es común usarla directamente en proyectos (puede ser redundante si usas npm/yarn). Si no la estás usando explícitamente, podrías eliminarla.
jsonwebtoken | Permite generar y verificar JSON Web Tokens (JWT), comúnmente usado para autenticación y autorización de usuarios.
multer | Middleware para manejar multipart/form-data, principalmente para la subida de archivos en formularios.
path-to-regexp | Convierte rutas con parámetros (/api/:id) en expresiones regulares que permiten hacer matching dinámico de rutas. Express internamente lo utiliza.

Paquete | Descripción
eslint | Herramienta de análisis estático para encontrar y corregir errores o malas prácticas en el código JavaScript. Ideal para mantener la calidad y consistencia del código.