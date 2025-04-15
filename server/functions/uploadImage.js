import axios from 'axios';
import fs from 'fs';
import path from 'path';
import credentials, {getAccessToken} from '../config/config.js';
import getMimeType from './getMimeType.js';
import createFolder from './createFolder.js';


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
        if (error.response?.status === 404) {
            throw new Error('Carpeta no encontrada');
        }
        console.error('Error subiendo imágenes:', error.response?.data || error.message);
        throw error;
    }
}

async function initiateMultiUpload(accessToken, filePaths, targetFolder) {
    try {
        const initiateURL = `${credentials.instancia_aem}/content/dam/${targetFolder}.initiateUpload.json`;
        
        // Preparar los datos para la solicitud
        const formData = new URLSearchParams();
        filePaths.forEach((filePath) => {
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

export {
    uploadImage,
    initiateMultiUpload,
    uploadBinaryParts,
    completeMultiUpload
}