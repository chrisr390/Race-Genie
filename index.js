const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');

// ==========================================
// 1. EXPRESS SERVER (KEEPS UPTIMEROBOT GREEN)
// ==========================================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Race Genie is online and awake!');
});

app.listen(PORT, () => {
    console.log(`HTTP Web Server listening on port ${PORT}`);
});

// ==========================================
// 2. DISCORD CLIENT INITIALIZATION
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

client.commands = new Collection();
const commands = [];

// ==========================================
// 3. LOAD COMMANDS FROM THE /commands FOLDER
// ==========================================
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            commands.push(command.data.toJSON());
            console.log(`Loaded command: /${command.data.name}`);
        }
    }
}

// ==========================================
// 4. REGISTER SLASH COMMANDS ON READY
// ==========================================
client.once('ready', async () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Registering slash commands with Discord...');

        // Global command registration across all servers
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log('Successfully registered all (/) slash commands!');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
});

// ==========================================
// 5. HANDLE INTERACTION EXECUTION
// ==========================================
client.on('interactionCreate', async (interaction) => {
    // Only process slash commands here
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing /${interaction.commandName}:`, error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
        }
    }
});

// ==========================================
// 6. LOG IN TO DISCORD
// ==========================================
client.login(process.env.DISCORD_TOKEN);
