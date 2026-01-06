import { jest } from '@jest/globals';

/* ---------------- ESM MODULE MOCKS ---------------- */
const ApolloServerMock = jest.fn();
const expressMiddlewareMock = jest.fn();
const drainPluginMock = jest.fn();
const complexityRuleMock = jest.fn();

jest.unstable_mockModule('@apollo/server', () => ({
  ApolloServer: ApolloServerMock,
}));

jest.unstable_mockModule('@apollo/server/plugin/drainHttpServer', () => ({
  ApolloServerPluginDrainHttpServer: drainPluginMock,
}));

jest.unstable_mockModule('@apollo/server/express4', () => ({
  expressMiddleware: expressMiddlewareMock,
}));

jest.unstable_mockModule('graphql-validation-complexity', () => ({
  createComplexityLimitRule: complexityRuleMock,
}));

jest.unstable_mockModule('../graphql/schema.js', () => ({
  default: 'TYPE_DEFS',
}));

jest.unstable_mockModule('../graphql/resolvers/index.js', () => ({
  default: 'RESOLVERS',
}));

jest.unstable_mockModule('../graphql/dataLoaders.js', () => ({
  createLoaders: jest.fn(() => ({ loader: true })),
}));

/* ---------------- IMPORT AFTER MOCKS ---------------- */
const jwt = await import('jsonwebtoken');
const {
  createApolloServer,
  createGraphQLMiddleware,
} = await import('../graphql/server.js');

/* ---------------- TESTS ---------------- */
describe('GraphQL Server', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    ApolloServerMock.mockImplementation((config) => ({
      config,
      start: jest.fn().mockResolvedValue(true),
      assertStarted: jest.fn(),
    }));

    drainPluginMock.mockReturnValue('DRAIN_PLUGIN');
    complexityRuleMock.mockReturnValue('COMPLEXITY_RULE');

    expressMiddlewareMock.mockImplementation((server, options) => ({
      server,
      options,
    }));
  });

  describe('createApolloServer', () => {
    it('creates and starts ApolloServer', async () => {
      const httpServer = { on: jest.fn() };

      const server = await createApolloServer(httpServer);

      expect(ApolloServerMock).toHaveBeenCalledTimes(1);
      expect(server.start).toHaveBeenCalledTimes(1);

      const config = ApolloServerMock.mock.calls[0][0];

      expect(config).toMatchObject({
        typeDefs: 'TYPE_DEFS',
        resolvers: 'RESOLVERS',
        plugins: ['DRAIN_PLUGIN'],
        validationRules: ['COMPLEXITY_RULE'],
      });
    });

    it('hides stacktrace in production', async () => {
      process.env.NODE_ENV = 'production';

      const server = await createApolloServer({ on: jest.fn() });

      const result = server.config.formatError({
        message: 'Error',
        extensions: {
          code: 'BAD',
          stacktrace: ['trace'],
        },
      });

      expect(result).toEqual({
        message: 'Error',
        code: 'BAD',
      });
    });

    it('shows stacktrace in development', async () => {
      process.env.NODE_ENV = 'development';

      const server = await createApolloServer({ on: jest.fn() });

      const result = server.config.formatError({
        message: 'Dev error',
        extensions: {
          stacktrace: ['trace'],
        },
      });

      expect(result.stack).toBeDefined();
    });
  });

  describe('createGraphQLMiddleware', () => {
    it('sets user when JWT is valid', async () => {
      process.env.JWT_SECRET = 'secret';
      jest.spyOn(jwt.default, 'verify').mockReturnValue({ id: 1 });

      const middleware = createGraphQLMiddleware({ assertStarted: jest.fn() });

      const ctx = await middleware.options.context({
        req: {
          headers: { authorization: 'Bearer token' },
          ip: '127.0.0.1',
        },
      });

      expect(ctx.user).toEqual({ id: 1 });
      expect(ctx.loaders).toEqual({ loader: true });
      expect(ctx.ip).toBe('127.0.0.1');
    });

    it('sets user null when JWT invalid', async () => {
      jest.spyOn(jwt.default, 'verify').mockImplementation(() => {
        throw new Error('bad token');
      });

      const middleware = createGraphQLMiddleware({ assertStarted: jest.fn() });

      const ctx = await middleware.options.context({
        req: {
          headers: { authorization: 'Bearer bad' },
          ip: '127.0.0.1',
        },
      });

      expect(ctx.user).toBeNull();
    });

    it('sets user null when no token', async () => {
      const middleware = createGraphQLMiddleware({ assertStarted: jest.fn() });

      const ctx = await middleware.options.context({
        req: {
          headers: {},
          ip: '127.0.0.1',
        },
      });

      expect(ctx.user).toBeNull();
    });
  });
});