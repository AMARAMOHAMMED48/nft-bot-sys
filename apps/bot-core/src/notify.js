const axios = require('axios')

async function notify(user, message) {
  if (!user.discordWebhook) return
  try {
    await axios.post(user.discordWebhook, { content: message })
  } catch {
    // ne pas planter le bot si Discord est down
  }
}

module.exports = { notify }
