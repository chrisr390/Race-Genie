const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
require('dotenv').config();

// 1. Render Health Check Server
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('Race Genie is running!');
  res.end();
}).listen(PORT, () => {
  console.log(`🌐 Health check server listening on port ${PORT}`);
});

// 2. Initialize Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

// 3. Dynamically Load All Commands from /commands Directory
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`📦 Loaded command: ${command.data.name}`);
    } else {
      console.warn(`⚠️ The command at ${filePath} is missing "data" or "execute" property.`);
    }
  }
}

// 4. Register Commands with Discord API on Startup
client.once('ready', async () => {
  console.log(`🤖 Logged in successfully as ${client.user.tag}!`);

  const commandsArray = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('✨ Refreshing guild slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commandsArray }
    );
    console.log(`✅ Successfully registered ${commandsArray.length} slash commands!`);
  } catch (error) {
    console.error('Command registration error:', error);
  }
});

// 5. Route Interactions to Matching Command Files
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '⚠️ There was an error while executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: '⚠️ There was an error while executing this command!', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
