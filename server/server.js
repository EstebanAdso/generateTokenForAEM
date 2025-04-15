import express from 'express';
import listAsset from './routes/listAssetRoute.js';
import { getToken } from './routes/getTokenRoute.js';
import bodyParser from 'body-parser';
import copyAsset from './routes/copyAsset.js';
import downloadAsset from './routes/downloadAssetRoute.js';
import createFolder from './functions/createFolder.js';
import listAssetMeta from './routes/listAssetMetadata.js';
import searchAssetsWithMetadata from './functions/searchAssetMetadata.js';
import updateMetadata from './routes/updateMetadataRoute.js';
import { uploadImage } from './functions/uploadImage.js';
import upload from './middlewares/multerConfig.js';
import deleteAsset from './routes/deleteAssetRoute.js';

// Configuración de Express
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/api/assets/copy', copyAsset);
app.delete('/api/assets/:path/:name', deleteAsset);
app.get('/api/download/:aemPath(*)', downloadAsset);
app.post('/api/folders', createFolder);
app.get('/api/token', getToken);
app.get('/api/get/metadata/:path(*)', listAssetMeta);
app.get('/api/assets/:path(*)', listAsset);
app.get('/api/search/metadata', searchAssetsWithMetadata);
app.put('/api/update/metadata/:aemPath(*)', updateMetadata);
app.post('/api/upload/:targetFolder(*)', upload.array('files'), uploadImage);

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor Express corriendo en http://localhost:${port}`);
});