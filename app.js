import 'dotenv/config';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

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
        // console.log('JWT Token:', '\n', jwtToken, '\n');

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

// Función para crear carpeta
async function createFolder(nombre, title, direccion) {
    try {
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
        console.log('Carpeta creada: ' + nombre);
        return response.data;
    } catch (error) {
        if (error.response?.status === 409) {
            console.log('Carpeta ya existente');
            return;
        }
        console.error('Error creando carpeta:');
        // console.log(error.response?.data || error.message);
        // throw error;
    }
}

// Función para subir una imagen
async function uploadImage(filePath, targetFolder, options = {}) {
    try {

        if (!fs.existsSync(filePath)) {
            console.error('No se encontró la imagen en la ruta seleccionada.');
            return;
        }
        const accessToken = await getAccessToken();

        // Obtener información del archivo
        const fileName = path.basename(filePath);
        const fileSize = fs.statSync(filePath).size;
        const mimeType = getMimeType(filePath);

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
                ...options,
            }
        );

        console.log('Imagen subida exitosamente:', completeResponse.data);
        return completeResponse.data;
    } catch (error) {
        console.error('Error subiendo imagen:', error.response?.data || error.message);
        throw error;
    }
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

        // Extraer datos importantes de la respuesta
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

// Función auxiliar para subir las partes del binario (CORREGIDA)
async function uploadBinaryParts(filePath, uploadURIs, fileSize) {
    try {
        // Leer el archivo completo como buffer
        const fileData = fs.readFileSync(filePath);

        // Usar solo el primer URI para subir todo el archivo
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
    }/* else {
     console.log('Comando no reconocido. Usa createFolder o uploadImage.');
   }*/
}

async function deleteAsset(path, name) {
    try {
        const accessToken = await getAccessToken();
        const deleteURL = `${instancia_aem}/api/assets/${path}/${name}`;
        const response = await axios.delete(deleteURL, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
        });
        console.log('Asset eliminado exitosamente:', name);
        return response.data;
    } catch (error) {
        console.error('Error eliminando asset:', error.response?.data || error.message);
        throw error;
    }
}

async function showToken() {
    const accessToken = await getAccessToken();
    console.log('\n' + '------Access Token obtenido correctamente:------' + '\n' + accessToken + '\n');
}

async function listAssetsInPath(path) {
    try {
        const accessToken = await getAccessToken();
        const listURL = `${instancia_aem}/api/assets/${path}.json`;
        const response = await axios.get(listURL, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
        });
        console.log('Assets en la ruta:', path, '\n', response.data);
        return response.data;
    } catch (error) {
        console.error('Error listando assets:', error.response?.data || error.message);
        throw error;
    }
}

// Función para descargar una imagen desde AEM
async function downloadAssetFromAEM(aemPath, fileName, savePath, newFileName = fileName) {
    try {
      const accessToken = await getAccessToken();
      const downloadUrl = `${instancia_aem}/api/assets/${aemPath}/${fileName}/renditions/original`;
  
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
      console.error('Error al descargar la imagen:', error.response?.data || error.message);
      throw error;
    }
  }


  // Función para actualizar los metadatos de una imagen en AEM
async function updateImageMetadata(aemPath, fileName, metadata) {
    try {
        const accessToken = await getAccessToken(); // Debes implementar esta función
        const updateUrl = `https://author-p129753-e1405052.adobeaemcloud.com/api/assets/${aemPath}/${fileName}`;

        const response = await axios.put(updateUrl, metadata, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            }
        });

        console.log(`Metadatos de ${fileName} actualizados exitosamente.`);
        return response.data;
    } catch (error) {
        console.error('Error al actualizar los metadatos:', error.response?.data || error.message);
        throw error;
    }
}

// Ejemplo de uso:
const metadata = {
    "class": "asset",
    "properties": {
        "dc:title": "Astronauta en el espacio",
        "dc:description": "Fotografía de astronauta flotando en la estación espacial internacional",
        "dc:creator": "NASA",
        "dc:rights": "Copyright © 2023 NASA/Roscosmos - Uso permitido con atribución",
        "dc:subject": [
            "astronauta",
            "espacio",
            "gravedad cero",
            "ISS"
        ],
        "dc:created": "2023-05-15T14:30:00Z",
        "cq:tags": [
            "space:astronaut",
            "mission:iss-63",
            "agency:nasa",
            "agency:roscosmos",
            "content-type:photography"
        ],
        "xmp:Rating": 5,
        "xmp:MetadataDate": "2023-11-20T09:15:00Z",
        "metadata": {
            "dc:format": "image/png",
            "cq:tags": [
                "properties:orientation/landscape",
                "properties:color/color",
                "properties:imageType/photograph"
            ]
        },
        "related": {
            "missions": ["ISS-63"],
            "astronauts": ["Alexander Skvortsov"]
        }
    }
};

async function copyAndRenameAsset(sourcePath, targetPath, newName, overwrite = false) {
    try {
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

        console.log(`Asset copiado y renombrado exitosamente: ${sourcePath} -> ${targetPath}/${newName}`);
        return response.data;
    } catch (error) {
        console.error('Error al copiar y renombrar el asset:', error.response?.data || error.message);
        throw error;
    }
}
main().catch(console.error);


// showToken();
// createFolder('Prueba', 'Esta es la descripción realizada en js', 'integraciones');
// uploadImage('astronaut.png', 'integraciones', true);
// deleteAsset('integraciones', 'Prueba');
// listAssetsInPath('integraciones/astronaut.png');
// downloadAssetFromAEM('integraciones', 'astronaut.png', './' , 'pruebaNode.png');
// updateImageMetadata('integraciones', 'astronaut.png', metadata);
// copyAndRenameAsset('integraciones/astronaut.png', 'integraciones', 'astronauta-copia.png', true);

