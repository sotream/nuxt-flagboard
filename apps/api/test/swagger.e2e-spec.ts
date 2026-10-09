import { setupSwagger } from '../src/setup-swagger.js';
import { createTestApp } from './helpers/test-app.js';

describe('OpenAPI documentation', () => {
  it('documents the public API only, with the API key security scheme', async () => {
    const mounted: boolean[] = [];
    const t = await createTestApp({ configure: (app) => mounted.push(setupSwagger(app, 'dev')) });
    try {
      expect(mounted).toEqual([true]);
      const { body } = await t.http.get('/docs-json').expect(200);

      expect(Object.keys(body.paths).sort()).toEqual(['/v1/evaluate', '/v1/snapshot']);
      expect(body.components.securitySchemes['api-key']).toMatchObject({
        type: 'http',
        scheme: 'bearer',
      });
      expect(JSON.stringify(body)).not.toMatch(/password|refresh|\/api\/v1/);
      expect(body.paths['/v1/snapshot'].get.responses).toHaveProperty('403');
      await t.http.get('/docs').expect(200);
    } finally {
      await t.close();
    }
  });

  it('is not mounted in production', async () => {
    const mounted: boolean[] = [];
    const t = await createTestApp({ configure: (app) => mounted.push(setupSwagger(app, 'prod')) });
    try {
      expect(mounted).toEqual([false]);
      await t.http.get('/docs-json').expect(404);
      await t.http.get('/docs').expect(404);
    } finally {
      await t.close();
    }
  });
});
