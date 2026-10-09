import { Body, Controller, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { IsString } from 'class-validator';
import request from 'supertest';
import { configureApp } from './setup-app.js';

class EchoDto {
  @IsString()
  name!: string;
}

@Controller('echo')
class EchoController {
  @Post()
  echo(@Body() body: EchoDto): EchoDto {
    return body;
  }
}

describe('configureApp', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [EchoController] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a valid body', async () => {
    await request(app.getHttpServer()).post('/echo').send({ name: 'a' }).expect(201);
  });

  it('rejects a body with an unknown field', async () => {
    await request(app.getHttpServer()).post('/echo').send({ name: 'a', role: 'admin' }).expect(400);
  });

  it('rejects an invalid field type', async () => {
    await request(app.getHttpServer()).post('/echo').send({ name: 1 }).expect(400);
  });

  it('sets security headers', async () => {
    const response = await request(app.getHttpServer()).post('/echo').send({ name: 'a' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
