import credentials, {getAccessToken} from '../config/config.js';
import axios from 'axios';

const deleteAsset = async (req, res) => {
    try {
        const { path: assetPath } = req.params;
        
        const accessToken = await getAccessToken();
        const deleteURL = `${credentials.instancia_aem}/api/assets/${assetPath}`;
        
        const response = await axios.delete(deleteURL, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'x-api-key': credentials.clientId
            },
        });
        
        res.json({ message: 'Asset eliminado exitosamente', data: response.data });
    }catch (error) {
        if (error.response?.status === 404) {
            console.log('Ruta no encontrada');
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }
    
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json({ error: error.response?.data || error.message });
    }
    
};


export const deleteAssetDiscarted = async (req, res) => {
    try {
        const { path: assetPath } = req.params;
        
        const accessToken = await getAccessToken();
        const deleteURL = `${credentials.instancia_aem}/content/dam/${assetPath}/jcr:content/cq:discarded`;
        
        const response = await axios.delete(deleteURL, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'x-api-key': credentials.clientId
            },
        });
        
        res.json({ message: 'Asset descartados eliminados exitosamente', data: response.data });
    }catch (error) {
        if (error.response?.status === 404) {
            console.log('Ruta no encontrada');
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }
    
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json({ error: error.response?.data || error.message });
    }
    
};


export default deleteAsset;