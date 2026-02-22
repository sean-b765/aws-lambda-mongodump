import {
	CodeDeployClient,
	GetDeploymentCommand,
	PutLifecycleEventHookExecutionStatusCommand,
	StopDeploymentCommand,
} from '@aws-sdk/client-codedeploy'
import { region } from './utils.mjs'

const codedeploy = new CodeDeployClient({ region })

/**
 * @returns the AWS CodeDeploy deployment
 */
export async function getDeployment(deploymentId) {
	return await codedeploy.send(new GetDeploymentCommand({ deploymentId }))
}

/**
 * @returns the CodeDeploy ApplicationName, or null
 */
export async function getApplicationName(deploymentId) {
	try {
		const deployment = await getDeployment(deploymentId)
		if (!deployment) {
			return null
		} else {
			return deployment?.deploymentInfo?.applicationName
		}
	} catch {}
}

/**
 * Resumes the codedeploy deployment
 */
export async function resumeDeployment(
	deploymentId,
	lifecycleEventHookExecutionId,
) {
	const putLifecycleParams = {
		deploymentId,
		lifecycleEventHookExecutionId,
		status: 'Succeeded',
	}

	try {
		if (lifecycleEventHookExecutionId) {
			await codedeploy.send(
				new PutLifecycleEventHookExecutionStatusCommand(putLifecycleParams),
			)
		}
	} catch (e) {
		console.error('Unable to PutLifeCycle:', e.message)
	}
}

/**
 * Stops the codedeploy deployment
 */
export async function stopDeployment(
	deploymentId,
	lifecycleEventHookExecutionId,
) {
	const putLifecycleParams = {
		deploymentId,
		lifecycleEventHookExecutionId,
		status: 'Failed',
	}

	try {
		if (lifecycleEventHookExecutionId) {
			await codedeploy.send(
				new PutLifecycleEventHookExecutionStatusCommand(putLifecycleParams),
			)
		}
	} catch (e) {
		console.error('Unable to PutLifeCycle:', e.message)
	}

	try {
		await codedeploy.send(new StopDeploymentCommand({ deploymentId }))
	} catch (e) {
		console.error('Unable to stop deployment:', e.message)
	}
}
