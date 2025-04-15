import credentials, {getAccessToken} from '../config/config.js';
import axios from 'axios';
import path from 'path';

const downloadAsset = async (req, res) => {
    try {
        const { aemPath} = req.params;
        const { newFileName } = req.query;
        
        const accessToken = await getAccessToken();
        const downloadUrl = `${credentials.instancia_aem}/api/assets/${aemPath}/renditions/original`;
        
        const response = await axios.get(downloadUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'x-api-key': credentials.clientId
            },
            responseType: 'stream'
        });
        
        // Configurar headers para la descarga
        const finalFileName = newFileName || path.basename(aemPath);
        res.setHeader('Content-Disposition', `attachment; filename="${finalFileName}"`);
        res.setHeader('Content-Type', response.headers['content-type']);
        
        // Pipe del stream de respuesta al response de Express
        response.data.pipe(res);
    }catch (error) {
            const statusCode = error.response?.status || 500;
            const errorMessage = error.response?.data?.message || error.message || 'Error desconocido';
        
            // Solo devuelve el mensaje de error, evita serializar el objeto completo
            res.status(statusCode).json({ error: errorMessage + ' Asegurate de seleccionar un asset y no una carpeta' });
        }
};

export default downloadAsset