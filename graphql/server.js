import { ApolloServer} from 'apollo-server';
import { typeDefs, resolvers } from './schema.js';

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

// 🚀 Iniciar el servidor
server.listen().then(({ url }) => {
  console.log(`🚀 Servidor corriendo en: ${url}`);
});
