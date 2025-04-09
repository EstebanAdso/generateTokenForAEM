import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import credentials, { generateJWT, getAccessToken } from '../helpers/credentials.js';
import { astronautMetadata, earthMetadata, marsMetadata } from '../helpers/metadata.js';

// Función para crear carpeta
async function createFolder(nombre, title, direccion) {
    try {
        const accessToken = await getAccessToken();
        const aemURL = `${credentials.instancia_aem}/api/assets/${direccion}/*`;

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
        console.error('Error creando carpeta:');
    }
}

// Función para subir una imagen
async function uploadImage(filePaths, targetFolder, options = {}) {
    try {
        // Convertir a array si es una sola ruta de archivo
        const files = Array.isArray(filePaths) ? filePaths : [filePaths];
        
        // Verificar que todos los archivos existan
        for (const filePath of files) {
            if (!fs.existsSync(filePath)) {
                console.error(`No se encontró la imagen en la ruta: ${filePath}`);
                return;
            }
        }

        const accessToken = await getAccessToken();

        // Paso 1: Iniciar la subida para todos los archivos
        const initiateResponse = await initiateMultiUpload(
            accessToken,
            files,
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
                fileName: data.fileName,
                mimeType: data.mimeType,
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
            await createFolder(
                targetFolder.split('/').pop(),
                targetFolder.split('/').pop(),
                targetFolder
            );
            return initiateMultiUpload(accessToken, filePaths, targetFolder);
        }
        throw error;
    }
}


// Función auxiliar para subir las partes del binario (CORREGIDA)
async function uploadBinaryParts(filePath, uploadURIs, fileSize, minPartSize, maxPartSize) {
    try {
        // Si el archivo es pequeño, subirlo todo de una vez
        if (fileSize <= maxPartSize) {
            const fileData = fs.readFileSync(filePath);
            await axios.put(uploadURIs[0], fileData, {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': fileSize.toString(),
                    'x-ms-blob-type': 'BlockBlob',
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            });
            return;
        }

        // Para archivos grandes, dividir en partes
        const fileStream = fs.createReadStream(filePath, { highWaterMark: maxPartSize });
        let partNumber = 0;
        let bytesUploaded = 0;

        for await (const chunk of fileStream) {
            const uploadURI = uploadURIs[partNumber];
            const chunkSize = chunk.length;

            await axios.put(uploadURI, chunk, {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': chunkSize.toString(),
                    'x-ms-blob-type': 'BlockBlob',
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            });

            bytesUploaded += chunkSize;
            partNumber++;
            console.log(`Subido ${bytesUploaded} de ${fileSize} bytes (${Math.round((bytesUploaded / fileSize) * 100)}%)`);
        }
    } catch (error) {
        console.error('Error subiendo parte binaria:', error);
        throw error;
    }
}

// Función auxiliar para completar la subida de múltiples archivos
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

        if (fileData.createVersion !== undefined) {
            formData.append('createVersion', fileData.createVersion.toString());
        }
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

// Manejo de argumentos de línea de comandos
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'createFolder') {
        const nombre = args[1];
        const title = args[2];
        const direccion = args[3];
        await createFolder(nombre, title, direccion);
    } else if (command === 'uploadImage') {
        const filePath = args[1];
        const targetFolder = args[2];
        const replace = args[3] === 'true';
        await uploadImage(filePath, targetFolder, { replace });
    }
}

async function deleteAsset(path, name) {
    try {
        const accessToken = await getAccessToken();
        const deleteURL = `${credentials.instancia_aem}/api/assets/${path}/${name}`;
        const response = await axios.delete(deleteURL, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
        });
        console.log('Asset eliminado exitosamente:', name);
        return response.data;
    } catch (error) {
        if (error.response?.status === 404) {
            console.log('Asset no encontrado en la ruta:', path);
            return;
        }
        console.error('Error eliminando asset:', error.response?.data || error.message);
        throw error;
    }
}

async function showToken() {

    const token = generateJWT()
    console.log('\n' + '------Token obtenido correctamente:------' + '\n' + token + '\n')

    const accessToken = await getAccessToken();
    console.log('\n' + '------Access Token obtenido correctamente:------' + '\n' + accessToken + '\n');
}

async function listAssetsInPath(path) {
    try {
        const accessToken = await getAccessToken();
        const listURL = `${credentials.instancia_aem}/api/assets/${path}.json`;
        const response = await axios.get(listURL, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
        });
        console.log('Assets en la ruta:', path, '\n', response.data);
        return response.data;
    } catch (error) {
        if(error.response?.status === 404){
            console.log('Ruta no encontrada:', path);
            return;
        }
    }
}

// Función para descargar una imagen desde AEM
async function downloadAssetFromAEM(aemPath, fileName, savePath, newFileName = fileName) {
    try {
      const accessToken = await getAccessToken();
      const downloadUrl = `${credentials.instancia_aem}/api/assets/${aemPath}/${fileName}/renditions/original`;
  
      const response = await axios.get(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': credentials.clientId
        },
        responseType: 'stream' // Para recibir el archivo como flujo de datos
      });
  
      // Definir la ruta donde se guardará la imagen
      const finalFileName = newFileName || fileName;
      const filePath = path.join(savePath, finalFileName);
  
      // Guardar la imagen en la ruta especificada
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);
  
      // Esperar a que termine la escritura del archivo
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
  
      console.log(`Imagen descargada exitosamente en: ${filePath}`);
      return filePath;
    } catch (error) {
        if(error.response?.status === 404){
            console.log('Imagen no encontrada en la ruta: '+  aemPath)
            return
        }
    }
  }


  // Función para actualizar los metadatos de una imagen en AEM
async function updateImageMetadata(aemPath, fileName, metadata) {
    try {
        const accessToken = await getAccessToken(); 
        const updateUrl = `https://author-p129753-e1405052.adobeaemcloud.com/api/assets/${aemPath}/${fileName}`;

        const response = await axios.put(updateUrl, metadata, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            }
        });

        console.log(`Metadatos actualizados exitosamente.`);
        return response.data;
    } catch (error) {
        if(error.response?.status === 404){
            console.log('Asset no encontrado en la ruta para actualizar: '+  aemPath)
            return
        }

        console.error('Error al actualizar los metadatos:', error.response?.data || error.message);
        throw error;
    }
}


async function copyAndRenameAsset(sourcePath, targetPath, newName, overwrite = false) {
    try {
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

        console.log(`Asset copiado y renombrado exitosamente: ${sourcePath} -> ${targetPath}/${newName}`);
        return response.data;
    } catch (error) {
        if(error.response?.status === 404){
            console.log('Asset no encontrado en la ruta para copiar y renombrar: '+  sourcePath)
            return
        }

        console.error('Error al copiar y renombrar el asset:', error.response?.data || error.message);
        throw error;
    }
}


main().catch(console.error);


// showToken();
// createFolder('Prueba', 'Esta es la descripción realizada en js', 'integraciones');
// uploadImage('./images/astronaut.png', 'integraciones');
// await uploadImage(
//     ['./images/astronaut.png', './images/earth.png', './images/mars.png'],
//     'integraciones',
// );
// deleteAsset('integraciones', 'astronaut.png');
// listAssetsInPath('integraciones/astronaut.png');
// downloadAssetFromAEM('integraciones', 'astronaut.png', './' , 'pruebaNode.png');
updateImageMetadata('integraciones', 'astronaut.png', astronautMetadata);
// copyAndRenameAsset('integraciones/astronaut.png', 'integraciones', 'astronauta-copia.png', true);
