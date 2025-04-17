import { ApolloServer } from 'apollo-server';
import { gql } from 'apollo-server';
import jwt from 'jsonwebtoken';
import axios from 'axios';

// Definición de los tipos de GraphQL
const typeDefs = gql`
  type AccessToken {
    token: String!
    expiresAt: String!
  }

  input AEMCredentials {
    clientId: String!
    clientSecret: String!
    technicalAccountId: String!
    orgId: String!
    privateKeyRaw: String!
    imsEndpoint: String!
    instanciaAem: String!
  }

  type Query {
    getAccessToken(credentials: AEMCredentials!): AccessToken!
  }
`;

// Función para procesar la clave privada en formato raw
function processPrivateKey(privateKeyRaw) {
  // Comprueba si la clave ya está en formato PEM
  if (privateKeyRaw.includes("-----BEGIN RSA PRIVATE KEY-----")) {
    return privateKeyRaw;
  }
  
  // Si no tiene el formato correcto, añade los encabezados y formatea
  return `-----BEGIN RSA PRIVATE KEY-----\n${privateKeyRaw}\n-----END RSA PRIVATE KEY-----`;
}

// Generar JWT con credenciales proporcionadas
function generateJWT(credentials) {
  // Procesar la clave privada para asegurar que está en formato correcto
  const privateKey = processPrivateKey(credentials.privateKeyRaw);
  
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hora de expiración
    iss: credentials.orgId,
    sub: credentials.technicalAccountId,
    aud: `${credentials.imsEndpoint}/c/${credentials.clientId}`,
    'https://ims-na1.adobelogin.com/s/ent_aem_cloud_api': true,
  };

  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: {
      'cache-control': 'no-cache',
      'content-type': 'application/x-www-form-urlencoded',
    },
  });
}

// Obtener access token usando las credenciales proporcionadas
async function getAccessToken(credentials) {
  try {
    const jwtToken = generateJWT(credentials);
    
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

// Resolvers para las consultas GraphQL
const resolvers = {
  Query: {
    getAccessToken: async (_, { credentials }) => {
      try {
        const accessToken = await getAccessToken(credentials);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora desde ahora
        return { token: accessToken, expiresAt };
      } catch (error) {
        console.error('Error en resolver getAccessToken:', error);
        throw new Error(`Error obteniendo token: ${error.message}`);
      }
    }
  }
};

// Crear y configurar el servidor Apollo
const server = new ApolloServer({
  typeDefs,
  resolvers,
  formatError: (err) => {
    console.error('Error GraphQL:', err);
    return {
      message: err.message,
      path: err.path
    };
  },
  context: ({ req }) => {
    return { req };
  }
});

// Puerto para el servidor
const PORT = process.env.PORT || 4000;

// Iniciar el servidor
server.listen(PORT).then(({ url }) => {
  console.log(`🚀 Servidor GraphQL listo en ${url}`);
});