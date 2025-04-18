import axios from 'axios';
import { generateJWT } from './functions.js';
import { gql } from 'apollo-server';


// Sesión simulada
let session = {
    accessToken: null,
    expiresAt: null,
    clientId: null,
    clientSecret: null,
    technicalAccountId: null,
    orgId: null,
    privateKeyRaw: null,
    imsEndpoint: null,
    instanciaAem: null,
};

export const typeDefs = gql`
  input CredentialsInput {
    clientId: String!
    clientSecret: String!
    technicalAccountId: String!
    orgId: String!
    privateKeyRaw: String!
    imsEndpoint: String!
    instanciaAem: String!
  }

  type ConnectionResponse {
    token: String
    message: String
  }


  type Mutation {
    createConnection(input: CredentialsInput!): ConnectionResponse
    createFolder(nombre: String!, title: String!, description: String!, direction: String!): String
}


  type Query {
    _empty: String
  }
`;

async function ensureValidToken() {
    if (session.accessToken && Date.now() < session.expiresAt) {
        return; // Token válido
    }

    // Verificar que existan los datos en sesión
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

export const resolvers = {
    Mutation: {
        async createConnection(_, { input }) {
            try {
                const {
                    clientId,
                    clientSecret,
                    technicalAccountId,
                    orgId,
                    privateKeyRaw,
                    imsEndpoint,
                    instanciaAem,
                } = input;

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
                // Guardamos TODO en sesión
                session = {
                    accessToken: response.data.access_token,
                    expiresAt: Date.now() + 60 * 60 * 1000,
                    clientId,
                    clientSecret,
                    technicalAccountId,
                    orgId,
                    privateKeyRaw,
                    imsEndpoint,
                    instanciaAem,
                };

                return {
                    token: response.data.access_token,
                    message: 'Access token generado exitosamente',
                };
            } catch (error) {
                console.error('Error al generar el token:', error.response?.data || error.message);
                return {
                    token: null,
                    message: 'Error al generar el token: ' + (error.response?.data?.error_description || error.message),
                };
            }
        },
        async createFolder(_, { nombre, title, description, direction }) {
            await ensureValidToken();
            if (!session.accessToken || Date.now() > session.expiresAt) {
                throw new Error('Sesión expirada o no autenticada. Ejecuta createConnection primero.');
            }

            try {
                const aemURL = `${session.instanciaAem}/api/assets/${direction}/*`;

                const response = await axios.post(
                    aemURL,
                    {
                        class: 'assetFolder',
                        properties: {
                            name: nombre,
                            'dc:title': title,
                            'dc:description': description,
                        },
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${session.accessToken}`,
                            'x-api-key': session.clientId,
                        },
                    }
                );

                return `Carpeta creada exitosamente: ${nombre}`;
            } catch (error) {
                const props = error.response?.data?.properties;
                const statusMessage = props?.['status.message'] || '';

                if (error.response?.status === 409 && statusMessage.includes('already exist')) {
                    throw new Error('Carpeta ya existente');
                }

                if (error.response?.status === 409 && statusMessage.includes('parent does not exist')) {
                    throw new Error('Ruta no encontrada');
                }

                console.error('Error desconocido:', error.response?.data || error.message);
                throw new Error('Error al crear carpeta');
            }
        }
    },
}


