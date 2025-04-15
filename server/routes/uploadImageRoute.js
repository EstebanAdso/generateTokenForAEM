import { uploadImage } from "../functions/uploadImage.js";
import fs from "fs";

const uploadImageAEM = async (req, res) => {
    try {
        const { targetFolder } = req.params;
        const { replace } = req.query;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No se proporcionaron archivos para subir' });
        }

        // Convertir los archivos subidos al formato que espera la función uploadImage
        const filePaths = files.map(file => file.path);

        // Usar la función original de uploadImage
        const result = await uploadImage(filePaths, targetFolder, { replace: replace === 'true' });

        // Limpiar archivos temporales
        files.forEach(file => {
            try {
                fs.unlinkSync(file.path);
            } catch (err) {
                console.error('Error al eliminar archivo temporal:', err);
            }
        });

        res.json({
            success: true,
            message: 'Imágenes subidas exitosamente',
            data: result
        });
    } catch (error) {
        // Limpiar archivos temporales en caso de error
        if (req.files) {
            req.files.forEach(file => {
                try {
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                } catch (err) {
                    console.error('Error al eliminar archivo temporal:', err);
                }
            });
        }

        const statusCode = error.response?.status || 500;
        res.status(statusCode).json({
            success: false,
            message: 'Error al subir imágenes',
            error: error.response?.data || error.message
        });
    }
};

export default uploadImageAEM;