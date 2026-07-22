const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. EXPRESS WEB SERVER (KEEPS RENDER ALIVE)
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

// In-Memory Storage for Welcome/Goodbye configs
client.welcomeConfig = null;
client.goodbyeConfig = null;

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
// 3. INTERACTION HANDLING (SLASH COMMANDS & MODALS)
// ==========================================
client.on('interactionCreate', async interaction => {

    // --- HANDLE SLASH COMMANDS ---
    if (interaction.isChatInputCommand()) {
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
        return;
    }

    // --- HANDLE STEWARD REPORT MODAL SUBMISSION ---
    if (interaction.isModalSubmit() && interaction.customId === 'steward_report_modal') {
        try {
            const raceInfo = interaction.fields.getTextInputValue('incident_race');
            const driversInvolved = interaction.fields.getTextInputValue('incident_drivers');
            const incidentDesc = interaction.fields.getTextInputValue('incident_desc');

            // Find steward channel by name
            const stewardChannel = interaction.guild.channels.cache.find(ch => ch.name === 'steward-review')
                || interaction.guild.channels.cache.find(ch => ch.name === 'stewards');

            const reportEmbed = new EmbedBuilder()
                .setTitle('🚨 NEW INCIDENT REPORT')
                .setDescription(`Submitted by ${interaction.user}`)
                .addFields(
                    { name: '🏁 Event & Lap', value: raceInfo, inline: false },
                    { name: '🏎️ Drivers Involved', value: driversInvolved, inline: false },
                    { name: '📝 Description & Replay Stamp', value: incidentDesc, inline: false }
                )
                .setColor('#FFCC00') // Warning Amber
                .setFooter({ text: 'Future Champions Social Club • Steward Panel' })
                .setTimestamp();

            if (stewardChannel) {
                await stewardChannel.send({ embeds: [reportEmbed] });
                await interaction.reply({ content: '✅ Your report has been submitted confidentially to the stewards.', ephemeral: true });
            } else {
                await interaction.reply({ 
                    content: '✅ Incident report submitted! *(Note: Create a `#steward-review` channel for automated logging).*', 
                    embeds: [reportEmbed], 
                    ephemeral: true 
                });
            }
        } catch (error) {
            console.error('Error handling steward modal submission:', error);
            await interaction.reply({ content: '❌ Error processing your incident report.', ephemeral: true });
        }
    }
});

// ==========================================
// 4. WELCOME & GOODBYE EVENT LISTENERS
// ==========================================

// --- WELCOME EVENT ---
client.on('guildMemberAdd', async (member) => {
    const config = client.welcomeConfig;
    
    // Find custom configured channel or fallback to a channel named 'welcome'
    const welcomeChannel = config?.channelId 
        ? member.guild.channels.cache.get(config.channelId)
        : member.guild.channels.cache.find(ch => ch.name === 'welcome');

    if (!welcomeChannel) return;

    const rawMessage = config?.message || 'Welcome {user} to {server}! Glad to have you with us on track.';
    const formattedMessage = rawMessage
        .replace(/{user}/g, member.toString())
        .replace(/{server}/g, member.guild.name);

    const welcomeEmbed = new EmbedBuilder()
        .setTitle('🏁 WELCOME TO FUTURE CHAMPIONS SOCIAL CLUB!')
        .setDescription(formattedMessage)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setColor('#4CE600') // FCSC Signature Lime Green
        .setFooter({ text: 'Future Champions Social Club • Clean & Competitive Racing' })
        .setTimestamp();

    welcomeChannel.send({ content: `Welcome ${member}!`, embeds: [welcomeEmbed] }).catch(console.error);
});

// --- GOODBYE EVENT ---
client.on('guildMemberRemove', async (member) => {
    const config = client.goodbyeConfig;

    // Find custom configured channel or fallback to a channel named 'goodbye'
    const goodbyeChannel = config?.channelId 
        ? member.guild.channels.cache.get(config.channelId)
        : member.guild.channels.cache.find(ch => ch.name === 'goodbye');

    if (!goodbyeChannel) return;

    const rawMessage = config?.message || '**{username}** has pulled into the pits and left the server. We wish them all the best on track! 🏁';
    const formattedMessage = rawMessage.replace(/{username}/g, member.user.username);

    const goodbyeEmbed = new EmbedBuilder()
        .setTitle('👋 MEMBER LEFT')
        .setDescription(formattedMessage)
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
