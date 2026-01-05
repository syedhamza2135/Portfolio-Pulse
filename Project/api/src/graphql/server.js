import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@apollo/server/express4';
import jwt from 'jsonwebtoken';
import typeDefs from './schema.js';
import resolvers from './resolvers/index.js';
import { createLoaders } from './dataLoaders.js';

export async function createApolloServer(httpServer) {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    formatError: (error) => {
      console.error('GraphQL Error:', error);
      
      if (process.env.NODE_ENV === 'production') {
        return {
          message: error.message,
          code: error.extensions?.code || 'INTERNAL_SERVER_ERROR',
        };
      }
      
      return error;
    },
  });

  await server.start();
  
  return server;
}

export function createGraphQLMiddleware(server) {
  return expressMiddleware(server, {
    context: async ({ req }) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      let user = null;
      
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          user = decoded;
        } catch (err) {
          console.error('Invalid token in GraphQL context:', err.message);
        }
      }
      
      return { 
        user,
        loaders: createLoaders()
      };
    },
  });
}