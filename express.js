import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import bodyParser from 'body-parser';
import credentials, {getAccessToken } from './helpers/credentials.js';

// Configuración de Express
const app = express();
const port = process.env.PORT || 3000;

// Configuración de multer para almacenamiento temporal
const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const tempDir = './temp_uploads';
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        cb(null, tempDir);
      },
      filename: (req, file, cb) => {
        // Mantener el nombre original del archivo
        cb(null, file.originalname);
      }
    })
  });


// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


// Función auxiliar para determinar el MIME type
function getMimeType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.tiff': 'image/tiff',
    };

    return mimeTypes[extension] || 'application/octet-stream';
}

// Función para crear carpeta
async function createFolder(nombre, title, direction) {
    try {
        const accessToken = await getAccessToken();
        const aemURL = `${credentials.instancia_aem}/api/assets/${direction}/*`;

        const response = await axios.post(
            aemURL,
            {
                class: 'assetFolder',
                properties: {
                    name: nombre,
                    title: title,
                },
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                    'x-api-key': credentials.clientId,
                },
            }
        );
        console.log('Carpeta creada: ' + nombre);
        return response.data;
    } catch (error) {
        if (error.response?.status === 409) {
            console.log('Carpeta ya existente');
            return;
        }
        console.error('Error creando carpeta:', error);
        throw error;
    }
}

// Función para subir una imagen
async function uploadImage(filePaths, targetFolder, options = {}) {
    try {
        const accessToken = await getAccessToken();

        // Paso 1: Iniciar la subida para todos los archivos
        const initiateResponse = await initiateMultiUpload(
            accessToken,
            filePaths,
            targetFolder
        );

        const { uploadData, completeURI } = initiateResponse;

        // Paso 2: Subir los binarios de cada archivo
        for (const data of uploadData) {
            await uploadBinaryParts(
                data.filePath,
                data.uploadURIs,
                data.fileSize,
                data.minPartSize,
                data.maxPartSize
            );
        }

        // Paso 3: Completar la subida para todos los archivos
        const completeResponse = await completeMultiUpload(
            accessToken,
            completeURI,
            uploadData.map(data => ({
                fileName: path.basename(data.filePath),
                mimeType: getMimeType(data.filePath),
                uploadToken: data.uploadToken,
                fileSize: data.fileSize,
                ...options
            }))
        );

        console.log('Imágenes subidas exitosamente:', completeResponse.data);
        return completeResponse.data;
    } catch (error) {
        console.error('Error subiendo imágenes:', error.response?.data || error.message);
        throw error;
    }
}

async function initiateMultiUpload(accessToken, filePaths, targetFolder) {
    try {
        const initiateURL = `${credentials.instancia_aem}/content/dam/${targetFolder}.initiateUpload.json`;
        
        // Preparar los datos para la solicitud
        const formData = new URLSearchParams();
        filePaths.forEach((filePath, index) => {
            const fileName = path.basename(filePath);
            const fileSize = fs.statSync(filePath).size;
            
            formData.append(`fileName`, fileName);
            formData.append(`fileSize`, fileSize.toString());
        });

        const response = await axios.post(
            initiateURL,
            formData,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'x-api-key': credentials.clientId,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        // Preparar los datos de subida para cada archivo
        const uploadData = filePaths.map((filePath, index) => {
            const fileInfo = response.data.files[index];
            return {
                filePath,
                fileName: fileInfo.fileName,
                fileSize: fs.statSync(filePath).size,
                mimeType: getMimeType(filePath),
                uploadURIs: fileInfo.uploadURIs,
                uploadToken: fileInfo.uploadToken,
                minPartSize: fileInfo.minPartSize,
                maxPartSize: fileInfo.maxPartSize
            };
        });

        return {
            uploadData,
            completeURI: response.data.completeURI
        };
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log('Carpeta no encontrada, intentando crearla...');
            const folderName = targetFolder.split('/').pop();
            await createFolder(folderName, folderName, targetFolder);
            return initiateMultiUpload(accessToken, filePaths, targetFolder);
        }
        throw error;
    }
}

async function uploadBinaryParts(filePath, uploadURIs, fileSize, minPartSize, maxPartSize) {
    try {
        // Leer el archivo como un Buffer
        const fileData = fs.readFileSync(filePath);
        
        // Configuración de headers
        const headers = {
            'Content-Type': 'application/octet-stream',
            'Content-Length': fileSize.toString(),
            'x-ms-blob-type': 'BlockBlob'
        };

        // Si el archivo es pequeño, subirlo todo de una vez
        if (fileSize <= maxPartSize) {
            await axios.put(uploadURIs[0], fileData, {
                headers: headers,
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });
            return;
        }

        // Para archivos grandes, dividir en partes
        const chunkSize = maxPartSize;
        let offset = 0;
        
        while (offset < fileSize) {
            const end = Math.min(offset + chunkSize, fileSize);
            const chunk = fileData.slice(offset, end);
            const partNumber = Math.floor(offset / chunkSize);
            
            await axios.put(uploadURIs[partNumber], chunk, {
                headers: {
                    ...headers,
                    'Content-Length': (end - offset).toString()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            offset = end;
            console.log(`Subido ${offset} de ${fileSize} bytes (${Math.round((offset / fileSize) * 100)}%)`);
        }
    } catch (error) {
        console.error('Error subiendo parte binaria:', error);
        throw error;
    }
}

async function completeMultiUpload(accessToken, completeURI, filesData) {
    const completeURL = `${credentials.instancia_aem}${completeURI}`;
    
    // Procesar cada archivo individualmente
    const results = [];
    for (const fileData of filesData) {
        const formData = new URLSearchParams();
        formData.append('fileName', fileData.fileName);
        formData.append('mimeType', fileData.mimeType);
        formData.append('uploadToken', fileData.uploadToken);
        formData.append('fileSize', fileData.fileSize.toString());

        if (fileData.replace !== undefined) {
            formData.append('replace', fileData.replace.toString());
        }

        try {
            const response = await axios.post(
                completeURL,
                formData,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'x-api-key': credentials.clientId,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );
            results.push(response.data);
            console.log(`Subida completada para: ${fileData.fileName}`);
        } catch (error) {
            console.error(`Error completando subida para ${fileData.fileName}:`, error.response?.data || error.message);
            results.push({ error: error.message, fileName: fileData.fileName });
        }
    }

    return { data: results };
}

// Rutas del API
// 1. Ruta para obtener token
app.get('/api/token', async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        res.json({ accessToken });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Ruta para crear carpeta
app.post('/api/folders', async (req, res) => {
    try {
        const { nombre, title, direction } = req.body;
        
        if (!nombre || !title || !direction) {
            return res.status(400).json({ error: 'Faltan parámetros requeridos: nombre, title, direction' });
        }

        await createFolder(nombre, title, direction);
        res.json({ message: 'Carpeta creada exitosamente' });
    } catch (error) {
        if (error.response?.status === 409) {
            return res.status(409).json({ message: 'Carpeta ya existente' });
        }
        res.status(500).json({ error: error.message });
    }
});

// 3. Ruta para subir imágenes
app.post('/api/upload/:targetFolder', upload.array('files'), async (req, res) => {
    try {
        const { targetFolder } = req.params;
        const { replace } = req.query;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No se proporcionaron archivos para subir' });
        }

        // Convertir los archivos subidos al formato que espera la función uploadImage
        const filePaths = files.map(file => file.path);

        // Usar la función original de uploadImage
        const result = await uploadImage(filePaths, targetFolder, { replace: replace === 'true' });

        // Limpiar archivos temporales
        files.forEach(file => {
            try {
                fs.unlinkSync(file.path);
            } catch (err) {
                console.error('Error al eliminar archivo temporal:', err);
            }
        });

        res.json({
            success: true,
            message: 'Imágenes subidas exitosamente',
            data: result
        });
    } catch (error) {
        // Limpiar archivos temporales en caso de error
        if (req.files) {
            req.files.forEach(file => {
                try {
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                } catch (err) {
                    console.error('Error al eliminar archivo temporal:', err);
                }
            });
        }

        const statusCode = error.response?.status || 500;
        res.status(statusCode).json({
            success: false,
            message: 'Error al subir imágenes',
            error: error.response?.data || error.message
        });
    }
});

// 4. Ruta para eliminar un asset
app.delete('/api/assets/:path/:name', async (req, res) => {
    try {
        const { path: assetPath, name } = req.params;
        
        const accessToken = await getAccessToken();
        const deleteURL = `${credentials.instancia_aem}/api/assets/${assetPath}/${name}`;
        
        const response = await axios.delete(deleteURL, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'x-api-key': credentials.clientId
            },
        });
        
        res.json({ message: 'Asset eliminado exitosamente', data: response.data });
    } catch (error) {
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json({ error: error.response?.data || error.message });
    }
});

// 5. Ruta para listar assets en un path
app.get('/api/assets/:path', async (req, res) => {
    try {
        const { path: assetPath } = req.params;
        
        const accessToken = await getAccessToken();
        const listURL = `${credentials.instancia_aem}/api/assets/${assetPath}.json`;
        
        const response = await axios.get(listURL, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'x-api-key': credentials.clientId
            },
        });
        
        res.json({ 
            message: 'Assets listados exitosamente', 
            data: response.data 
        });
    } catch (error) {
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json({ error: error.response?.data || error.message });
    }
});

// 6. Ruta para descargar un asset
app.get('/api/assets/download/:aemPath/:fileName', async (req, res) => {
    try {
        const { aemPath, fileName } = req.params;
        const { newFileName } = req.query;
        
        const accessToken = await getAccessToken();
        const downloadUrl = `${credentials.instancia_aem}/api/assets/${aemPath}/${fileName}/renditions/original`;
        
        const response = await axios.get(downloadUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'x-api-key': credentials.clientId
            },
            responseType: 'stream'
        });
        
        // Configurar headers para la descarga
        const finalFileName = newFileName || fileName;
        res.setHeader('Content-Disposition', `attachment; filename="${finalFileName}"`);
        res.setHeader('Content-Type', response.headers['content-type']);
        
        // Pipe del stream de respuesta al response de Express
        response.data.pipe(res);
    } catch (error) {
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json({ error: error.response?.data || error.message });
    }
});

// 7. Ruta para actualizar metadatos de un asset
app.put('/api/assets/metadata/:aemPath/:fileName', async (req, res) => {
    try {
        const { aemPath, fileName } = req.params;
        const metadata = req.body;
        
        if (!metadata) {
            return res.status(400).json({ error: 'Faltan los metadatos en el cuerpo de la solicitud' });
        }
        
        const accessToken = await getAccessToken();
        const updateUrl = `${credentials.instancia_aem}/api/assets/${aemPath}/${fileName}`;
        
        const response = await axios.put(updateUrl, metadata, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'x-api-key': credentials.clientId
            }
        });
        
        res.json({ 
            message: 'Metadatos actualizados exitosamente', 
            data: response.data 
        });
    } catch (error) {
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json({ error: error.response?.data || error.message });
    }
});

// 8. Ruta para copiar y renombrar un asset
app.post('/api/assets/copy', async (req, res) => {
    try {
        const { sourcePath, targetPath, newName, overwrite } = req.body;
        
        if (!sourcePath || !targetPath || !newName) {
            return res.status(400).json({ 
                error: 'Faltan parámetros requeridos: sourcePath, targetPath, newName' 
            });
        }
        
        const accessToken = await getAccessToken();
        const sourceUrl = `${credentials.instancia_aem}/api/assets/${sourcePath}`;
        const destinationUrl = `${credentials.instancia_aem}/api/assets/${targetPath}/${newName}`;
        
        const response = await axios({
            method: 'COPY',
            url: sourceUrl,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Destination': destinationUrl,
                'X-Overwrite': overwrite ? 'T' : 'F',
                'x-api-key': credentials.clientId
            }
        });
        
        res.json({ 
            message: 'Asset copiado y renombrado exitosamente', 
            data: response.data 
        });
    } catch (error) {
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json({ error: error.response?.data || error.message });
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor Express corriendo en http://localhost:${port}`);
});