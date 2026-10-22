import assert from 'node:assert/strict'
import test from 'node:test'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { S3CertificateStorage } from '../src/services/certificates/certificate-storage.js'

function captureS3Client() {
  const commands: unknown[] = []
  const client = {
    send: async (command: unknown) => { commands.push(command); return {} },
  } as unknown as S3Client
  return { client, commands }
}

test('S3-compatible storage can omit AWS-only server-side encryption headers', async () => {
  const { client, commands } = captureS3Client()
  const storage = new S3CertificateStorage(client, 'certificates', undefined)

  await storage.put('certificate-pdfs/example.pdf', new Uint8Array([1]), 'application/pdf')

  const command = commands[0] as PutObjectCommand
  assert.equal(command.input.Bucket, 'certificates')
  assert.equal(command.input.ServerSideEncryption, undefined)
})

test('AWS S3 storage retains SSE-S3 by default', async () => {
  const { client, commands } = captureS3Client()
  const storage = new S3CertificateStorage(client, 'certificates', 'AES256')

  await storage.put('certificate-pdfs/example.pdf', new Uint8Array([1]), 'application/pdf')

  const command = commands[0] as PutObjectCommand
  assert.equal(command.input.ServerSideEncryption, 'AES256')
})
