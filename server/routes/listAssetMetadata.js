import credentials, {getAccessToken} from '../config/config.js';
import axios from 'axios';

const listAssetMeta = async (req, res) => {
    try {
        const { path: assetPath } = req.params;
        
        const accessToken = await getAccessToken();
        const listURL = `${credentials.instancia_aem}/content/dam/${assetPath}.infinity.json`;
        
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
        if(error.response.status === 404){
            res.status(404).json({message: "Ruta no encontrada."})
            return
        }
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json({ error: error.response?.data || error.message });
    }
};

export default listAssetMeta;