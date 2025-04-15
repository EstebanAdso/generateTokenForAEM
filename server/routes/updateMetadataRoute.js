import credentials, {getAccessToken} from '../config/config.js';
import axios from 'axios';

const updateMetadata = async (req, res) => {
    try {
        const { aemPath} = req.params;
        const metadata = req.body;
        
        if (!metadata) {
            return res.status(400).json({ error: 'Faltan los metadatos en el cuerpo de la solicitud' });
        }
        
        const accessToken = await getAccessToken();
        const updateUrl = `${credentials.instancia_aem}/api/assets/${aemPath}`;
        
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
        if(error.response.status === 404){
            res.status(404).json({message: "Ruta no encontrada para actualizar."})
            return
        }
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json({ error: error.response?.data || error.message });
    }
};

export default updateMetadata;