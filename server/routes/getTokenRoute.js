import {getAccessToken} from '../config/config.js';

export async function getToken(req, res) {
    try {
        const accessToken = await getAccessToken();
        res.json({ accessToken });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
