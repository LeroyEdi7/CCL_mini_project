import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

export type StoredCertificatePdf = { bytes: Uint8Array; contentType: string }

export interface CertificateStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<StoredCertificatePdf>
  delete(key: string): Promise<void>
}

export class StorageObjectNotFoundError extends Error {
  constructor() { super('Storage object not found'); this.name = 'StorageObjectNotFoundError' }
}

/** Uses the AWS SDK default credential chain; EC2 deployments should attach an instance role. */
export class S3CertificateStorage implements CertificateStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly serverSideEncryption?: 'AES256',
  ) {}

  async put(key: string, bytes: Uint8Array, contentType: string) {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      ...(this.serverSideEncryption ? { ServerSideEncryption: this.serverSideEncryption } : {}),
    }))
  }

  async get(key: string): Promise<StoredCertificatePdf> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      if (!result.Body) throw new StorageObjectNotFoundError()
      return { bytes: await result.Body.transformToByteArray(), contentType: result.ContentType ?? 'application/pdf' }
    } catch (error) {
      if (isMissingObject(error)) throw new StorageObjectNotFoundError()
      throw error
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}

function isMissingObject(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  return value.name === 'NoSuchKey' || value.name === 'NotFound' || value.$metadata?.httpStatusCode === 404
}
