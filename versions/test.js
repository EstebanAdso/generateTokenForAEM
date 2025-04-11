import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import credentials, {getAccessToken } from '../helpers/credentials.js';

const app = express()
const port = process.env.PORT || 3000

// 5. Ruta para listar assets en un path
app.get('/api/assets/:path(*)', async (req, res) => {
    try {
        const { path: assetPath } = req.params;
        
        const accessToken = await getAccessToken();
        const listURL = `${credentials.instancia_aem}/api/assets/${assetPath}.json`;
        
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
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json({ error: error.response?.data || error.message });
    }
});


// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor Express corriendo en http://localhost:${port}`);
});