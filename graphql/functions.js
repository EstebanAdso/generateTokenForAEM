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

