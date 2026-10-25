import { createRequire } from "node:module";
const require = createRequire(
  new URL("../apps/backend/package.json", import.meta.url),
);
const {
  S3Client,
  ListBucketsCommand,
  CreateBucketCommand,
  PutBucketCorsCommand,
} = require("@aws-sdk/client-s3");
if (
  process.env.DEMO_SEED !== "true" ||
  process.env.S3_ENDPOINT !== "http://rustfs:9000"
)
  throw new Error("This command is restricted to the isolated Docker demo.");
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  maxAttempts: 1,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await client.send(new ListBucketsCommand({}));
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  if (!ready) throw new Error("Demo storage did not become ready.");
  for (const Bucket of ["supastore-public", "supastore-private"]) {
    try {
      await client.send(new CreateBucketCommand({ Bucket }));
    } catch (error) {
      if (
        !["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(error.name)
      )
        throw error;
    }
    await client.send(
      new PutBucketCorsCommand({
        Bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [process.env.STOREFRONT_ORIGIN],
              AllowedMethods: ["GET", "PUT", "HEAD"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag"],
            },
          ],
        },
      }),
    );
  }
  console.log("Demo storage buckets and restricted browser CORS are ready.");
} finally {
  client.destroy();
}
