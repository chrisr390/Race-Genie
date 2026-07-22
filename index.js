const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const sodium = require('libsodium-wrappers'); // Required for Discord WebRTC voice encryption

// ==========================================
// 1. EXPRESS WEB SERVER (Render Keep-Alive)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Race Genie is online and operational!'));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// ==========================================
// 2. DISCORD CLIENT INITIALIZATION
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

// ==========================================
// 3. LOAD COMMAND FILES
// ==========================================
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
            console.warn(`⚠️ The command at ${filePath} is missing required "data" or "execute" property.`);
        }
    }
}

// ==========================================
// 4. SLASH COMMAND REGISTRATION
// ==========================================
async function registerCommands() {
    try {
        const commands = Array.from(client.commands.values()).map(c => c.data.toJSON());
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        
        console.log('🔄 Registering slash commands with Discord API...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('✅ Slash commands registered successfully!');
    } catch (error) {
        console.error('❌ Error registering slash commands:', error);
    }
}

// ==========================================
// 5. CLIENT READY EVENT
// ==========================================
client.once('ready', async () => {
    // Wait for voice encryption library to complete initialization
    await sodium.ready;
    console.log(`🤖 Logged in as ${client.user.tag}! Audio encryption (sodium) initialized.`);
    
    client.user.setActivity('GT7 | Future Champions', { type: 0 });
    await registerCommands();
});

// ==========================================
// 6. INTERACTION COMMAND HANDLER
// ==========================================
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
        
        const errorMsg = { content: '❌ There was an error executing this command!', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMsg);
        } else {
            await interaction.reply(errorMsg);
        }
    }
});

// ==========================================
// 7. BOT LOGIN
// ==========================================
client.login(process.env.DISCORD_TOKEN);
