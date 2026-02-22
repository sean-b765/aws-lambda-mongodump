import { performBackup, performRestore } from './mongo-utils.mjs'
import {
	getApplicationName,
	resumeDeployment,
	stopDeployment,
} from './deploy-utils.mjs'
import { getMongoUri } from './secrets-utils.mjs'

/**
 * Entrypoint triggered by AWS CodeDeploy in BeforeInstall hook, or manual invocation
 */
export async function handler(e) {
	let applicationName = 'your-application'
	let backupId = new Date().toISOString()

	// If this param is given, it's most likely an AWS CodeDeploy deployment
	const lifecycleEventHookExecutionId = e?.LifecycleEventHookExecutionId
	if (lifecycleEventHookExecutionId) {
		backupId = e?.DeploymentId
		applicationName = (await getApplicationName(backupId)) ?? e?.ApplicationName
	} else {
		applicationName = e?.ApplicationName
	}

	if (!backupId) throw new TypeError('No DeploymentId provided')
	if (!applicationName) throw new TypeError('No ApplicationName provided')

	const key = `backups/${applicationName}/${backupId}.archive`
	const uri = await getMongoUri()
	if (!uri) throw new Error('No valid Mongo URI found.')

	console.log(`Using backup key: "${key}"`)

	const action = e?.Action ?? 'backup'
	const isRestore =
		typeof action === 'string' && action.toLowerCase().trim() === 'restore'

	if (isRestore) {
		try {
			await performRestore(uri, key)
			console.log('Successfully restored:', key)
			process.exit()
		} catch (e) {
			console.error('Could not restore:', e.message)
			process.exit(1)
		}
	}

	try {
		await performBackup(uri, key)
		// Continue the deployment
		if (lifecycleEventHookExecutionId)
			await resumeDeployment(backupId, lifecycleEventHookExecutionId)
		console.log('Successfully backed up:', key)
		process.exit()
	} catch (e) {
		console.error('Could not backup:', e.message)
		// Stop the deployment on error
		if (lifecycleEventHookExecutionId)
			await stopDeployment(deploymentId, lifecycleEventHookExecutionId)
		process.exit(1)
	}
}
