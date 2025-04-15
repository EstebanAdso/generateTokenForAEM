import axios from 'axios';
import credentials, {getAccessToken} from '../config/config.js';

async function searchAssetsWithMetadata(property, value) {
    try {
        const accessToken = await getAccessToken();
        const searchUrl = `${credentials.instancia_aem}/bin/querybuilder.json?path=/content/dam&type=dam:Asset&property=${property}&property.value=${value}&p.limit=-1`;
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

export default searchAssetsWithMetadata