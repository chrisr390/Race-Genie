const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. EXPRESS WEB SERVER (KEEPS BOT AWAKE)
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
// 2. INITIALIZE DISCORD CLIENT
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers // Required for Welcome & Goodbye events
    ]
});

// Load Commands Dynamically
client.commands = new Collection();
const commands = [];
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
// 3. SLASH COMMAND HANDLING
// ==========================================
client.on('interactionCreate', async interaction => {
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
// 4. WELCOME & GOODBYE EVENT LISTENERS
// ==========================================

// --- WELCOME EVENT ---
client.on('guildMemberAdd', async (member) => {
    // Replace with your actual Welcome Channel ID (or set channel name in Discord)
    const welcomeChannel = member.guild.channels.cache.find(ch => ch.name === 'welcome') 
        || member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);

    if (!welcomeChannel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setTitle('🏁 WELCOME TO FUTURE CHAMPIONS SOCIAL CLUB!')
        .setDescription(`Welcome ${member}, glad to have you with us!\n\nCheck out the server rules and head over to the chat channels to get involved in upcoming race events.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setColor('#4CE600') // Signature Lime Green
        .setFooter({ text: 'Future Champions Social Club • Clean & Competitive Racing' })
        .setTimestamp();

    welcomeChannel.send({ content: `Welcome ${member}!`, embeds: [welcomeEmbed] }).catch(console.error);
});

// --- GOODBYE EVENT ---
client.on('guildMemberRemove', async (member) => {
    // Replace with your actual Goodbye Channel ID (or set channel name in Discord)
    const goodbyeChannel = member.guild.channels.cache.find(ch => ch.name === 'goodbye') 
        || member.guild.channels.cache.get(process.env.GOODBYE_CHANNEL_ID);

    if (!goodbyeChannel) return;

    const goodbyeEmbed = new EmbedBuilder()
        .setTitle('👋 MEMBER LEFT')
        .setDescription(`**${member.user.tag}** has left the server. We wish them all the best on track!`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setColor('#FF3333') // Red Accent
        .setFooter({ text: 'Future Champions Social Club' })
        .setTimestamp();

    goodbyeChannel.send({ embeds: [goodbyeEmbed] }).catch(console.error);
});

// ==========================================
// 5. BOT READY & REGISTER COMMANDS
// ==========================================
client.once('ready', async () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Registering (/) slash commands...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Successfully registered all (/) slash commands!');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);
