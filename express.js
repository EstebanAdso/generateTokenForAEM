import 'dotenv/config';
import express from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import bodyParser from 'body-parser';

// Configuración de Express
const app = express();
const port = process.env.PORT || 3000;

// Configuración de multer para manejar la subida de archivos
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configuración de credenciales
const credentials = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    technicalAccountId: process.env.TECHNICAL_ACCOUNT_ID,
    orgId: process.env.ORG_ID,
    privateKey: process.env.PRIVATE_KEY,
    imsEndpoint: process.env.IMS_ENDPOINT,
};
const instancia_aem = process.env.INSTANCIA_AEM;

// Generar JWT
function generateJWT() {
    const payload = {
        exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hora de expiración
        iss: credentials.orgId,
        sub: credentials.technicalAccountId,
        aud: `${credentials.imsEndpoint}/c/${credentials.clientId}`,
        'https://ims-na1.adobelogin.com/s/ent_aem_cloud_api': true,
    };

    return jwt.sign(payload, credentials.privateKey, {
        algorithm: 'RS256',
        header: {
            'cache-control': 'no-cache',
            'content-type': 'application/x-www-form-urlencoded',
        },
    });
}

// Obtener access token
async function getAccessToken() {
    try {
        const jwtToken = generateJWT();

        const response = await axios.post(
            `${credentials.imsEndpoint}/ims/exchange/jwt`,
            new URLSearchParams({
                client_id: credentials.clientId,
                client_secret: credentials.clientSecret,
                jwt_token: jwtToken,
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        return response.data.access_token;
    } catch (error) {
        console.error('Error obteniendo token:', error.response?.data || error.message);
        throw error;
    }
}

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

// Función auxiliar para iniciar la subida
async function initiateUpload(accessToken, fileName, fileSize, targetFolder) {
    try {
        const initiateURL = `${instancia_aem}/content/dam/${targetFolder}.initiateUpload.json`;

        const response = await axios.post(
            initiateURL,
            new URLSearchParams({
                fileName: fileName,
                fileSize: fileSize.toString(),
            }),
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'x-api-key': credentials.clientId,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        const uploadURIs = response.data.files[0].uploadURIs;
        const uploadToken = response.data.files[0].uploadToken;
        const completeURI = response.data.completeURI;

        return { uploadURIs, uploadToken, completeURI };
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log('Carpeta no encontrada, intentando crearla...');
            await createFolder(
                targetFolder.split('/').pop(),
                targetFolder.split('/').pop(),
                targetFolder
            );

            return initiateUpload(accessToken, fileName, fileSize, targetFolder);
        }
        throw error;
    }
}

// Función auxiliar para subir las partes del binario
async function uploadBinaryParts(filePath, uploadURIs, fileSize) {
    try {
        const fileData = fs.readFileSync(filePath);
        const uploadURI = uploadURIs[0];

        await axios.put(uploadURI, fileData, {
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': fileSize.toString(),
                'x-ms-blob-type': 'BlockBlob',
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });
    } catch (error) {
        console.error('Error subiendo parte binaria:', error);
        throw error;
    }
}

// Función auxiliar para completar la subida
async function completeUpload(accessToken, completeURI, fileData) {
    const completeURL = `${instancia_aem}${completeURI}`;

    const formData = new URLSearchParams();
    formData.append('fileName', fileData.fileName);
    formData.append('mimeType', fileData.mimeType);
    formData.append('uploadToken', fileData.uploadToken);
    formData.append('fileSize', fileData.fileSize.toString());

    if (fileData.createVersion !== undefined) {
        formData.append('createVersion', fileData.createVersion.toString());
    }
    if (fileData.replace !== undefined) {
        formData.append('replace', fileData.replace.toString());
    }

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

    return response;
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
        const { nombre, title, direccion } = req.body;
        
        if (!nombre || !title || !direccion) {
            return res.status(400).json({ error: 'Faltan parámetros requeridos: nombre, title, direccion' });
        }

        const accessToken = await getAccessToken();
        const aemURL = `${instancia_aem}/api/assets/${direccion}/*`;

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
        
        res.json({ message: 'Carpeta creada exitosamente', data: response.data });
    } catch (error) {
        if (error.response?.status === 409) {
            return res.status(409).json({ message: 'Carpeta ya existente' });
        }
        console.error('Error creando carpeta:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Ruta para subir imagen (con multer para manejar la subida de archivos)
app.post('/api/assets/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
        }

        const { targetFolder, replace } = req.body;
        if (!targetFolder) {
            return res.status(400).json({ error: 'Falta el parámetro targetFolder' });
        }

        const filePath = req.file.path;
        const fileName = req.file.originalname;
        const fileSize = req.file.size;
        const mimeType = req.file.mimetype;

        const accessToken = await getAccessToken();

        // Paso 1: Iniciar la subida
        const initiateResponse = await initiateUpload(
            accessToken,
            fileName,
            fileSize,
            targetFolder
        );

        const { uploadURIs, uploadToken, completeURI } = initiateResponse;

        // Paso 2: Subir el binario en partes
        await uploadBinaryParts(filePath, uploadURIs, fileSize);

        // Paso 3: Completar la subida
        const completeResponse = await completeUpload(
            accessToken,
            completeURI,
            {
                fileName,
                mimeType,
                uploadToken,
                fileSize,
                replace: replace === 'true'
            }
        );

        // Eliminar el archivo temporal
        fs.unlinkSync(filePath);

        res.json({ 
            message: 'Imagen subida exitosamente', 
            data: completeResponse.data 
        });
    } catch (error) {
        console.error('Error subiendo imagen:', error);
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

// 4. Ruta para eliminar un asset
app.delete('/api/assets/:path/:name', async (req, res) => {
    try {
        const { path: assetPath, name } = req.params;
        
        const accessToken = await getAccessToken();
        const deleteURL = `${instancia_aem}/api/assets/${assetPath}/${name}`;
        
        const response = await axios.delete(deleteURL, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'x-api-key': credentials.clientId
            },
        });
        
        res.json({ message: 'Asset eliminado exitosamente', data: response.data });
    } catch (error) {
        console.error('Error eliminando asset:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Ruta para listar assets en un path
app.get('/api/assets/:path', async (req, res) => {
    try {
        const { path: assetPath } = req.params;
        
        const accessToken = await getAccessToken();
        const listURL = `${instancia_aem}/api/assets/${assetPath}.json`;
        
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
        console.error('Error listando assets:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. Ruta para descargar un asset
app.get('/api/assets/download/:aemPath/:fileName', async (req, res) => {
    try {
        const { aemPath, fileName } = req.params;
        const { newFileName } = req.query;
        
        const accessToken = await getAccessToken();
        const downloadUrl = `${instancia_aem}/api/assets/${aemPath}/${fileName}/renditions/original`;
        
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
        console.error('Error al descargar la imagen:', error);
        res.status(500).json({ error: error.message });
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
        const updateUrl = `${instancia_aem}/api/assets/${aemPath}/${fileName}`;
        
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
        console.error('Error al actualizar los metadatos:', error);
        res.status(500).json({ error: error.message });
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
        const sourceUrl = `${instancia_aem}/api/assets/${sourcePath}`;
        const destinationUrl = `${instancia_aem}/api/assets/${targetPath}/${newName}`;
        
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
        console.error('Error al copiar y renombrar el asset:', error);
        res.status(500).json({ error: error.message });
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor Express corriendo en http://localhost:${port}`);
});