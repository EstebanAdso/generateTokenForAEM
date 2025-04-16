import express from 'express';
import listAsset from './listAssetRoute.js';
import downloadAsset from './downloadAssetRoute.js';
import listAssetMeta from './listAssetMetadata.js';
import updateMetadata from './updateMetadataRoute.js';
import copyAsset from './copyAsset.js';
import { getToken } from './getTokenRoute.js';
import deleteAsset, { deleteAssetDiscarted } from './deleteAssetRoute.js';
import createFolderAEM from './folderRoute.js';
import searchAssetMetadata from './searchAssetWithMetadataRoute.js';
import uploadImageAEM from './uploadImageRoute.js';
import upload from '../middlewares/multerConfig.js';

const router = express.Router(); 

// Definición de rutas
router.get('/assets/:path(*)', listAsset);
router.get('/download/:aemPath(*)', downloadAsset);
router.get('/get/metadata/:path(*)', listAssetMeta);
router.put('/update/metadata/:aemPath(*)', updateMetadata);
router.post('/assets/copy', copyAsset);
router.delete('/asset/:path(*)', deleteAsset);
router.delete('/assets/discarted/:path(*)', deleteAssetDiscarted);
router.post('/folders', createFolderAEM);
router.get('/token', getToken);
router.get('/search/metadata', searchAssetMetadata);
router.post('/upload/:targetFolder(*)', upload.array('files'), uploadImageAEM);

export default router;
