const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// 1. Initialize Express web server for Render keep-alive
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Race Genie is online!'));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// 2. Initialize Discord Client FIRST
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

// 3. Load Command Files
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        }
    }
}

// 4. Function to Register Slash Commands
async function registerCommands() {
    try {
        const commands = Array.from(client.commands.values()).map(c => c.data.toJSON());
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        console.log('🔄 Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('✅ Slash commands registered successfully!');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}

// 5. Ready Event Listener
client.once('ready', async () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
    client.user.setActivity('GT7 | Future Champions', { type: 0 });
    await registerCommands();
});

// 6. Interaction Event Listener
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`❌ Error executing ${interaction.commandName}:`, error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
        }
    }
});

// 7. Login
client.login(process.env.DISCORD_TOKEN);
