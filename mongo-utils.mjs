import { Upload } from '@aws-sdk/lib-storage'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { spawn } from 'child_process'
import { PassThrough } from 'stream'
import { chmodSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { region } from './utils.mjs'

const s3 = new S3Client({ region })
const bucketName = process.env.BUCKET_NAME
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Spawn mongodump to backup the database
 */
export async function performBackup(uri, key) {
	const mongodumpPath = path.join(__dirname, 'mongodump')
	if (!existsSync(mongodumpPath)) {
		throw new Error('mongodump binary not found:', mongodumpPath)
	}

	try {
		chmodSync(mongodumpPath, '755')
	} catch (e) {}

	const passThrough = new PassThrough()

	const mongodump = spawn(mongodumpPath, [
		`--uri="${uri}"`,
		'--archive',
		'--gzip',
	])

	// Pipe the binary output from --archive to s3
	mongodump.stdout.pipe(passThrough)

	// log the output
	mongodump.stderr.on('data', (data) => {
		if (!data.toString().includes('done dumping')) return
		console.log(`[mongodump]: ${data.toString().trim()}`)
	})
	mongodump.on('error', (err) => {
		console.error('[mongodump] spawn error:', err)
	})

	const upload = new Upload({
		client: s3,
		params: {
			Bucket: bucketName,
			Key: key,
			Body: passThrough,
		},
	})

	upload.on('httpUploadProgress', (progress) => {
		const mb = (progress.loaded / 1024 / 1024).toFixed(2)
		console.log(`[s3 upload]: ${mb} MB uploaded`)
	})

	await upload.done()
}

/**
 * Spawn mongorestore to restore the database
 */
export async function performRestore(uri, key) {
	const mongorestorePath = path.join(__dirname, 'mongorestore')
	if (!existsSync(mongorestorePath)) {
		throw new Error('mongorestore binary not found:', mongorestorePath)
	}

	try {
		chmodSync(mongorestorePath, '755')
	} catch (e) {}

	const response = await s3.send(
		new GetObjectCommand({
			Bucket: bucketName,
			Key: key,
		}),
	)

	if (!response || response.$metadata.httpStatusCode === 404)
		throw new Error('DeploymentId: ' + deploymentId + ' had not been backed up')

	const mongorestore = spawn(mongorestorePath, [
		`--uri="${uri}"`,
		'--archive',
		'--gzip',
		'--drop',
	])
	// pipe the s3 input to mongorestore
	response.Body.pipe(mongorestore.stdin)
	mongorestore.stderr.on('data', (data) => {
		console.log(`[mongorestore]: ${data.toString().trim()}`)
	})
	mongorestore.on('error', (err) => {
		console.error('[mongorestore] spawn error:', err)
	})

	return new Promise((resolve, reject) => {
		mongorestore.on('close', (code) => {
			code === 0
				? resolve()
				: reject(new Error(`mongorestore failed with code: ${code}`))
		})
	})
}
