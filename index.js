import 'dotenv/config';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
    console.log('JWT Token:', '\n', jwtToken, '\n');

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
        class: "assetFolder",
        properties: {
          name: nombre,
          title: title
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': credentials.clientId
        }
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
    console.log(error.response?.data || error.message);
    // throw error;
  }
}



// Función para subir una imagen
async function uploadImage(filePath, targetFolder, options = {}) {
  try {
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
        ...options
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
        fileSize: fileSize.toString()
      }),
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': credentials.clientId,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
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
        'x-ms-blob-type': 'BlockBlob'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
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
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': credentials.clientId,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
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
    '.tiff': 'image/tiff'
  };

  return mimeTypes[extension] || 'application/octet-stream';
}

// Ejemplo de uso
(async () => {
  try {
    const accessToken = await getAccessToken();
    console.log('Access Token obtenido correctamente');

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const imagePath = path.join(__dirname, 'prueba.png');

    if (fs.existsSync(imagePath)) {
      console.log('Subiendo imagen prueba.png...');
      await uploadImage(
        imagePath,
        'integraciones', // Carpeta destino en AEM
        {
          replace: true // Opcional: reemplazar si ya existe
        }
      );
    } else {
      console.warn('No se encontró el archivo prueba.png en la raíz del proyecto');
    }

  } catch (error) {
    console.error('Error en el proceso:', error);
  }
})();

createFolder('folderTest7', 'prueba', 'integraciones');