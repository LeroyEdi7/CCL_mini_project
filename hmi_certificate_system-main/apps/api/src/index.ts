import { serve } from '@hono/node-server'
import { S3Client } from '@aws-sdk/client-s3'
import { authConfig, certificateConfig } from './config/auth-config.js'
import { db } from './db/index.js'
import { createApp } from './app.js'
import { DrizzleAuthRepository } from './repositories/auth/drizzle-auth-repository.js'
import { DevelopmentConsoleEmailProvider, DisabledEmailProvider } from './services/auth/email-provider.js'
import { LocalAuthProvider } from './services/auth/local-auth-provider.js'
import { DrizzleEventRepository } from './repositories/events/drizzle-event-repository.js'
import { EventService } from './services/events/event-service.js'
import { DrizzleParticipantRepository } from './repositories/participants/drizzle-participant-repository.js'
import { ParticipantService } from './services/participants/participant-service.js'
import { DrizzleCertificateRepository } from './repositories/certificates/drizzle-certificate-repository.js'
import { CertificateService } from './services/certificates/certificate-service.js'
import { S3CertificateStorage } from './services/certificates/certificate-storage.js'

const emailProvider = authConfig.devEmailEnabled
  ? new DevelopmentConsoleEmailProvider()
  : new DisabledEmailProvider()
const authProvider = new LocalAuthProvider(new DrizzleAuthRepository(db), emailProvider, {
  sessionTtlSeconds: authConfig.sessionTtlSeconds,
  verificationTtlSeconds: authConfig.verificationTtlSeconds,
  passwordResetTtlSeconds: authConfig.passwordResetTtlSeconds,
  appBaseUrl: authConfig.appBaseUrl,
})

const certificateStorage = certificateConfig.awsRegion && certificateConfig.bucket
  ? new S3CertificateStorage(
      new S3Client({
        region: certificateConfig.awsRegion,
        ...(certificateConfig.s3Endpoint ? { endpoint: certificateConfig.s3Endpoint, forcePathStyle: true } : {}),
      }),
      certificateConfig.bucket,
      certificateConfig.s3Endpoint ? undefined : 'AES256',
    )
  : undefined

const app = createApp(
  authProvider,
  authConfig,
  new EventService(new DrizzleEventRepository(db)),
  new ParticipantService(new DrizzleParticipantRepository(db)),
  new CertificateService(new DrizzleCertificateRepository(db), certificateStorage, certificateConfig.publicVerifyBaseUrl),
)

serve({ fetch: app.fetch, port: authConfig.port }, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
