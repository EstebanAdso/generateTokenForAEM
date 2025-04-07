import jwt from 'jsonwebtoken';
import axios from 'axios';

const credentials = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    technicalAccountId: process.env.TECHNICAL_ACCOUNT_ID,
    orgId: process.env.ORG_ID,
    privateKey: process.env.PRIVATE_KEY,
    imsEndpoint: process.env.IMS_ENDPOINT,
    instancia_aem: process.env.INSTANCIA_AEM
};


// Generar JWT
export function generateJWT() {
    const payload = {
        exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hora de expiración
        iss: credentials.orgId,
        sub: credentials.technicalAccountId,
        aud: `${credentials.imsEndpoint}/c/${credentials.clientId}`,
        'https://ims-na1.adobelogin.com/s/ent_aem_cloud_api': true,
    };

    return jwt.sign(payload, credentials.privateKey, {
        algorithm: 'RS256',
        header: {
            'cache-control': 'no-cache',
            'content-type': 'application/x-www-form-urlencoded',
        },
    });
}

// Obtener access token
export async function getAccessToken() {
    try {
        const jwtToken = generateJWT();
        // console.log('JWT Token:', '\n', jwtToken, '\n');

        const response = await axios.post(
            `${credentials.imsEndpoint}/ims/exchange/jwt`,
            new URLSearchParams({
                client_id: credentials.clientId,
                client_secret: credentials.clientSecret,
                jwt_token: jwtToken,
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        return response.data.access_token;
    } catch (error) {
        console.error('Error obteniendo token:', error.response?.data || error.message);
        throw error;
    }
}

export default credentials