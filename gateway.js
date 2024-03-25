import { Client, Events, GatewayIntentBits, Partials } from 'discord.js'
import { DiscordRequest } from './utils.js';
import { InteractionResponseType, MessageComponentTypes } from 'discord-interactions';

const onGoingDms = {

}

export async function discordSocketInit() {
  try {
    const client = new Client({
      intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessageTyping
      ],
      partials: [
        Partials.Channel,
        // Partials.Message
      ]
    });

    client.once('ready', async readyClient => {
      console.log(`🦍 ${readyClient.user.username} ready`, readyClient);
    });
    client.on('messageReactionAdd', event => console.log('interaction', event))
    client.on('messageCreate', async message => {
      console.log('🛰️', message.id, message)
      const author = message.author.globalName
      if (message.channelId == '1221302119009615913') { // responding
        const originalChannel = onGoingDms[message.reference.messageId]
        const botHelpUrl = `/channels/${originalChannel}/messages`
        await DiscordRequest(botHelpUrl, {
          method: 'Post',
          body: {
            content: `[${author}] - ${message.content}`
          }
        })

      } else if (message.author.bot == false) { // forwarding
        const channel = client.channels.cache.get('1221302119009615913')

        console.log('📺', channel)
        // const botHelpUrl = `/channels/${channel.id}/messages`
        // const res = await DiscordRequest(botHelpUrl, {
        //   method: 'POST', body: {
        //     type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        //     content: `[${author}] - ${message.content}`,
        //   }
        // })
        // const data = await res.json()
        // onGoingDms[data.id] = message.channelId
      }
    });
    client.on('typingStart', typing => console.log('⌨️', typing))

    client.on(Events.Debug, event => console.log('🪲', event))
    client.on(Events.Error, error => console.error('❗', error))
    client.login(process.env.DISCORD_TOKEN);

  } catch (error) {
    console.error('websocket connect error', error)
  }
}