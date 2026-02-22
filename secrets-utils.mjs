import {
	SecretsManagerClient,
	GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
import { region } from './utils.mjs'

const secrets = new SecretsManagerClient({ region })

/**
 * @returns the mongodb connection string, or null if unavailable
 */
export async function getMongoUri() {
	try {
		const response = await secrets.send(
			new GetSecretValueCommand({ SecretId: process.env.MONGO_URI_SECRET_ID }),
		)

		const secret = JSON.parse(response.SecretString)
		return secret?.mongo_uri
	} catch {
		return null
	}
}
