import searchAssetsWithMetadata from "../functions/searchAssetMetadata.js";

const searchAssetMetadata =  async (req, res) => {
    try {
        const { property, value } = req.query;
        
        if (!property || !value) {
            return res.status(400).json({
                success: false,
                message: 'Ambos campos son requeridos'
            });
        }

        const results = await searchAssetsWithMetadata(property, value);
        
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Error in search route:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching assets',
            error: error.message
        });
    }
};

export default searchAssetMetadata;