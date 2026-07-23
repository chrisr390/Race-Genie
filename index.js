const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');
require('dotenv').config();

// 1. Render Health Check Server (keeps Render port binding happy)
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('Race Genie is running!');
  res.end();
}).listen(PORT, () => {
  console.log(`🌐 Health check server listening on port ${PORT}`);
});

// 2. Initialize Clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ]
});

// Helper for Admin Logging
async function logToAdminChannel(logMessage) {
  try {
    if (process.env.ADMIN_LOG_CHANNEL_ID) {
      const channel = await client.channels.fetch(process.env.ADMIN_LOG_CHANNEL_ID);
      if (channel && channel.isTextBased()) {
        await channel.send({ content: logMessage });
      }
    }
  } catch (err) {
    console.error("Admin log error:", err);
  }
}

// 3. Register Slash Commands Directly on Startup
client.once('ready', async () => {
  console.log(`🤖 Logged in successfully as ${client.user.tag}!`);

  const commands = [
    {
      name: 'setup',
      description: 'Generate a customized GT7 car setup sheet.',
      options: [
        { name: 'car', description: 'Car Model & Year', type: 3, required: true },
        { name: 'track', description: 'Track Name & Layout', type: 3, required: true },
        {
          name: 'drivetrain',
          description: 'Drivetrain layout',
          type: 3,
          required: true,
          choices: [
            { name: 'FF (Front-Engine, Front-Wheel Drive)', value: 'FF' },
            { name: 'FR (Front-Engine, Rear-Wheel Drive)', value: 'FR' },
            { name: 'MR (Mid-Engine, Rear-Wheel Drive)', value: 'MR' },
            { name: 'AWD (All-Wheel Drive)', value: 'AWD' },
            { name: 'RR (Rear-Engine, Rear-Wheel Drive)', value: 'RR' }
          ]
        },
        {
          name: 'tyres',
          description: 'Tyre Compound',
          type: 3,
          required: true,
          choices: [
            { name: 'Racing Hard (RH)', value: 'RH' },
            { name: 'Racing Medium (RM)', value: 'RM' },
            { name: 'Racing Soft (RS)', value: 'RS' },
            { name: 'Intermediate / Wet', value: 'WET' }
          ]
        },
        { name: 'handling_issue', description: 'Primary issue to resolve', type: 3, required: false },
        { name: 'screenshot', description: 'Garage tuning sheet screenshot', type: 11, required: false }
      ]
    },
    {
      name: 'commentator',
      description: 'Manage the live voice race commentator',
      options: [
        { name: 'join', description: 'Join your current voice channel', type: 1 },
        { name: 'leave', description: 'Leave the voice channel', type: 1 }
      ]
    }
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('✨ Refreshing guild slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Registered /setup and /commentator successfully!');
  } catch (error) {
    console.error('Command registration error:', error);
  }
});

// 4. Unified Interaction Handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // --- FEATURE 1: GT7 RACE ENGINEER SETUP GENERATOR ---
  if (interaction.commandName === 'setup') {
    await interaction.deferReply({ ephemeral: true });

    const car = interaction.options.getString('car');
    const track = interaction.options.getString('track');
    const drivetrain = interaction.options.getString('drivetrain');
    const tyres = interaction.options.getString('tyres');
    const issue = interaction.options.getString('handling_issue') || 'General balance and pace optimization';
    const screenshot = interaction.options.getAttachment('screenshot');

    try {
      const model = genAI.getGenerativeAIModel({ model: 'gemini-2.5-flash-lite' });

      let prompt = `You are an expert Gran Turismo 7 (GT7) Race Engineer calibrated with FLUX89 physics rules. 
Provide precise tuning advice for:
- Car: ${car}
- Drivetrain: ${drivetrain}
- Track: ${track}
- Tyres: ${tyres}
- Issue: ${issue}

Format into clear sections: Suspension, Differential/LSD, Downforce, Power/Transmission, and Driving Technique.`;

      let result;
      if (screenshot) {
        const imageResp = await fetch(screenshot.url);
        const arrayBuffer = await imageResp.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString('base64');

        result = await model.generateContent([
          prompt + "\nAnalyze the attached garage tuning screenshot and recommend specific adjustments based on current numbers.",
          { inlineData: { data: base64Image, mimeType: screenshot.contentType || 'image/png' } }
        ]);
      } else {
        result = await model.generateContent(prompt);
      }

      const adviceText = result.response.text();
      const user = interaction.user;
      const chunks = adviceText.match(/[\s\S]{1,1900}/g) || [adviceText];

      await user.send(`🏎️ **GT7 Race Engineer Setup Sheet**\n**Car:** ${car} | **Track:** ${track} | **Tyres:** ${tyres}`);
      for (const chunk of chunks) {
        await user.send(chunk);
      }

      await interaction.editReply({ content: "🏁 *Check your DMs for the setup sheet.*" });
      await logToAdminChannel(`📋 **Setup Generated:** ${user.tag} | Car: ${car} | Track: ${track} | Tyres: ${tyres}`);

    } catch (e) {
      console.error("Setup generation error:", e);
      await interaction.editReply({ content: "⚠️ *Engineering link dropped. Please try again.*" });
    }
  }

  // --- FEATURE 2: VOICE COMMENTATOR ---
  if (interaction.commandName === 'commentator') {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'join') {
      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel) {
        return interaction.reply({ content: '❌ You must be in a voice channel first!', ephemeral: true });
      }

      try {
        joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfDeaf: false,
          selfMute: false
        });

        await interaction.reply({ content: `🎙️ **Commentator connected to ${voiceChannel.name}!**`, ephemeral: true });
      } catch (err) {
        console.error("Voice join error:", err);
        await interaction.reply({ content: '❌ Failed to connect to the voice channel.', ephemeral: true });
      }

    } else if (subcommand === 'leave') {
      const connection = getVoiceConnection(interaction.guild.id);
      if (!connection) {
        return interaction.reply({ content: '❌ The commentator is not in a voice channel.', ephemeral: true });
      }

      connection.destroy();
      await interaction.reply({ content: '👋 **Commentator left the voice channel.**', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
