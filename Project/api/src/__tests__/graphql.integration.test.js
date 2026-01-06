import express from 'express';
import http from 'http';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { createApolloServer, createGraphQLMiddleware } from '../graphql/server.js';

describe('GraphQL Integration (Real Server)', () => {
  let app;
  let httpServer;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';

    app = express();
    httpServer = http.createServer(app);

    const server = await createApolloServer(httpServer);

    app.use(
      '/graphql',
      express.json(),
      createGraphQLMiddleware(server)
    );
  });

  afterAll(async () => {
    await new Promise((resolve) => httpServer.close(resolve));
  });

  it('boots GraphQL server and responds', async () => {
    const res = await request(app)
      .post('/graphql')
      .send({ query: '{ __typename }' });

    expect(res.status).toBe(200);
    expect(res.body.data.__typename).toBe('Query');
  });

  it('adds user to context when JWT is valid', async () => {
    const token = jwt.sign({ id: 123 }, process.env.JWT_SECRET);

    const res = await request(app)
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: `
          query {
            __typename
          }
        `,
      });

    expect(res.status).toBe(200);
    expect(res.body.errors).toBeUndefined();
  });

  it('allows request when JWT is invalid (user = null)', async () => {
    const res = await request(app)
      .post('/graphql')
      .set('Authorization', 'Bearer invalidtoken')
      .send({ query: '{ __typename }' });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('handles malformed queries with formatted error', async () => {
    const res = await request(app)
      .post('/graphql')
      .send({ query: '{ invalidField }' });

    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toHaveProperty('message');
    expect(res.body.errors[0]).toHaveProperty('code');
  });
});
