import { S3Client } from "@aws-sdk/client-s3";

import { loadEnv } from "../../config/env.js";

const env = loadEnv();

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

export const s3Buckets = {
  images: env.S3_BUCKET_IMAGES,
  exports: env.S3_BUCKET_EXPORTS,
} as const;
