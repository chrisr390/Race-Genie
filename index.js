const http = require('http');

// 1. HTTP Web Server for Render Free Tier Port Binding
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is active and running!\n');
}).listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Health check web server running on port ${PORT}`);
});

// 2. Load Discord & Application Modules
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

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
        console.log(`⚠️ Missing "data" or "execute" property in ${filePath}`);
    }
}

client.once('ready', async () => {
    console.log(`🤖 Logged in successfully as ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('🔄 Refreshing slash commands...');
        if (process.env.CLIENT_ID) {
            if (process.env.GUILD_ID) {
                await rest.put(
                    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                    { body: commandArray },
                );
                console.log('✨ Guild slash commands updated successfully.');
            } else {
                await rest.put(
                    Routes.applicationCommands(process.env.CLIENT_ID),
                    { body: commandArray },
                );
                console.log('✨ Global slash commands updated successfully.');
            }
        }
    } catch (error) {
        console.error('❌ Error refreshing commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('❌ Command Execution Error:', error);
        
        const errorMessage = { content: '❌ There was an error while executing this command!', ephemeral: true };
        
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(errorMessage).catch(() => {});
        } else {
            await interaction.reply(errorMessage).catch(() => {});
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
