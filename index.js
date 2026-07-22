const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// 1. Initialize Discord Client with necessary gateway intents (Guilds & Voice States)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

// 2. Setup Commands Collection
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

// Check if commands directory exists, if not create it
if (!fs.existsSync(commandsPath)) {
    fs.mkdirSync(commandsPath, { recursive: true });
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const commandArray = [];

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commandArray.push(command.data.toJSON());
        console.log(`📦 Loaded command: /${command.data.name}`);
    } else {
        console.log(`⚠️ The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// 3. Client Ready Event & Slash Command Registration
client.once('ready', async () => {
    console.log(`🤖 Logged in successfully as ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('🔄 Started refreshing application (/) commands.');

        // Register commands globally (or locally if GUILD_ID is specified)
        if (process.env.CLIENT_ID) {
            if (process.env.GUILD_ID) {
                await rest.put(
                    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                    { body: commandArray },
                );
                console.log('✨ Successfully reloaded guild-specific application commands.');
            } else {
                await rest.put(
                    Routes.applicationCommands(process.env.CLIENT_ID),
                    { body: commandArray },
                );
                console.log('✨ Successfully reloaded global application commands.');
            }
        }
    } catch (error) {
        console.error('❌ Error refreshing commands:', error);
    }
});

// 4. Interaction Create Listener (Handles all slash commands safely)
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
        console.error(`❌ No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`❌ Error executing ${interaction.commandName}:`, error);
        
        const errorMessage = { content: '❌ There was an error while executing this command!', ephemeral: true };
        
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(errorMessage).catch(() => {});
        } else {
            await interaction.reply(errorMessage).catch(() => {});
        }
    }
});

// 5. Log in to Discord using your bot token from environment variables

const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is active and running!\n');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🌐 Health check server listening on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
