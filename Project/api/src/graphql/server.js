/**
 * GraphQL Server Configuration
 * 
 * Sets up Apollo GraphQL server with:
 * - Query complexity limits (prevents expensive queries)
 * - Query depth limits (prevents deeply nested queries)
 * - Error formatting (hides stack traces in production)
 * - HTTP server draining (graceful shutdown)
 * - JWT authentication context
 * - DataLoader integration (N+1 query prevention)
 * 
 * @module graphql/server
 * @requires @apollo/server
 * @requires graphql-validation-complexity
 * @requires graphql-depth-limit
 */

import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { expressMiddleware } from "@as-integrations/express4";
import { createComplexityLimitRule } from "graphql-validation-complexity";
import jwt from "jsonwebtoken";
import depthLimit from "graphql-depth-limit";
import typeDefs from "./schema.js";
import resolvers from "./resolvers/index.js";
import { createLoaders } from "./dataLoaders.js";

/**
 * Creates and configures Apollo GraphQL server
 * 
 * Security Features:
 * - Query complexity limit: 1000 (prevents expensive queries)
 * - Query depth limit: 5 levels (prevents deeply nested queries)
 * - Error sanitization: Hides stack traces in production
 * 
 * Performance Features:
 * - DataLoader integration: Prevents N+1 query problems
 * - HTTP server draining: Ensures graceful shutdown
 * 
 * @async
 * @function createApolloServer
 * @param {import('http').Server} httpServer - HTTP server instance
 * 
 * @returns {Promise<ApolloServer>} Configured Apollo Server instance
 */
export async function createApolloServer(httpServer) {
  const server = new ApolloServer({
    typeDefs,      // GraphQL schema definitions
    resolvers,     // GraphQL resolvers
    
    // Plugin: Drains HTTP server on shutdown for graceful termination
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    
    // Validation rules: Prevent expensive or malicious queries
    validationRules: [
      // Query complexity limit: Prevents expensive queries
      // Cost calculation:
      // - Scalar fields: 1 point each
      // - Object fields: 5 points each
      // - List fields: 10 points per item
      // - Introspection queries: 0.1 points (reduced cost)
      createComplexityLimitRule(1000, {
        scalarCost: 1,
        objectCost: 5,
        listFactor: 10,
        introspectionListFactor: 0.1,  // Reduce cost for introspection
        onCost: (cost) => {
          // Log expensive queries for monitoring
          if (cost > 100) {
            console.log(`[GraphQL] Query cost: ${cost}`);
          }
        },
      }),
      // Query depth limit: Prevents deeply nested queries (DoS protection)
      depthLimit(5),  // Maximum 5 levels of nesting
    ],
    
    // Error formatting: Sanitizes errors for production
    formatError: (error) => {
      const isProd = process.env.NODE_ENV === "production";
      
      // Log error for debugging
      console.error("GraphQL Error:", {
        message: error.message,
        path: error.path,
        code: error.extensions?.code,
      });

      // Return sanitized error
      // In production: Hide stack traces for security
      // In development: Show stack traces for debugging
      return {
        message: error.message,
        code: error.extensions?.code || "INTERNAL_SERVER_ERROR",
        ...(isProd ? {} : { stack: error.extensions?.stacktrace }),
      };
    },
  });

  await server.start();
  return server;
}

/**
 * Creates Express middleware for GraphQL endpoint
 * 
 * Sets up GraphQL context with:
 * - User authentication (from JWT token)
 * - DataLoaders (for N+1 query prevention)
 * - Client IP address (for logging/rate limiting)
 * 
 * @function createGraphQLMiddleware
 * @param {ApolloServer} server - Apollo Server instance
 * 
 * @returns {Function} Express middleware function
 */
export function createGraphQLMiddleware(server) {
  return expressMiddleware(server, {
    // Context function: Runs for every GraphQL request
    context: async ({ req }) => {
      // Extract JWT token from Authorization header
      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.substring(7)
        : null;
      let user = null;

      // Verify JWT token if provided
      if (token) {
        try {
          user = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
          // Invalid or expired token - user remains null
          // Resolvers should check user and return appropriate errors
          console.warn(`Auth failed: ${err.message}`);
        }
      }

      // Create DataLoaders for this request
      // DataLoaders batch and cache database queries to prevent N+1 problems
      const loaders = createLoaders();

      // Validate DataLoaders were created correctly
      if (!loaders.holdingsByPortfolio || !loaders.riskMetricsByPortfolio) {
        console.error("CRITICAL: DataLoaders not initialized properly");
        throw new Error("Internal server error");
      }

      // Return context object (available in all resolvers)
      return {
        user,        // Authenticated user (null if not authenticated)
        loaders,     // DataLoader instances for batching queries
        ip: req.ip,  // Client IP address (for logging/rate limiting)
      };
    },
  });
}