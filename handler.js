const _ = require('lodash')
const {KMS} = require('aws-sdk')
const kms = new KMS()
const asana = require('asana')
const JiraApi = require('jira-client')

const getAsanaClient = async () => {
  const data = await kms.decrypt({CiphertextBlob: Buffer(process.env.ASANA_TOKEN, 'base64')}).promise()
  const asanaToken = String(data.Plaintext)
  return asana.Client.create().useAccessToken(asanaToken)
}

const getJIRAClient = async () => {
  const data = await kms.decrypt({CiphertextBlob: Buffer(process.env.JIRA_PASSWORD, 'base64')}).promise()
  const jiraPassword = String(data.Plaintext)
  return new JiraApi({
    protocol: 'https',
    host: process.env.JIRA_HOST,
    username: process.env.JIRA_USERNAME,
    password: jiraPassword,
    apiVersion: '2',
    strictSSL: true
  })
}

const searchExistsJIRAIssue = async (jiraClient, asanaURL) => {
  const searchResults = await jiraClient.searchJira(`"Asana Task" = "${asanaURL}"`)
  if (searchResults.total > 0) {
    const issue = searchResults.issues[0]
    return `https://${process.env.JIRA_HOST}/browse/${issue['key']}`
  }

  return null
}

const processAsanaStory = async (asanaClient, jiraClient, event) => {
  try {
    const asanaProjectId = process.env.ASANA_PROJECT_ID
    const story = await asanaClient.stories.findById(event.resource.gid)

    if (story.type === 'system') {
      return
    }

    const task = await asanaClient.tasks.findById(story.target.id)
    const asanaURL = `https://app.asana.com/0/${asanaProjectId}/${task.id}`

    const issueParams = {
      fields: {
        project: {
          id: process.env.JIRA_PROJECT_ID
        },
        summary: story.target.name,
        issuetype: {
          id: process.env.JIRA_STORY_ISSUE_ID
        },
        description: task.notes,
      }
    }
    issueParams.fields[process.env.JIRA_ASANA_FIELD_ID] = asanaURL

    let makeJiraIssue = false
    if (story.text.match(/^\/make jira$/)) {
      makeJiraIssue = true
    } else if (story.text.match(/^\/make jira bug$/)) {
      issueParams.fields.issuetype.id = process.env.JIRA_BUG_ISSUE_ID
      makeJiraIssue = true
    }

    if (makeJiraIssue) {
      let jiraIssueUrl = await searchExistsJIRAIssue(jiraClient, asanaURL)
      if (!jiraIssueUrl) {
        const issue = await jiraClient.addNewIssue(issueParams)
        jiraIssueUrl = `https://${process.env.JIRA_HOST}/browse/${issue['key']}`
        await asanaClient.stories.createOnTask(task.id, {text: `JIRA ISSUE: ${jiraIssueUrl}`})
      }

      console.log(jiraIssueUrl)
    }
  } catch (e) {
    console.error(e)
  }
}

module.exports.asanaIncommingWebhook = (event, context, callback) => {
  console.log(event)
  if (event.headers['X-Hook-Secret']) {
    // handshake response
    callback(null, {
      statusCode: 204,
      headers: {
        'X-Hook-Secret': event.headers['X-Hook-Secret']
      }
    })
    return
  }

  const payload = JSON.parse(event.body)
  const storyAddedEvents = _.filter(payload.events, {action: 'added', resource: { resource_type: 'story', resource_subtype: 'comment_added' }})

  let asanaClient = null
  let jiraClient = null
  getAsanaClient().then(client => {
    asanaClient = client
    return getJIRAClient()
  }).then(client => {
    jiraClient = client
    const promises = []
    for (let event of storyAddedEvents) {
      promises.push(processAsanaStory(asanaClient, jiraClient, event))
    }
    return Promise.all(promises)
  }).then(() => {
    callback(null, {
      statusCode: 204
    })
  }).catch((e) => {
    console.error(e)
    callback(e, {
      statusCode: 500
    })
  })
}

const processJIRAWebHook = async (asanaURL) => {
  const client = await getAsanaClient()
  const m = asanaURL.match(/https:\/\/app\.asana\.com\/0\/\d+\/(\d+)/)
  if (m) {
    const taskId = m[1]
    const task = await client.tasks.findById(taskId)
    await client.stories.createOnTask(task.id, {text: `JIRA ISSUE CLOSED`})
    await client.tasks.update(task.id, {completed: true})
  }
}

module.exports.jiraIncommingWebhook = (event, context, callback) => {
  const payload = JSON.parse(event.body)
  const asanaURL = payload.issue.fields[process.env.JIRA_ASANA_FIELD_ID]
  if (asanaURL) {
    processJIRAWebHook(asanaURL).then(() => {
      callback(null, {statusCode: 204});
    }).catch(e => {
      console.error(e)
      callback(e, {statusCode: 500})
    })

    return
  }
  callback(null, {statusCode: 204});
}
