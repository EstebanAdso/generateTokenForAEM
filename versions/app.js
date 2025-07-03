import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { astronautMetadata, earthMetadata, marsMetadata } from '../helpers/metadata.js';


// Configuración de credenciales
const credentials = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    technicalAccountId: process.env.TECHNICAL_ACCOUNT_ID,
    orgId: process.env.ORG_ID,
    privateKey: process.env.PRIVATE_KEY,
    imsEndpoint: process.env.IMS_ENDPOINT
};
const instancia_aem = process.env.INSTANCIA_AEM;

// Generar JWT
function generateJWT() {
    const payload = {
        exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hora de expiración
        iss: credentials.orgId,
        sub: credentials.technicalAccountId,
        aud: `${credentials.imsEndpoint}/c/${credentials.clientId}`,
        "https://ims-na1.adobelogin.com/s/ent_aem_cloud_api": true
    };

    return jwt.sign(payload, credentials.privateKey, {
        algorithm: 'RS256',
        header: {
            "cache-control": "no-cache",
            "content-type": "application/x-www-form-urlencoded"
        }
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
                jwt_token: jwtToken
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
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
        const initiateURL = `${instancia_aem}/content/dam/${targetFolder}.initiateUpload.json`;

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
    const completeURL = `${instancia_aem}${completeURI}`;

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
        const deleteURL = `${instancia_aem}/api/assets/${path}/${name}`;
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
        const listURL = `${instancia_aem}/api/assets/${path}.json`;
        const response = await axios.get(listURL, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
        });
        console.log('Assets en la ruta:', path, '\n', response.data);
        return response.data;
    } catch (error) {
        if (error.response?.status === 404) {
            console.log('Ruta no encontrada:', path);
            return;
        }
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
        if (error.response?.status === 404) {
            console.log('Imagen no encontrada en la ruta: ' + aemPath)
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
        if (error.response?.status === 404) {
            console.log('Asset no encontrado en la ruta para actualizar: ' + aemPath)
            return
        }
        if (error.response?.status === 423) {
            console.log('Asset bloqueado en la ruta para actualizar: ' + aemPath)
            return
        }

        console.error('Error al actualizar los metadatos:', error.response?.data || error.message);
        throw error;
    }
}


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
        if (error.response?.status === 404) {
            console.log('Asset no encontrado en la ruta para copiar y renombrar: ' + sourcePath)
            return
        }

        console.error('Error al copiar y renombrar el asset:', error.response?.data || error.message);
        throw error;
    }
}

async function searchAssetsWithMetadata(property, value) {
    try {
        const accessToken = await getAccessToken();
        const searchUrl = `${instancia_aem}/bin/querybuilder.json?path=/content/dam&type=dam:Asset&property=${property}&property.value=${value}&p.limit=-1`;
        const response = await axios.get(searchUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'x-api-key': credentials.clientId
            }
        });
        console.log('Assets encontrados:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error al buscar el metadato:', error.response?.data || error.message);
        throw error;
    }
}

async function getMetadataInAssets(path) {
    try {
        const accessToken = await getAccessToken();
        const url = `${instancia_aem}/content/dam/${path}.infinity.json`;
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
        });
        console.log('Assets en la ruta:', path, '\n', response.data);
        return response.data;
    } catch (error) {
        if (error.response?.status === 404) {
            console.log('Ruta no encontrada:', path);
            return;
        }
    }
}

async function hibernateTest() {
    try {
        const accessToken = await getAccessToken();
        const url = instancia_aem;

        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
        });

        if (
            typeof response.data === 'string' &&
            (response.data.includes('healthy="hibernated"') || response.data.includes('<title>AEM Cloud Service</title>'))
        ) {
            console.log('🟡 AEM está en hibernación');
            return true;
        }
        console.log('🟢 AEM está activo');
        return false;
    } catch (error) {
        console.error('❌ Error al verificar AEM:', error.message);
        return false;
    }
}

export async function showMetadataSchemaRavel() {
    try {
      const accessToken = await getAccessToken();
      const url = instancia_aem + '/conf/global/settings/dam/adminui-extension/metadataschema/ravel.infinity.json';
  
      const response = await axios(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-api-key': credentials.clientId
        }
      });
  
      let ravelMetadata = {};
  
      function extractRavelFields(obj) {
        for (let key in obj) {
          const node = obj[key];
      
          if (typeof node === 'object' && node !== null) {
            // Detectar multifield con field interno (caso color)
            const isMultiField = node.resourceType?.includes('multifield') &&
                                 node.field?.name?.includes('ravel');
      
            if (isMultiField) {
              const innerName = node.field.name;
              const cleanName = innerName.split('ravel_')[1] || innerName;
              const metaType = node['granite:data']?.metaType || 'unknown';
              const label = node.fieldLabel || node.field?.fieldLabel || '';
      
              ravelMetadata[`_${cleanName}`] = {
                label,
                path: innerName,
                type: metaType
              };
      
              // 🔁 NO seguir con el subcampo `.field`, ya fue procesado
              continue;
            }
      
            // Normal
            if (node.name && node.name.includes('ravel')) {
              const cleanName = node.name.split('ravel_')[1] || node.name;
              const metaType = node['granite:data']?.metaType || 'unknown';
              const label = node.fieldLabel || node.text || '';
      
              // Evitar sobrescribir si ya se procesó (como en multifield)
              if (!ravelMetadata[`_${cleanName}`]) {
                let fieldData = {
                  label,
                  path: node.name,
                  type: metaType
                };
      
                if (metaType === 'dropdown' && node.items) {
                  fieldData.options = Object.values(node.items)
                    .filter(item => typeof item === 'object' && item.value)
                    .map((item, index) => ({
                      label: item.text || item.value,
                      value: item.value,
                      displayOrder: index + 1
                    }));
                }
      
                ravelMetadata[`_${cleanName}`] = fieldData;
              }
            }
      
            extractRavelFields(node, key);
          }
        }
      }
      
      extractRavelFields(response.data);
  
      if (Object.keys(ravelMetadata).length === 0) {
        console.log('No se encontraron campos ravel');
        return false;
      }
  
      console.log('Campos con ravel encontrados:', Object.keys(ravelMetadata).length);
      console.log('Metadata Schema Ravel:', ravelMetadata);
      return ravelMetadata;
    } catch (error) {
      console.error('Error al mostrar el metadata schema ravel:', error.message);
      return false;
    }
  }
  

//Verificar si la carpeta tiene el esquema de Ravel
export async function verifyFolderSchema(folderPath) {
    try {
        const accessToken = await getAccessToken();
        const url = instancia_aem + '/content/dam/' + folderPath + '/jcr:content.json';
        
        const response = await axios(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'x-api-key': credentials.clientId
            }
        });
        
        // Verificar específicamente el metadataSchema
        if(response.data.metadataSchema === '/conf/global/settings/dam/adminui-extension/metadataschema/ravel') {
            console.log('La carpeta tiene el esquema de Ravel');
            return true;
        }
        console.log(`La carpeta ${folderPath} no tiene el esquema de Ravel tiene: ${response.data.metadataSchema}`);
        return false;
    } catch (error) {
        console.error('Error al verificar el esquema de la carpeta:', error.message);
        return false;
    }
}

// hibernateTest();
// showToken();
// createFolder('Prueba3', 'Esta es la descripción realizada en js', 'integraciones');
// uploadImage('./images/astronaut.png', 'integraciones');
// await uploadImage(
//     ['./images/astronaut.png', './images/earth.png', './images/mars.png'],
//     'integraciones',
// );
// deleteAsset('integraciones', 'astronaut.png');
// listAssetsInPath('integraciones/astronaut.png');
// downloadAssetFromAEM('integraciones', 'astronaut.png', './' , 'pruebaNode.png');
// updateImageMetadata('integraciones', 'earth.png', earthMetadata);
// copyAndRenameAsset('integraciones/astronaut.png', 'integraciones', 'astronauta-copia.png', true);
// searchAssetsWithMetadata('jcr:content/metadata/dc:title', 'Planeta Saturno');
// getMetadataInAssets('integraciones/astronauta.png');
// showMetadataSchemaRavel();
// verifyFolderSchema('integraciones');
