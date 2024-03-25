import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
  ButtonStyleTypes,
  ChannelTypes,
} from 'discord-interactions';
import { VerifyDiscordRequest, getRandomEmoji, DiscordRequest, codeBlockify } from './utils.js';
import { getShuffledOptions, getResult } from './game.js';
import { discordSocketInit } from './gateway.js';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// Parse request body and verifies incoming requests using discord-interactions package
app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));

// Store for in-progress games. In production, you'd want to use a DB
const activeGames = {};

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 */
app.post('/interactions', async function (req, res) {
  // Interaction type and data
  const { type, id, data, member } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;
    console.log('[APP COMMAND]', name)

    // "test" command
    if (name === 'test') {
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          // Fetches a random emoji to send from a helper function
          content: 'hello world ' + getRandomEmoji(),
        },
      });
    }

    if (name === 'challenge') {
      console.log('[BODY]', req.body)
      const objectName = data.options[0].value
      const userId = member.user.id
      const userName = member.user.username
      activeGames[userId] = { id: userId, objectName, userName }
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `${member.user.username} selected ${objectName}`,
          components: [
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  custom_id: `game_${userId}`,
                  type: MessageComponentTypes.BUTTON,
                  label: 'Accept Challenge',
                  style: ButtonStyleTypes.PRIMARY
                }
              ]
            }
          ]
        }
      })
    }

    if (name === 'help_me') {

      const dmURL = `users/@me/channels`
      try {

        await res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          flags: InteractionResponseFlags.EPHEMERAL,
          data: {
            content: 'Help is on the way!'
          }
        })

        const channelRes = await DiscordRequest(dmURL, { method: 'POST', body: { recipient_id: member.user.id } })
        const dmChannel = await channelRes.json()
        const messageUrl = `channels/${dmChannel.id}/messages`
        await DiscordRequest(messageUrl, {
          method: 'Post', body: {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            content: "Sorry to see you're having trouble, Tell me what's going on",
          }
        })
      } catch (error) {
        console.error('help failed', error)
      }
    }

  }


  if (type === InteractionType.MESSAGE_COMPONENT) {
    const customId = data.custom_id

    if (customId === 'asking_for_help') {
      console.log(`${member.user.username} needs help`, member, data)
    }
    try {
      const response = res.send(
        {
          type: InteractionResponseType.MODAL,
          data: {
            title: "Help Please",
            custom_id: `help_request_${member.user.id}`,
            components: [{
              type: MessageComponentTypes.ACTION_ROW,
              components: [{
                type: MessageComponentTypes.INPUT_TEXT,
                custom_id: "problem",
                label: "What is going on?",
                style: 2, //paragraph style
                min_length: 50,
                max_length: 4000,
                placeholder: "What are you working on? what is it doing? How does that differ from your expectations?",
                required: true
              }]
            }]
          }
        })
      console.log(response)
    } catch (error) {
      console.error('modal error', error);
    }

  }

  if (type === InteractionType.MODAL_SUBMIT) {
    console.log('modal submitted', data, member)

    if (data.custom_id.startsWith('help_request')) {
      const memberId = data.custom_id.replace('help_request_', '')
      const memberName = member.nick || member.user.username
      const requestContent = data.components[0].components[0].value

      // Gets channels to see if this member already has a help channel
      const guildChannels = await (await DiscordRequest(`guilds/388855868965257216/channels`, { method: 'GET' })).json()
      console.log('', guildChannels)
      const channelName = memberName.replace(/ /g, '-').toLowerCase()
      let channel = guildChannels.find(channel => channel.name.includes(channelName))

      if (!channel) {
        // Create channel for help
        let channelCreateURL = `/guilds/388855868965257216/channels`
        let channelRes = await DiscordRequest(channelCreateURL, {
          method: 'POST',
          body: {
            name: `help_${memberName}`,
            parent_id: '1221321277546172478',
            type: 0, // text channel,,
            permission_overwrites: [
              { id: memberId, type: 1, allow: 0x800 | 0x400 },
              { id: '1221303786451238943', type: 0, allow: 0x8 },
              { id: '388855868965257216', type: 0, deny: 0x400 }
            ]
          }
        })
        channel = await channelRes.json()
        console.log('create Channel', channel);
      }

      const embed = {
        color: 0x0099ff,
        description: requestContent,
        author: {
          name: memberName,
          icon_url: `https://cdn.discordapp.com/avatars/${memberId}/${member.avatar || member.user.avatar}.png`,
        },
        timestamp: new Date().toISOString(),
      };

      // sends message to help channel
      const message = await (await DiscordRequest(`channels/${channel.id}/messages`, {
        method: 'POST',
        body: {
          embeds: [embed],
          content: '@everyone Please add any more information about your problem bellow, please include things like error messages from the console, responses from the network tab, screen shots or code blocks.'
        }
      }))

      const inviteUrl = `/channels/${channel.id}/invites`
      const invite = await (await DiscordRequest(inviteUrl, { method: 'POST', body: {} })).json()
      console.log('invite', invite)

      // respond with private message to user submitted with invite to new channel
      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.EPHEMERAL,
          content: 'we have be notified',
          components: [{
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              {
                label: 'Help Channel',
                type: MessageComponentTypes.BUTTON,
                url: `https://discord.gg/${invite.code}`,
                style: ButtonStyleTypes.LINK
              }
            ]
          }]
        }
      })


    }
  }

});





app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});

async function postRequestHelp() {
  try {
    const helpChannelUrl = `/channels/1221446545300521060/messages`
    const res = await DiscordRequest(helpChannelUrl, { method: 'GET' })
    const messages = await res.json()
    console.log('✉️', messages);

    const postRes = await DiscordRequest(helpChannelUrl, {
      method: 'POST',
      body: {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        content: "Looking for help after hours? start here!",
        components: [
          {
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              {
                type: MessageComponentTypes.BUTTON,
                label: 'Ask for Help',
                custom_id: `asking_for_help`,
                style: 1
              }
            ]
          }
        ]
      }
    })
  } catch (error) {
    console.error("can't post help", error)
  }
}

// postRequestHelp() // posts original help anchor
// const ws = discordSocketInit() // connects sockets for listening in on guild events

// if (process.env.NODE_ENV == 'dev') {
//   runNgrok()
// }


