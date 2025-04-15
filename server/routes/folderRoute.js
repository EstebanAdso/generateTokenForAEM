import createFolder from "../functions/createFolder.js";

const createFolderAEM = async (req, res) => {
    try {
        const { nombre, title, direction } = req.body;
        
        if (!nombre || !title || !direction) {
            return res.status(400).json({ error: 'Faltan parámetros requeridos: nombre, title, direction' });
        }

        await createFolder(nombre, title, direction);

        res.json({ message: 'Carpeta creada exitosamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export default createFolderAEM;