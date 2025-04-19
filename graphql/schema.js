import axios from 'axios';
import { generateJWT } from './functions.js';
import { gql } from 'apollo-server';
import { ensureValidToken } from './functions.js';

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
  scalar JSON

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

  type AssetHit {
    path: String
    excerpt: String
    name: String
    title: String
    lastModified: String
  }

  type AssetSearchResult {
    success: Boolean
    results: Int
    total: Int
    more: Boolean
    offset: Int
    hits: [AssetHit]
  }

  type Mutation {
    createConnection(input: CredentialsInput!): ConnectionResponse
    createFolder(nombre: String!, title: String!, description: String!, direction: String!): String
    deleteAssetWithMetadata(property: String!, value: String!): String
}

  type Query {
    searchAssetsWithMetadata(property: String!, value: String!): AssetSearchResult
    getMetadataInAssets(path: String): JSON
  }
`;


export const resolvers = {
    Query: {
        async searchAssetsWithMetadata(_, { property, value }) {
            await ensureValidToken(session);
            if (!session.accessToken || Date.now() > session.expiresAt) {
                throw new Error('Sesión expirada o no autenticada. Ejecuta createConnection primero.');
            }
            try {
                const searchUrl = `${session.instanciaAem}/bin/querybuilder.json?path=/content/dam&type=dam:Asset&property=${property}&property.value=${value}&p.limit=-1`;
                const response = await axios.get(searchUrl, {
                    headers: {
                        Authorization: `Bearer ${session.accessToken}`,
                        'x-api-key': session.clientId
                    }
                });
                console.log('Assets encontrados:', response.data);
                // GraphQL solo devolverá los campos definidos en el tipo AssetSearchResult
                return response.data;
            } catch (error) {
                console.error('Error al buscar el metadato:', error.response?.data || error.message);
                throw error;
            }
        },
        async getMetadataInAssets(_, {path}){
            await ensureValidToken(session);
            if (!session.accessToken || Date.now() > session.expiresAt) {
                throw new Error('Sesión expirada o no autenticada. Ejecuta createConnection primero.');
            }
            try {
                const url = `${session.instanciaAem}/content/dam/${path}.infinity.json`;
                const response = await axios.get(url, {
                    headers: {
                        Authorization: `Bearer ${session.accessToken}`
                    },
                });
                console.log('Assets en la ruta:', path, '\n', response.data);
                return response.data;
            } catch (error) {
                if(error.response?.status === 404){
                    console.log('Ruta no encontrada:', path);
                    return;
                }
            }
            
        }
    },
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
            await ensureValidToken(session);
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
        },
        async deleteAssetWithMetadata(_, { property, value }) {
            await ensureValidToken(session);
            if (!session.accessToken || Date.now() > session.expiresAt) {
                throw new Error('Sesión expirada o no autenticada. Ejecuta createConnection primero.');
            }
            try {
                // 1. Buscar assets
                const searchUrl = `${session.instanciaAem}/bin/querybuilder.json?path=/content/dam&type=dam:Asset&property=${property}&property.value=${value}&p.limit=-1`;
                const response = await axios.get(searchUrl, {
                    headers: {
                        Authorization: `Bearer ${session.accessToken}`,
                        'x-api-key': session.clientId
                    }
                });

                const hits = response.data.hits || [];
                if (hits.length === 0) {
                    return "No se encontraron assets para eliminar";
                }

                // 2. Eliminar cada asset encontrado
                let deleted = [];
                let failed = [];
                for (const asset of hits) {
                    try {
                        const assetPath = asset.path;
                        const deleteUrl = `${session.instanciaAem}${assetPath}`;
                        await axios.delete(deleteUrl, {
                            headers: {
                                Authorization: `Bearer ${session.accessToken}`,
                                'x-api-key': session.clientId
                            }
                        });
                        deleted.push(asset.name || assetPath);
                    } catch (err) {
                        failed.push(asset.name || asset.path);
                    }
                }

                let msg = `Eliminados: ${deleted.length}`;
                if (deleted.length > 0) msg += ` [${deleted.join(', ')}]`;
                if (failed.length > 0) msg += ` | Errores: ${failed.length} [${failed.join(', ')}]`;
                return msg;
            } catch (error) {
                // Solo retorna el mensaje, no el objeto de error completo
                throw new Error('Error al eliminar asset: ' + (error.response?.data || error.message));
            }
        }
    },
}


