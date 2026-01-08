import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express4';
import { createComplexityLimitRule } from 'graphql-validation-complexity';
import jwt from 'jsonwebtoken';
import typeDefs from './schema.js';
import resolvers from './resolvers/index.js';
import { createLoaders } from './dataLoaders.js';

export async function createApolloServer(httpServer) {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    validationRules: [
      createComplexityLimitRule(1000, {
        onCost: (cost) => {
          if (cost > 500 || process.env.NODE_ENV === 'development') {
            console.log(`[GraphQL] Query cost: ${cost}`);
          }
        }
      })
    ],
    formatError: (error) => {
      const isProd = process.env.NODE_ENV === 'production';
      console.error('GraphQL Error:', {
        message: error.message,
        path: error.path,
        code: error.extensions?.code
      });

      return {
        message: error.message,
        code: error.extensions?.code || 'INTERNAL_SERVER_ERROR',
        ...(isProd ? {} : { stack: error.extensions?.stacktrace })
      };
    },
  });

  await server.start();
  return server;
}

export function createGraphQLMiddleware(server) {
  return expressMiddleware(server, {
    context: async ({ req }) => {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
      let user = null;

      if (token) {
        try {
          user = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
          console.warn(`Auth failed: ${err.message}`);
        }
      }

      return { 
        user,
        loaders: createLoaders(),
        ip: req.ip 
      };
    },
  });
}