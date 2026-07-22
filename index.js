const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');

// ==========================================
// 1. KEEP-ALIVE SERVER (FOR RENDER & CRON)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🏎️ Race Genie is live and operational!');
});

app.get('/ping', (req, res) => {
    res.status(200).send('PONG');
});

app.listen(PORT, () => {
    console.log(`🌐 Keep-alive server running on port ${PORT}`);
});

// ==========================================
// 2. INITIALIZE DISCORD CLIENT
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates // Required for Voice Channels & Commentator
    ]
});

client.commands = new Collection();
const commandsData = [];

// ==========================================
// 3. LOAD SLASH COMMANDS FROM /commands
// ==========================================
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commandsData.push(command.data.toJSON());
                console.log(`✅ Loaded command: ${command.data.name}`);
            } else {
                console.log(`⚠️ Warning: ${file} is missing required "data" or "execute" properties.`);
            }
        } catch (err) {
            console.error(`❌ Error loading command file ${file}:`, err);
        }
    }
} else {
    console.warn(`⚠️ Commands directory not found at: ${commandsPath}`);
}

// ==========================================
// 4. AUTOMATIC INSTANT GUILD COMMAND DEPLOY
// ==========================================
async function registerCommands() {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;

    if (!token || !clientId) {
        console.error('❌ DISCORD_TOKEN or CLIENT_ID environment variables are missing!');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(token);

    try {
        // Automatically fetch joined servers to register instant guild commands
        const guilds = client.guilds.cache;

        if (guilds.size > 0) {
            for (const [guildId, guild] of guilds) {
                console.log(`⚡ Deploying ${commandsData.length} slash commands INSTANTLY to Guild: ${guild.name} (${guildId})...`);
                await rest.put(
                    Routes.applicationGuildCommands(clientId, guildId),
                    { body: commandsData }
                );
            }
            console.log('✅ Guild slash commands registered INSTANTLY!');
        } else {
            console.log(`🚀 No guilds cached yet, registering ${commandsData.length} commands globally...`);
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commandsData }
            );
        }
    } catch (error) {
        console.error('❌ Failed to register slash commands:', error);
    }
}

// ==========================================
// 5. EVENT LISTENERS
// ==========================================
client.once('ready', async () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
    client.user.setActivity('GT7 | Future Champions', { type: 0 });
    await registerCommands();
});

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
        
        const errorMessage = { content: '❌ An error occurred while executing this command!', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// ==========================================
// 6. LOGIN
// ==========================================
client.login(process.env.DISCORD_TOKEN);
