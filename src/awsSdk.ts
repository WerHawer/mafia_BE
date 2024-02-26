import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config()

const bucketName = process.env.AWS_BUCKET_NAME || 'avatars'
const accessKeyId = process.env.AWS_ACCESS_KEY
const secretAccessKey = process.env.AWS_SECRET
const region = process.env.AWS_REGION || 'eu-north-1'

const s3 = new S3Client({
  region,
  credentials: { accessKeyId, secretAccessKey },
})

const linkGenerator = (key: string) =>
  `https://${bucketName}.s3.${region}.amazonaws.com/${key}`

export const deleteFileFromAWS = async (key: string) => {
  const params = {
    Bucket: bucketName,
    Key: key,
  }

  try {
    await s3.send(new DeleteObjectCommand(params))
    console.log(`Avatar ${key} deleted from AWS`)
  } catch (err) {
    console.log('Error', err)
  }
}

export const uploadFileToAWS = async (file: string, key: string) => {
  const fileStream = fs.createReadStream(file)

  const params = {
    Bucket: bucketName,
    Key: key,
    Body: fileStream,
  }

  try {
    await s3.send(new PutObjectCommand(params))
    console.log(`Avatar ${key} uploaded to AWS`)

    return linkGenerator(key)
  } catch (err) {
    console.log('Error', err)
  }
}
