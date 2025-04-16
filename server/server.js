import express from 'express';
import listAsset from './routes/listAssetRoute.js';
import bodyParser from 'body-parser';
import upload from './middlewares/multerConfig.js';
import downloadAsset from './routes/downloadAssetRoute.js';
import listAssetMeta from './routes/listAssetMetadata.js';
import updateMetadata from './routes/updateMetadataRoute.js';
import copyAsset from './routes/copyAsset.js';
import { getToken } from './routes/getTokenRoute.js';
import deleteAsset from './routes/deleteAssetRoute.js';
import createFolderAEM from './routes/folderRoute.js';
import searchAssetMetadata from './routes/searchAssetWithMetadataRoute.js';
import uploadImageAEM from './routes/uploadImageRoute.js';

// Configuración de Express
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/api/assets/copy', copyAsset);
app.delete('/api/assets/:path/:name', deleteAsset);
app.get('/api/download/:aemPath(*)', downloadAsset);
app.post('/api/folders', createFolderAEM);
app.get('/api/token', getToken);
app.get('/api/get/metadata/:path(*)', listAssetMeta);
app.get('/api/assets/:path(*)', listAsset);
app.get('/api/search/metadata', searchAssetMetadata);
app.put('/api/update/metadata/:aemPath(*)', updateMetadata);
app.post('/api/upload/:targetFolder(*)', upload.array('files'), uploadImageAEM);

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor Express corriendo en http://localhost:${port}`);
});