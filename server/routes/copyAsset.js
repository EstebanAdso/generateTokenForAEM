import credentials, {getAccessToken} from '../config/config.js';
import axios from 'axios';

const copyAsset = async (req, res) => {
    try {
        const { sourcePath, targetPath, newName, overwrite } = req.body;
        
        if (!sourcePath || !targetPath || !newName) {
            return res.status(400).json({ 
                error: 'Faltan parámetros requeridos: sourcePath, targetPath, newName' 
            });
        }
        
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
        
        res.json({ 
            response: response.data,
            message: 'Asset copiado y renombrado exitosamente'
        });
    } catch (error) {
        if(error.response.status === 404){
            res.status(404).json({message: "Ruta no encontrada para copiar."})
            return
        }
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json({ error: error.response?.data || error.message });
    }
};

export default copyAsset