import 'dotenv/config';
import jwt from 'jsonwebtoken';
import axios from 'axios';

// Configuración de credenciales
const credentials = {
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  technicalAccountId: process.env.TECHNICAL_ACCOUNT_ID,
  orgId: process.env.ORG_ID,
  privateKey: process.env.PRIVATE_KEY,
  imsEndpoint: process.env.IMS_ENDPOINT
};
const instancia_aem = process.env.INSTANCIA_AEM;

// Generar JWT
function generateJWT() {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hora de expiración
    iss: credentials.orgId,
    sub: credentials.technicalAccountId,
    aud: `${credentials.imsEndpoint}/c/${credentials.clientId}`,
    "https://ims-na1.adobelogin.com/s/ent_aem_cloud_api": true
  };

  return jwt.sign(payload, credentials.privateKey, {
    algorithm: 'RS256',
    header: {
      "cache-control": "no-cache",
      "content-type": "application/x-www-form-urlencoded"
    }
  });
}

// Obtener access token
async function getAccessToken() {
  try {
    const jwtToken = generateJWT();
    console.log('JWT Token:', '\n' , jwtToken , '\n');
    
    const response = await axios.post(
      `${credentials.imsEndpoint}/ims/exchange/jwt`,
      new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        jwt_token: jwtToken
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return response.data.access_token;
    
  } catch (error) {
    console.error('Error obteniendo token:', error.response?.data || error.message);
    throw error;
  }
}

// Uso del token
(async () => {
  try {
    const accessToken = await getAccessToken();
    console.log('Access Token:', '\n', accessToken, '\n');
    
    // URL REAL de tu instancia AEM
    const aemURL = `${instancia_aem}/api/assets.json`;
    
    const aemResponse = await axios.get(aemURL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': credentials.clientId
      }
    });
    
    // console.log('Respuesta de AEM:', aemResponse.data);
    
  } catch (error) {
    console.error('Error:', error);
  }
})();


