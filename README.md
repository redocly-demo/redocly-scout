# Redocly Scout

![logo](https://github.com/redocly-demo/redocly-scout/assets/3975738/f719d8af-fd5a-4752-9709-7501f7245c9d)

Redocly Scout is a discovery and publishing tool for APIs and documentation. It is designed to be deployed in a customer's infrastructure and to be used with Blue Harvest and Redocly Registry.

## Prerequisites

### Redocly portal
1. Browse to your portal in Blue Harvest inside your organization
2. Copy your organization ID and portal ID from the URL:
`https://{blueharvest-url}/org/{orgId}/portal/{portalId}`
3. Use these values as `REDOCLY_ORG_ID` and `REDOCLY_PORTAL_ID` in Scout env configuration

### Organization level API key

Use Blue Harvest:

1. Go to your organization page
2. Click on the `API keys` tab in the left menu
3. Click the `New key` button
4. Specify the key name and click the `Save` button
5. Copy the generated key and use it as `REDOCLY_API_KEY` in your Scout env configuration

### GitHub application

To run Scout in GitHub, you need to setup a GitHub application.

1. Create a new application `https://{github-server-url}/organizations/{org}/settings/apps`
2. Fill required fields
    - Github App name: `Redocly Scout`
    - Homepage URL: `https://redocly.com`
    - Webhook URL: `https://{scout-url}/webhooks/github`
    - Secret: any value, you need to provide same value to Scout config WEBHOOK_SECRET field
    - Repository permissions:
      - Contents: `read and write`
      - Pull requests: `read and write`
      - Commit statuses: `read and write`
    - User permissions:
      - Email addresses: `read-only`
    - Subscribe to events: `PullRequest`, `Push`
    - Where can this GitHub App be installed: `Any account`
3. Scroll down to Private keys and generate a new private key
4. Go to Optional features -> Activate optional features for Redocly Scout -> User-to-server token expiration -> toggle `Opt-in`

### GitLab

To run Scout in GitLab, you need to create new user on behalf on which scout will make operations on connected repository.

1. Create a new user by following these [instructions](https://docs.gitlab.com/ee/user/profile/account/create_accounts.html).
2. Add newly created user as a member of projects or groups you want to sync with Blue Harvest - remember to set user role as `Maintainer`.
3. Sign in into newly created user account and [create personal access token](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html#create-a-personal-access-token)(scopes: `api`) - save it for future use.
4. Go to `https://{gitlab-server-url}/api/v4/users?username={username}` (username of a user on behalf of which scout will make actions on your repositories) - save id for future use.
5. [Configure GitLab webhook](https://docs.gitlab.com/ee/user/project/integrations/webhooks.html#configure-a-webhook-in-gitlab) for every project or group(gitlab Premium required) you want to sync with Blue Harvest:
  - URL: `https://{scout-url}/webhooks/gitlab`
  - Secret token is optional but if you want to provide one remember to save it for future use.
  - Triggers: `Push events` and `Merge request events`

## Build docker image

```shell
npm install
npm run build:docker
```

> NOTE: before you run `npm run build:docker` command, make the build script executable with the `chmod +x ./scripts/build.sh` command (on Linux-type systems).

## Local development

1. Clone repository `git clone git@github.com:Redocly/redocly-scout.git`
2. Copy `.env.example` with `cp .env.example .env` command
3. Populate created `.env` file with values
  - PORT - the port that application will be run on (default `8080`).
  - MAX_CONCURRENT_JOBS - the number of jobs that could be executed in parallel (default `2`).
  - AUTO_MERGE - merge a PR on a push to the main branch. One of [`true`, `false`] (default `false`).
  - API_FOLDER - the path in the repository that Scout looks for API definitions (default `/`).
  - DATA_FOLDER - the path to the folder where Scout stores temp data.
  - REDOCLY_API_URL - Redocly API base URL.
  - REDOCLY_API_KEY - Redocly organization API token.
  - REDOCLY_ORG_ID - Redocly organization ID.
  - REDOCLY_PORTAL_ID - Redocly portal ID.
  - REDOCLY_DEST_FOLDER_PATH - the path where Scout pushes discovered API definitions. The default value is `apis/{metadata.team}/{repoId}/{title}`. All metadata fields could be used as placeholder values with `metadata` prefix, for example `{metadata.team}`. Besides that you could use `{title}`, `{repoId}`, `{orgId}` values.
  - REDOCLY_JOB_CONTEXT - a job execution context. All metadata fields could be used as placeholder values with `metadata` prefix, for example `{metadata.team}`.
  - LOG_FORMAT - one of [`pretty`, `json`] (default `json`).
  - LOG_LEVEL - one of [`trace`, `debug`, `info`, `warn`, `error`, `fatal`] (default `info`).
  - GITHUB_PROVIDERS - JSON array of GitHub app configurations. Each configuration has the following fields:
    - `url` - GitHub instance url. Omit in case of GitHub cloud.
    - `appId` - GitHub application ID. `https://{github-server-url}/organizations/{org}/settings/apps` -> Redocly Scout -> `App ID`.
    - `appUserId` - GitHub application user that leaves Scout-related comments. `https://{github-server-url}/users/{app slug name}[bot]`
    - `privateKey` - GitHub application private key created during application configuration.
    - `webhookSecret` - GitHub webhook secret, created during application configuration.
  - GITLAB_PROVIDERS - JSON array of GitLab instance configurations. Each configuration has the following fields:
    - `url` - GitLab instance url. Omit in case of GitLab cloud.
    - `userId` - GitLab user id, instructions how to obtain it available in GitLab [section](#gitlab).
    - `privateToken` - GitLab private token generated on user account.
    - `webhookSecret` - GitLab webhook secret, the one you put as secret when creating webhook on GitLab.

> NOTE: You can keep your secrets as separate values. They can be referred to within the definition of other values:
> ```shell
> GITHUB_PROVIDERS='[{
>   "appId": "123",
>   "appUserId": "456",
>   "privateKey": "${MY_PRIVATE_KEY}",
>   "webhookSecret": "${MY_WH_SECRET}"
> }]'
> MY_PRIVATE_KEY='-----BEGIN RSA PRIVATE KEY-----
> MIIEp...6G2Hg==
> -----END RSA PRIVATE KEY-----'
> MY_WH_SECRET='my-secret'
> ```

4. Install dependencies
```shell
npm install
```
5. Start local dev server
```shell
npm run start
```
or run in debug mode
```shell
npm run start:debug
```
6. To receive webhooks events locally you need to expose your dev server to the Internet, you could use such tools as [ngrok](https://ngrok.com/) or [serveo](https://serveo.net/). The following is an example.
```shell
ssh -R 80:localhost:8080 serveo.net
```
