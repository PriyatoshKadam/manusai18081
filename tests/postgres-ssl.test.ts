import { describe, expect, it } from 'vitest';
import { getPostgresOptions } from '../db/postgres-ssl.js';

describe('PostgreSQL TLS options', () => {
  it('verifies Render TLS by default and only allows insecure TLS in development opt-in', () => {
    const original = {
      pgSsl: process.env.PG_SSL,
      reject: process.env.PG_SSL_REJECT_UNAUTHORIZED,
      allow: process.env.ALLOW_INSECURE_DB_TLS,
      renderAllow: process.env.ALLOW_RENDER_SELF_SIGNED_TLS,
      nodeEnv: process.env.NODE_ENV,
      ca: process.env.PG_CA_CERT,
      caPath: process.env.PG_CA_CERT_PATH,
    };
    delete process.env.PG_CA_CERT;
    delete process.env.PG_CA_CERT_PATH;
    try {
      process.env.PG_SSL = 'true';
      process.env.NODE_ENV = 'production';
      process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
      delete process.env.ALLOW_INSECURE_DB_TLS;
      delete process.env.ALLOW_RENDER_SELF_SIGNED_TLS;
      const generic = getPostgresOptions('postgresql://user:pass@internal-host/db?sslmode=require');
      expect(generic.ssl).toMatchObject({ rejectUnauthorized: true });
      process.env.ALLOW_RENDER_SELF_SIGNED_TLS = 'true';
      const render = getPostgresOptions('postgresql://user:pass@database.render.com/db?sslmode=require');
      expect(render.ssl).toMatchObject({ rejectUnauthorized: false });
      expect(render.connectionString).not.toContain('sslmode');

      process.env.NODE_ENV = 'development';
      process.env.ALLOW_INSECURE_DB_TLS = 'true';
      expect(getPostgresOptions('postgresql://user:pass@internal-host/db?sslmode=require').ssl).toMatchObject({ rejectUnauthorized: false });
    } finally {
      if (original.pgSsl === undefined) delete process.env.PG_SSL; else process.env.PG_SSL = original.pgSsl;
      if (original.reject === undefined) delete process.env.PG_SSL_REJECT_UNAUTHORIZED; else process.env.PG_SSL_REJECT_UNAUTHORIZED = original.reject;
      if (original.allow === undefined) delete process.env.ALLOW_INSECURE_DB_TLS; else process.env.ALLOW_INSECURE_DB_TLS = original.allow;
      if (original.renderAllow === undefined) delete process.env.ALLOW_RENDER_SELF_SIGNED_TLS; else process.env.ALLOW_RENDER_SELF_SIGNED_TLS = original.renderAllow;
      if (original.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original.nodeEnv;
      if (original.ca === undefined) delete process.env.PG_CA_CERT; else process.env.PG_CA_CERT = original.ca;
      if (original.caPath === undefined) delete process.env.PG_CA_CERT_PATH; else process.env.PG_CA_CERT_PATH = original.caPath;
    }
  });

  it('uses TLS for Supabase direct and pooler hosts by default', () => {
    const original = {
      pgSsl: process.env.PG_SSL,
      reject: process.env.PG_SSL_REJECT_UNAUTHORIZED,
      nodeEnv: process.env.NODE_ENV,
      renderAllow: process.env.ALLOW_RENDER_SELF_SIGNED_TLS,
      devAllow: process.env.ALLOW_INSECURE_DB_TLS,
    };
    try {
      delete process.env.PG_SSL;
      delete process.env.PG_SSL_REJECT_UNAUTHORIZED;
      delete process.env.ALLOW_RENDER_SELF_SIGNED_TLS;
      delete process.env.ALLOW_INSECURE_DB_TLS;
      process.env.NODE_ENV = 'production';
      const direct = getPostgresOptions('postgresql://user:pass@db.project-ref.supabase.co/postgres?sslmode=require');
      const pooler = getPostgresOptions('postgresql://user.project-ref:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres');
      expect(direct.ssl).toMatchObject({ rejectUnauthorized: true });
      expect(pooler.ssl).toMatchObject({ rejectUnauthorized: true });
      expect(pooler.connectionString).not.toContain('sslmode');
    } finally {
      if (original.pgSsl === undefined) delete process.env.PG_SSL; else process.env.PG_SSL = original.pgSsl;
      if (original.reject === undefined) delete process.env.PG_SSL_REJECT_UNAUTHORIZED; else process.env.PG_SSL_REJECT_UNAUTHORIZED = original.reject;
      if (original.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original.nodeEnv;
      if (original.renderAllow === undefined) delete process.env.ALLOW_RENDER_SELF_SIGNED_TLS; else process.env.ALLOW_RENDER_SELF_SIGNED_TLS = original.renderAllow;
      if (original.devAllow === undefined) delete process.env.ALLOW_INSECURE_DB_TLS; else process.env.ALLOW_INSECURE_DB_TLS = original.devAllow;
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
