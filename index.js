const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const http = require('http');
const { DISCORD_TOKEN, PORT } = require('./config');
const { generateSetupAdvice } = require('./services/gemini');
const { getSession, updateSessionHistory, clearSession } = require('./services/session');

// Simple web server for Render health checks
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Race Genie running!\n');
}).listen(PORT, () => {
    console.log(`Health check server listening on port ${PORT}`);
});

/**
 * Splits a text into chunks of at most maxLength characters, split cleanly at newlines.
 */
function splitMessage(text, maxLength = 2000) {
    if (text.length <= maxLength) return [text];
    
    const chunks = [];
    let currentChunk = '';
    
    const lines = text.split('\n');
    for (const line of lines) {
        if (line.length > maxLength) {
            let remainingLine = line;
            while (remainingLine.length > 0) {
                const sliceLength = maxLength - currentChunk.length;
                currentChunk += remainingLine.slice(0, sliceLength);
                chunks.push(currentChunk);
                currentChunk = '';
                remainingLine = remainingLine.slice(sliceLength);
            }
        } else if ((currentChunk + line + '\n').length > maxLength) {
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = line + '\n';
        } else {
            currentChunk += line + '\n';
        }
    }
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks;
}

// Initialize Discord Client.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('GT7 Telemetry', { type: ActivityType.Watching });
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, user } = interaction;

    if (commandName === 'car-setup') {
        const car = interaction.options.getString('car');
        const track = interaction.options.getString('track');
        const weather = interaction.options.getString('weather') || 'Standard Dry';
        const drivetrain = interaction.options.getString('drivetrain');
        const frontDownforce = interaction.options.getString('front_downforce');
        const rearDownforce = interaction.options.getString('rear_downforce');
        const regulations = interaction.options.getString('regulations');
        const screenshot = interaction.options.getAttachment('screenshot');

        // Defer reply ephemerally in the channel so the user knows the bot is working
        await interaction.deferReply({ ephemeral: true });

        // Retrieve user session history
        const session = getSession(user.id);

        // Construct clean structured prompt for Gemini
        let userPrompt = `Request details:
- Car: ${car}
- Track: ${track}
- Weather/Conditions: ${weather}`;

        if (drivetrain) {
            userPrompt += `\n- Drivetrain Layout: ${drivetrain}`;
        }
        if (frontDownforce) {
            userPrompt += `\n- Front Downforce Limits/Targets: ${frontDownforce}`;
        }
        if (rearDownforce) {
            userPrompt += `\n- Rear Downforce Limits/Targets: ${rearDownforce}`;
        }
        if (regulations) {
            userPrompt += `\n- Tuning Regulations/Restrictions: ${regulations}`;
        }
        if (screenshot) {
            userPrompt += `\n- A screenshot of the current tuning sheet is attached.`;
        }

        try {
            const advice = await generateSetupAdvice(userPrompt, session.history, screenshot);

            // Update session history
            updateSessionHistory(user.id, userPrompt, advice);

            const responseText = `🏁 **YOUR PRIVATE SETUP SHEET:**\n\n${advice}`;
            const chunks = splitMessage(responseText);

            // Send the setup sheet directly to the user's private DMs
            for (const chunk of chunks) {
                await user.send({ content: chunk });
            }

            // Update the channel interaction so they know to check their inbox
            await interaction.editReply({
                content: "🏁 *Analysis complete! Your custom setup sheet has been sent directly to your DMs.*"
            });

        } catch (error) {
            console.error("Interaction Setup Error:", error);
            
            // Handle cases where the user has DMs blocked/turned off for the server
            if (error.code === 50007) {
                await interaction.editReply({
                    content: "⚠️ *I tried to DM you your setup, but your privacy settings are blocking direct messages from server members. Please enable DMs and try again!*"
                });
            } else {
                await interaction.editReply({
                    content: "⚠️ *Engineering telemetry link dropped. Please try again in a moment.*"
                });
            }
        }
    }

    if (commandName === 'reset') {
        const deleted = clearSession(user.id);
        if (deleted) {
            await interaction.reply({
                content: "🏁 *Race memory cleared. Setup cache is back to baseline.*",
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: "🏁 *You don't have any active setup session memory to clear.*",
                ephemeral: true
            });
        }
    }
});

client.login(DISCORD_TOKEN);
