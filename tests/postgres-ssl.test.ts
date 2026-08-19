import { describe, expect, it } from 'vitest';
import { getPostgresOptions } from '../db/postgres-ssl.js';

describe('PostgreSQL TLS options', () => {
  it('allows Render self-signed compatibility without changing generic TLS defaults', () => {
    const original = {
      pgSsl: process.env.PG_SSL,
      reject: process.env.PG_SSL_REJECT_UNAUTHORIZED,
      ca: process.env.PG_CA_CERT,
      caPath: process.env.PG_CA_CERT_PATH,
    };
    delete process.env.PG_SSL_REJECT_UNAUTHORIZED;
    delete process.env.PG_CA_CERT;
    delete process.env.PG_CA_CERT_PATH;
    try {
      process.env.PG_SSL = 'true';
      const render = getPostgresOptions('postgresql://user:pass@internal-host/db?sslmode=require');
      expect(render.ssl).toMatchObject({ rejectUnauthorized: false });
      expect(render.connectionString).not.toContain('sslmode');

      delete process.env.PG_SSL;
      const generic = getPostgresOptions('postgresql://user:pass@example.test/db?sslmode=require');
      expect(generic.ssl).toMatchObject({ rejectUnauthorized: true });
    } finally {
      if (original.pgSsl === undefined) delete process.env.PG_SSL; else process.env.PG_SSL = original.pgSsl;
      if (original.reject === undefined) delete process.env.PG_SSL_REJECT_UNAUTHORIZED; else process.env.PG_SSL_REJECT_UNAUTHORIZED = original.reject;
      if (original.ca === undefined) delete process.env.PG_CA_CERT; else process.env.PG_CA_CERT = original.ca;
      if (original.caPath === undefined) delete process.env.PG_CA_CERT_PATH; else process.env.PG_CA_CERT_PATH = original.caPath;
    }
  });

  it('lets explicit true or a CA bundle restore certificate verification', () => {
    const original = {
      pgSsl: process.env.PG_SSL,
      reject: process.env.PG_SSL_REJECT_UNAUTHORIZED,
      ca: process.env.PG_CA_CERT,
    };
    try {
      process.env.PG_SSL = 'true';
      process.env.PG_SSL_REJECT_UNAUTHORIZED = 'true';
      delete process.env.PG_CA_CERT;
      expect(getPostgresOptions('postgresql://user:pass@internal-host/db?sslmode=require').ssl).toMatchObject({ rejectUnauthorized: true });

      delete process.env.PG_SSL_REJECT_UNAUTHORIZED;
      process.env.PG_CA_CERT = '-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----';
      expect(getPostgresOptions('postgresql://user:pass@internal-host/db?sslmode=require').ssl).toMatchObject({ rejectUnauthorized: true, ca: process.env.PG_CA_CERT });
    } finally {
      if (original.pgSsl === undefined) delete process.env.PG_SSL; else process.env.PG_SSL = original.pgSsl;
      if (original.reject === undefined) delete process.env.PG_SSL_REJECT_UNAUTHORIZED; else process.env.PG_SSL_REJECT_UNAUTHORIZED = original.reject;
      if (original.ca === undefined) delete process.env.PG_CA_CERT; else process.env.PG_CA_CERT = original.ca;
    }
  });
});
