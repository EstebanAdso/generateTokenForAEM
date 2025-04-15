import axios from 'axios';
import credentials, {getAccessToken} from '../config/config.js';

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
        const props = error.response?.data?.properties;
        const statusMessage = props?.["status.message"] || '';
    
        if (error.response?.status === 409 && statusMessage.includes('already exist')) {
            console.log('Carpeta ya existente');
            throw new Error('Carpeta ya existente');
        }
    
        if (error.response?.status === 409 && statusMessage.includes('parent does not exist')) {
            console.log('Ruta no encontrada');
            throw new Error('Ruta no encontrada');
        }
    
        console.error('Error desconocido:', error.response?.data || error.message);
        throw new Error('Error al crear carpeta');
    }  
}

export default createFolder;