import axios from 'axios';
import jwt from 'jsonwebtoken';

// Función para formatear la clave privada
function formatPrivateKey(key) {
  let cleanKey = key.replace('-----BEGIN RSA PRIVATE KEY-----', '')
                    .replace('-----END RSA PRIVATE KEY-----', '')
                    .replace(/\s/g, ''); 
  
  let formattedKey = '';
  for (let i = 0; i < cleanKey.length; i += 64) {
    formattedKey += cleanKey.substring(i, i + 64) + '\n';
  }
  return `-----BEGIN RSA PRIVATE KEY-----\n${formattedKey}-----END RSA PRIVATE KEY-----\n`;
}

// Función para generar el JWT dinámicamente
export function generateJWT({
  clientId,
  technicalAccountId,
  orgId,
  privateKeyRaw,
  imsEndpoint,
}) {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 60 * 60, 
    iss: orgId,
    sub: technicalAccountId,
    aud: `${imsEndpoint}/c/${clientId}`,
    'https://ims-na1.adobelogin.com/s/ent_aem_cloud_api': true,
  };

  const formattedKey = formatPrivateKey(privateKeyRaw);

  return jwt.sign(payload, formattedKey, {
    algorithm: 'RS256',
  });
}

export async function ensureValidToken(session) {
  if (session.accessToken && Date.now() < session.expiresAt) {
    return; // Token válido
  }

  const {
    clientId,
    clientSecret,
    technicalAccountId,
    orgId,
    privateKeyRaw,
    imsEndpoint,
  } = session;

  if (!clientId || !clientSecret || !technicalAccountId || !orgId || !privateKeyRaw || !imsEndpoint) {
    throw new Error('Datos de sesión incompletos. Ejecuta createConnection primero.');
  }

  const jwtToken = generateJWT({
    clientId,
    technicalAccountId,
    orgId,
    privateKeyRaw,
    imsEndpoint,
  });

  const response = await axios.post(
    `${imsEndpoint}/ims/exchange/jwt`,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      jwt_token: jwtToken,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  session.accessToken = response.data.access_token;
  session.expiresAt = Date.now() + 60 * 60 * 1000; // 1 hora
}

