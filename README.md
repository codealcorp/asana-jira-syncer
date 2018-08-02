# Asana <-> JIRA Syncer

This application provides way to sync task between [Asana](https://app.asana.com/) and [JIRA](https://www.atlassian.com/software/jira).

It's work on AWS Lambda with [serverless framework](https://serverless.com/).

## Story

Asana can make task very esay. JIRA can manage development task very well.

However sales team cannot make good task as JIRA issue, because JIRA is too complex for sales person.
(And JIRA's mobile support is too poor.)

So, we have decided to use Asana for proposal and discussion, and then developer can convert Asana task to
JIRA development issue by this product.

### Process

1. Make proposal as Asana task, and discuss it.
2. When developer decide to make it, they can convert to JIRA issue from Asana task by commenting `/make jira`
   (Also `/make jira bug` can make Bug issue.)
3. Develop with JIRA issue
4. When developer close JIRA issue, the Asana task also resolve.

## Installation

### Requirement

- AWS Account
- JIRA instance and account
- Asana personal access token (You can issue on My Profile Settings -> Apps -> Manage Developer Apps)
- serverless

### Install serverless and resolve dependencies

Install serverles:

```
npm install -g serverless
```

And resolve dependencies for this application.

```
npm install
```

### Make custom field to JIRA

Create `Asana Task` field as URL field.

### Make your configuration

Copy `config/sls-config.sample.yml` to `config/sls-config.yml`. And make your own configuration.

- jira.host: Your JIRA instance host.
- jira.username: Your JIRA account username
- jira.project_id: The ID of project for which this application creates issues.
- jira.story_issue_id: The ID of story issue type.
- jira.bug_issue_id: The ID of bug issue type for.
- jira.asana_field_id:  The ID of `Asana Task` field.
- asana.project_id: The Asana project ID to observe.

### Make secret configuration

You need get kms key in advance.

Copy `config/secure.sample.yml` to `config/secure.yml`.

And set your kms key arn to `keyArn` on `config/secure.yml`

Then you can encrypt your secret data:

```
sls ecnrypt -n ASANA_TOKEN -v 'YOUR_ASANA_TOKEN'
sls encrypt -n JIRA_PASSWORD -v 'YOUR_JIRA_ACCOUNT_PASSWORD'
```

### Deploy application

```
sls deploy
```

And you can get Webhook endpoint for Asana and JIRA.


### Make a Webhook configuration to Asana

```
curl -X POST \
  https://app.asana.com/api/1.0/webhooks \
  -H 'Authorization: Bearer YOUR_ASANA_TOKEN' \
  --data-urlencode "resource=YOUR_ASANA_PROJECT_ID" \
  --data-urlencode "target=WEBHOOK_END_POINT_FOR_ASANA"
```

### Make a Webhook configuration to JIRA

Set JIRA Webhook configuration on your workflow transition.
