# MongoDB + AWS CodeDeploy automated backups via AWS Lambda

![plan.drawio.png](plan.drawio.png)

Backups are automatically triggered before a deployment, in AWS CodeDeploy `BeforeInstall` step. In this step, our Lambda function is invoked to run `mongodump`.

Snapshots are taken and named the AWS CodeDeploy `Deployment Id (eg: "d-ABCDEFG-123.archive")`. The snapshots reflect the database state _before_ the deployment happens, before any database migrations run.

Snapshots stored in S3:

```sh
s3://your-backup-bucket/backups/applicationName/deploymentId.archive
```

## Usage

### Payload

```ts
{
  ApplicationName: string
  // Default: "backup"
  Action?: "backup" | "restore" | undefined
  // Default: new Date().toISOString()
  DeploymentId?: string | undefined
  // Default: undefined
  // Note: if given, we assume it's a valid AWS CodeDeploy deployment
  LifecycleEventHookExecutionId?: string | undefined
}
```

### Environment Variables

- `MONGO_URI_SECRET_ID`: used to connect to your db to perform `mongodump` and `mongorestore`. This should align with a JSON in **AWS SecretsManager** with `{ mongo_uri }`
- `BUCKET_NAME`
- `AWS_REGION`

### Manual Invocation:

```bash
aws lambda invoke --function-name backup-restore-function --payload '{ "ApplicationName": "MyApplication" }' --cli-read-timeout 600 --cli-binary-format raw-in-base64-out out.txt
```

This will create the s3 object: `backups/MyApplication/YYYY-MM-DDT00:00:00.000Z.archive`

### To restore:

```bash
aws lambda invoke --function-name backup-restore-function --payload '{ "ApplicationName": "MyApplication", "DeploymentId": "YYYY-MM-DDT00:00:00.000Z" "Action": "restore" }' --cli-read-timeout 600 --cli-binary-format raw-in-base64-out out.txt
```

This will restore the database using the s3 object: `backups/MyApplication/YYYY-MM-DDT00:00:00.000Z.archive`

**NOTE** that `--cli-read-timeout 600` is required as it takes a while. After 1 minute, the AWS CLI attempts to invoke again because it detects a timeout.

## Docs / Planning

The flow is this:

1. Backend code pushed
2. Deploy with AWS CodeDeploy
   - `BeforeInstall`: perform the backup
   - Backup uploaded to S3
   - `ContinueDeployment`
   - `Install`: places the task (new backend version deployed)
     ...
3. On an unsuccessful deployment, restore manually.

https://docs.aws.amazon.com/codedeploy/latest/userguide/reference-appspec-file-structure-hooks.html#reference-appspec-file-structure-hooks-list-ecs

`BeforeInstall` – You can use this deployment lifecycle event for preinstall tasks, such as decrypting files and creating a backup of the current version.

A successful deployment looks like:
| Lifecycle Event | Duration | Status | Start Time (UTC+8:00) | End Time (UTC+8:00) |
| :--------------------- | :----------- | :------------------------------------------- | :-------------------- | :------------------- |
| **BeforeInstall** | < 1 second | <span style="color: green;">Succeeded</span> | Dec 15, 2025 2:50 PM | Dec 15, 2025 2:50 PM |
| **Install** | 3 min 23 sec | <span style="color: green;">Succeeded</span> | Dec 15, 2025 2:50 PM | Dec 15, 2025 2:53 PM |
| **AfterInstall** | < 1 second | <span style="color: green;">Succeeded</span> | Dec 15, 2025 2:53 PM | Dec 15, 2025 2:53 PM |
| **BeforeAllowTraffic** | < 1 second | <span style="color: green;">Succeeded</span> | Dec 15, 2025 2:57 PM | Dec 15, 2025 2:57 PM |
| **AllowTraffic** | < 1 second | <span style="color: green;">Succeeded</span> | Dec 15, 2025 2:57 PM | Dec 15, 2025 2:57 PM |
| **AfterAllowTraffic** | < 1 second | <span style="color: green;">Succeeded</span> | Dec 15, 2025 2:57 PM | Dec 15, 2025 2:57 PM |
